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

function buildUrl(path, query) {
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
    if (!token) {
      return Promise.reject(new Error('未登录：本地没有 access_token，请确认已联网且微信登录成功'));
    }
    header.Authorization = `Bearer ${token}`;
  }
  const url = buildUrl(path, query);

  // 让“是否真正发出请求”在控制台可见（开发调试用）
  try {
    console.log('[http.request]', {
      method,
      url,
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
          console.log('[http.response]', { url, statusCode: res.statusCode, data: res.data });
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
          console.warn('[http.fail]', { url, err });
        } catch (e) {
          /* ignore */
        }
        reject(err);
      },
    });
  });
}

