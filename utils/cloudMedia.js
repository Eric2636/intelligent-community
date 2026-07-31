/**
 * 选择本地图片/视频并上传到腾讯云 COS，返回可直接用于 <image>/<video> src 的 HTTPS URL。
 */

import { buildUrl, getToken } from '~/api/http';

const DEFAULT_MAX_IMAGES = 9;
const DEFAULT_MAX_VIDEOS = 2;

const COS_MODULES = new Set(['forum', 'task', 'mall', 'avatar']);

/** 与后端 intelligent-community-admin/src/lib/media-url.ts 后缀白名单一致 */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp', 'mpeg', 'mpg', 'flv']);

function extFromPath(p) {
  const m = /\.(\w+)$/.exec(p || '');
  return m ? m[1].toLowerCase() : '';
}

/** folder 形如 forum/posts/img、task/publish/vid（与 chooseAndUploadMedia 传入的 folder + /img|/vid 一致） */
function parseCosFolder(folder) {
  const parts = String(folder || '')
    .split('/')
    .filter(Boolean);
  if (!parts.length) return { module: 'forum', type: 'img' };
  const last = parts[parts.length - 1];
  const type = last === 'vid' || last === 'img' ? last : 'img';
  const first = parts[0];
  const module = COS_MODULES.has(first) ? first : 'forum';
  return { module, type };
}

function assertFileExtAllowedForFolder(ext, folder) {
  const { type } = parseCosFolder(folder);
  const e = String(ext || '').toLowerCase();
  if (!e) {
    throw new Error('无法识别文件类型，请仅选择图片或视频');
  }
  const ok = type === 'vid' ? VIDEO_EXTS.has(e) : IMAGE_EXTS.has(e);
  if (!ok) {
    throw new Error(type === 'vid' ? '仅支持上传常见视频格式' : '仅支持上传常见图片格式');
  }
}

function normalizeWxTempFilePath(p) {
  const s = String(p || '').trim();
  if (!s) return s;
  // 某些基础库会返回 http(s)://tmp/...，但文件系统/上传 SDK 更期待 wxfile://tmp/...
  if (/^https?:\/\/tmp\//i.test(s)) return `wxfile://tmp/${s.replace(/^https?:\/\/tmp\//i, '')}`;
  return s;
}

function tryStat(path) {
  return new Promise((resolve) => {
    try {
      const fsm = wx.getFileSystemManager && wx.getFileSystemManager();
      if (!fsm || !fsm.stat) {
        resolve({ ok: true, path });
        return;
      }
      fsm.stat({
        path,
        success: () => resolve({ ok: true, path }),
        fail: () => resolve({ ok: false, path }),
      });
    } catch (_) {
      resolve({ ok: false, path });
    }
  });
}

async function resolveExistingFilePath(inputPath) {
  const s = String(inputPath || '').trim();
  if (!s) return '';

  const candidates = [];
  candidates.push(s);
  if (/^wxfile:\/\//i.test(s)) {
    const noScheme = s.replace(/^wxfile:\/\//i, '');
    candidates.push(noScheme);
    candidates.push(`/${noScheme}`.replace(/^\/+/, '/'));
  }
  // 兼容：有时是 tmp/xxx（无 scheme），补成 wxfile://tmp/xxx
  if (/^tmp\//i.test(s)) candidates.push(`wxfile://${s}`);
  if (/^\/tmp\//i.test(s)) candidates.push(`wxfile:/${s}`);

  // 去重
  const uniq = [];
  candidates.forEach((p) => {
    if (p && !uniq.includes(p)) uniq.push(p);
  });

  for (let i = 0; i < uniq.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await tryStat(uniq[i]);
    if (r.ok) return r.path;
  }

  throw new Error(`上传失败：找不到本地临时文件（${uniq.join(' | ')}）`);
}

function saveFilePromise(fsm, tempFilePath) {
  return new Promise((resolve, reject) => {
    fsm.saveFile({
      tempFilePath,
      success: (res) => resolve(res.savedFilePath || tempFilePath),
      fail: reject,
    });
  });
}

/**
 * 将 chooseMedia 等返回的临时文件立即保存到用户目录，避免等待 STS 等异步期间临时文件被回收。
 * 成功后原临时路径可能失效（与 saveFile 行为一致）。
 *
 * 注意：部分基础库下若把 http(s)://tmp/... 转成 wxfile://tmp/... 再传给 saveFile，会报
 * saveFile:fail permission denied；应优先使用接口返回的原始 temp 路径调用 saveFile。
 */
async function persistTempFileForUpload(tempFilePath) {
  const raw = String(tempFilePath || '').trim();
  const normalized = normalizeWxTempFilePath(tempFilePath);
  if (!normalized) {
    throw new Error('上传失败：文件路径为空');
  }
  const fsm = wx.getFileSystemManager && wx.getFileSystemManager();
  if (!fsm || typeof fsm.saveFile !== 'function') {
    return normalized;
  }

  const candidates = [];
  if (raw) candidates.push(raw);
  if (normalized && normalized !== raw) candidates.push(normalized);
  const uniq = candidates.filter((p, i) => p && candidates.indexOf(p) === i);

  let lastErr;
  for (let i = 0; i < uniq.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await saveFilePromise(fsm, uniq[i]);
    } catch (err) {
      lastErr = err;
    }
  }

  // 持久化失败时仍继续上传：直传临时文件，缩短 STS 等待可降低被系统回收的概率
  if (lastErr) {
    console.warn('[cloudMedia] saveFile 跳过，使用临时路径上传', lastErr);
  }
  return normalized;
}

function unlinkQuiet(filePath) {
  if (!filePath) return;
  try {
    const fsm = wx.getFileSystemManager && wx.getFileSystemManager();
    if (fsm && fsm.unlink) {
      fsm.unlink({ filePath });
    }
  } catch (_) {
    /* ignore */
  }
}

function formatUploadErr(err) {
  if (!err) return '上传失败';
  if (typeof err === 'string') return err;
  // COS SDK / wx.uploadFile 常见字段
  const msg =
    err.message ||
    err.error ||
    err.errMsg ||
    err.Code ||
    err.code ||
    err.name ||
    '上传失败';
  const detail = err.Code || err.code || err.statusCode || '';
  return detail ? `${msg} (${detail})` : msg;
}

function parseUploadResponse(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

function uploadFilePromise(filePath, module, type) {
  return new Promise((resolve, reject) => {
    const header = {};
    const token = getToken();
    if (token) header.Authorization = `Bearer ${token}`;
    const ext = extFromPath(filePath) || (type === 'vid' ? 'mp4' : 'jpg');
    wx.uploadFile({
      url: buildUrl('api/upload/media'),
      filePath,
      name: 'file',
      formData: { module, type, filenameHint: `media.${ext}` },
      header,
      success: (res) => {
        const data = parseUploadResponse(res.data);
        const url = data.url || (data.data && data.data.url);
        if (res.statusCode >= 400) {
          reject(new Error(data.message || data.hint || `HTTP ${res.statusCode}`));
          return;
        }
        if (!url) {
          reject(new Error(data.message || '上传失败'));
          return;
        }
        resolve(url);
      },
      fail: reject,
    });
  });
}

/**
 * @param {string[]} tempFilePaths
 * @param {string} folder 云目录前缀 + /img 或 /vid，如 forum/posts/img
 */
export async function uploadLocalFilesToCloud(tempFilePaths, folder) {
  const paths = Array.isArray(tempFilePaths) ? tempFilePaths.filter(Boolean) : [];
  if (!paths.length) return [];

  const folderMeta = parseCosFolder(folder);
  for (let i = 0; i < paths.length; i += 1) {
    const ext = extFromPath(paths[i]);
    if (ext || folderMeta.type === 'vid') assertFileExtAllowedForFolder(ext, folder);
  }

  const settled = await Promise.allSettled(paths.map((p) => persistTempFileForUpload(p)));
  const persisted = [];
  for (let i = 0; i < settled.length; i += 1) {
    const r = settled[i];
    if (r.status === 'rejected') {
      persisted.forEach(unlinkQuiet);
      throw r.reason;
    }
    persisted.push(r.value);
  }

  try {
    const { module, type } = folderMeta;
    const realPaths = await Promise.all(persisted.map((p) => resolveExistingFilePath(p)));

    const urls = await Promise.all(
      realPaths.map((realPath) => uploadFilePromise(realPath, module, type)),
    );

    return urls;
  } finally {
    persisted.forEach(unlinkQuiet);
  }
}

/**
 * 弹出系统相册/拍照，上传后返回 { images: fileID[], videos: fileID[] }
 * （字段名沿用原云开发习惯；现为 COS 公网 URL 字符串数组）
 */
export function chooseAndUploadMedia(options = {}) {
  const {
    folder = 'media',
    maxImages = DEFAULT_MAX_IMAGES,
    maxVideos = DEFAULT_MAX_VIDEOS,
    existingImageCount = 0,
    existingVideoCount = 0,
  } = options;

  const remainImg = Math.max(0, maxImages - existingImageCount);
  const remainVid = Math.max(0, maxVideos - existingVideoCount);
  if (remainImg <= 0 && remainVid <= 0) {
    wx.showToast({ title: '已达数量上限', icon: 'none' });
    return Promise.resolve({ images: [], videos: [] });
  }

  const count = Math.min(9, remainImg + remainVid);
  let mediaType = ['image', 'video'];
  if (remainVid <= 0) mediaType = ['image'];
  else if (remainImg <= 0) mediaType = ['video'];

  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType,
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      sizeType: ['compressed'],
      success: async (res) => {
        try {
          const imagePaths = [];
          const videoPaths = [];
          (res.tempFiles || []).forEach((f) => {
            if (f.fileType !== 'image' && f.fileType !== 'video') return;
            const isVideo = f.fileType === 'video';
            if (isVideo) {
              if (videoPaths.length < remainVid) videoPaths.push(f.tempFilePath);
            } else if (imagePaths.length < remainImg) {
              imagePaths.push(f.tempFilePath);
            }
          });
          if (imagePaths.length === 0 && videoPaths.length === 0) {
            resolve({ images: [], videos: [] });
            return;
          }
          wx.showLoading({ title: '上传中', mask: true });
          const [images, videos] = await Promise.all([
            uploadLocalFilesToCloud(imagePaths, `${folder}/img`),
            uploadLocalFilesToCloud(videoPaths, `${folder}/vid`),
          ]);
          wx.hideLoading();
          resolve({ images, videos });
        } catch (e) {
          wx.hideLoading();
          console.error(e);
          wx.showToast({ title: formatUploadErr(e), icon: 'none' });
          reject(e);
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          resolve({ images: [], videos: [] });
          return;
        }
        reject(err);
      },
    });
  });
}

export const MEDIA_LIMITS = {
  maxImages: DEFAULT_MAX_IMAGES,
  maxVideos: DEFAULT_MAX_VIDEOS,
};
