import config from '../config';
import { formatDateTimeFields } from '../utils/date';

const DEFAULT_TIMEOUT = 15000;
const MINI_API_ERROR_LOG_PATH = 'api/logs/mini-api-errors';

function getBaseUrl() {
  const app = getApp();
  const fromGlobal = app && app.globalData && app.globalData.apiBaseUrl;
  if (fromGlobal) return fromGlobal;
  if (config.apiBaseUrl) {
    return String(config.apiBaseUrl).replace(/\/+$/, '');
  }
  if (!config.useLocalDevApi && config.productionApiBase) {
    return String(config.productionApiBase).replace(/\/+$/, '');
  }
  if (config.devLanHost) {
    return `http://${config.devLanHost}:${config.devPort}`;
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

function getClientInfo() {
  try {
    const account = wx.getAccountInfoSync ? wx.getAccountInfoSync() : {};
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    return {
      platform: sys.platform || '',
      appVersion: account && account.miniProgram ? account.miniProgram.version || '' : '',
      sdkVersion: sys.SDKVersion || '',
      system: sys.system || '',
    };
  } catch (e) {
    return {};
  }
}

function reportMiniApiErrorLog({ method, path, url, query, data, statusCode, responseData, error }) {
  if (String(path || '').replace(/^\/+/, '') === MINI_API_ERROR_LOG_PATH) return;

  const header = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) header.Authorization = `Bearer ${token}`;

  const payload = {
    ...getClientInfo(),
    method,
    path,
    url,
    statusCode,
    errorMessage:
      (error && (error.message || error.errMsg)) ||
      (responseData && (responseData.message || responseData.hint)) ||
      `HTTP ${statusCode || 'FAIL'}`,
    requestData: { query: query || null, data: data || null },
    responseData: responseData || null,
    stack: error && error.stack ? String(error.stack) : '',
  };

  const send = (networkType) => {
    wx.request({
      url: buildUrl(MINI_API_ERROR_LOG_PATH),
      method: 'POST',
      data: { ...payload, networkType: networkType || '' },
      timeout: 5000,
      header,
      fail: () => {},
    });
  };

  try {
    wx.getNetworkType({
      success: (res) => send(res.networkType),
      fail: () => send(''),
    });
  } catch (e) {
    send('');
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

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout,
      header,
      success: (res) => {
        const code = res.statusCode;
        if (code != null && code >= 400) {
          const data = res.data && typeof res.data === 'object' ? res.data : {};
          const msg =
            data.message || data.hint || (typeof res.data === 'string' ? res.data : '') || `HTTP ${code}`;
          const err = new Error(msg);
          err.statusCode = code;
          err.body = data;
          reportMiniApiErrorLog({
            method,
            path,
            url,
            query,
            data,
            statusCode: code,
            responseData: data,
            error: err,
          });
          reject(err);
          return;
        }
        resolve(formatDateTimeFields(res.data));
      },
      fail: (err) => {
        try {
          console.warn('[http.fail]', { url, err });
        } catch (e) {
          /* ignore */
        }
        reportMiniApiErrorLog({
          method,
          path,
          url,
          query,
          data,
          statusCode: null,
          responseData: err,
          error: err,
        });
        reject(err);
      },
    });
  });
}
