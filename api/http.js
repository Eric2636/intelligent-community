import config from '../config';

const DEFAULT_TIMEOUT = 15000;

function getBaseUrl() {
  const app = getApp();
  const fromGlobal = app && app.globalData && app.globalData.apiBaseUrl;
  if (fromGlobal) return fromGlobal;
  if (!config.useLocalDevApi && config.productionApiBase) {
    return String(config.productionApiBase).replace(/\/+$/, '');
  }
  return `http://127.0.0.1:${config.devPort}`;
}

export function buildUrl(path, query) {
  const base = getBaseUrl().replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  const qs =
    query && typeof query === 'object'
      ? Object.keys(query)
          .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== '')
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
          .join('&')
      : '';
  return `${base}/${p}${qs ? `?${qs}` : ''}`;
}

/** 去掉首尾空白，并避免本地误存成「Bearer xxx」导致双重 Bearer */
function normalizeAccessToken(raw) {
  if (raw == null || raw === '') return '';
  let t = String(raw).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
  return t;
}

export function getToken() {
  try {
    return normalizeAccessToken(wx.getStorageSync('access_token'));
  } catch (e) {
    return '';
  }
}

export function request({ method = 'GET', path, query, data, auth = true, timeout = DEFAULT_TIMEOUT } = {}) {
  const header = { 'content-type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) header.Authorization = `Bearer ${token}`;
  }
  const url = buildUrl(path, query);
  const logPath = String(path || '').replace(/[?#].*$/, '');

  // 仅记录请求元数据；不记录 URL 查询串、请求体、Authorization 或 token。
  try {
    // eslint-disable-next-line no-console
    console.log('[http.request]', {
      method,
      path: logPath,
      auth,
      hasToken: Boolean(header.Authorization),
      timeout,
    });
  } catch (e) {
    /* ignore */
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout,
      header,
      success: (res) => {
        try {
          // eslint-disable-next-line no-console
          console.log('[http.response]', { method, path: logPath, statusCode: res.statusCode });
        } catch (e) {
          /* ignore */
        }
        const code = res.statusCode;
        if (code != null && code >= 400) {
          const data = res.data && typeof res.data === 'object' ? res.data : {};
          const msg =
            data.message || data.hint || (typeof res.data === 'string' ? res.data : '') || `HTTP ${code}`;
          const err = new Error(msg);
          err.statusCode = code;
          err.body = data;
          reject(err);
          return;
        }
        resolve(res.data);
      },
      fail: (err) => {
        try {
          console.warn('[http.fail]', { method, path: logPath });
        } catch (e) {
          /* ignore */
        }
        reject(err);
      },
    });
  });
}
