// app.js
import config from './config';
import createBus from './utils/eventBus';
import { readStoredModuleTabs, STORAGE_KEY } from './utils/moduleEntryGuard';
import { request as httpRequest } from './api/http';
import { cacheGet, cacheSet } from './utils/persistCache';
import * as notificationUnread from './utils/notificationUnread';

const PHONE_AUTHORIZED_LOGIN_KEY = 'phone_authorized_login_v1';
const WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login_v2';
const LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login';

function normalizeUserInfo(user) {
  if (!user) return null;
  const avatar = user.avatar || user.avatarUrl || user.image || '';
  return {
    ...user,
    nickName: user.nickName || user.name || '',
    avatar,
    avatarUrl: user.avatarUrl || avatar,
  };
}

function isFreshLoginCode(ticket) {
  return Boolean(ticket && ticket.code && Date.now() - ticket.createdAt < 4 * 60 * 1000);
}

function isRetiredErrandPath(rawPath) {
  const pagePath = String(rawPath || '')
    .trim()
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
  return (
    pagePath === 'pages/errand' ||
    pagePath.startsWith('pages/errand/') ||
    pagePath === 'packageErrand' ||
    pagePath.startsWith('packageErrand/')
  );
}

App({
  async onLaunch() {
    const storedTabs = readStoredModuleTabs();
    this.globalData.moduleEntryTabs = storedTabs && Array.isArray(storedTabs.tabs) ? storedTabs.tabs : null;

    // 每次启动都同步调试开关，避免从 local 切到 test/production 后仍残留 vConsole。
    try {
      wx.setEnableDebug({ enableDebug: Boolean(config.enableVConsole) });
    } catch (e) {
      /* ignore */
    }

    let apiBase;
    if (config.useLocalDevApi) {
      apiBase = `http://${config.devLanHost}:${config.devPort}`;
      try {
        if (wx.getSystemInfoSync().platform === 'devtools') {
          apiBase = `http://127.0.0.1:${config.devPort}`;
        }
      } catch (e) {
        /* ignore */
      }
    } else {
      apiBase = String(config.productionApiBase || '').replace(/\/+$/, '');
    }
    this.globalData.apiBaseUrl = apiBase;
    this.globalData.offlineMode = false;

    // 先读取本地缓存的用户信息（离线 B1 用）
    const cachedMe = cacheGet('offline_cache_user_me');
    if (cachedMe) this.globalData.userInfo = normalizeUserInfo(cachedMe);

    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate(() => {});
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) updateManager.applyUpdate();
        },
      });
    });

    // 启动自检：先打一下 health，确认小程序侧能否发出 HTTP 请求（开发调试用）
    try {
      await httpRequest({ method: 'GET', path: 'api/health', auth: false });
    } catch (e) {
      console.warn('启动自检：health 请求失败', e);
    }

    await this.syncModuleEntryTabsFromApi();
  },

  onShow() {
    this.refreshNotificationUnreadCount();
  },

  onPageNotFound(res) {
    if (!isRetiredErrandPath(res && res.path)) return;
    if (this._retiredPageFallbackPending) return;
    this._retiredPageFallbackPending = true;
    try {
      wx.showToast({ title: '功能已下线', icon: 'none' });
    } catch (e) {
      /* 提示失败不应阻止安全回首页 */
    }
    try {
      wx.reLaunch({
        url: '/pages/task/index',
        complete: () => {
          this._retiredPageFallbackPending = false;
        },
      });
    } catch (e) {
      this._retiredPageFallbackPending = false;
    }
  },

  /** 自建后端：拉取 Tab 入口配置并覆盖本地缓存 */
  async syncModuleEntryTabsFromApi() {
    try {
      const res = await httpRequest({
        method: 'GET',
        path: 'api/app-settings/module-entry-tabs',
        auth: false,
      });
      if (res && res.code === 200 && res.data && Array.isArray(res.data.tabs)) {
        this.globalData.moduleEntryTabs = res.data.tabs;
        try {
          wx.setStorageSync(STORAGE_KEY, { tabs: this.globalData.moduleEntryTabs });
        } catch (e) {
          /* ignore */
        }
        this.eventBus.emit('moduleEntryVisibilityChange');
      }
    } catch (err) {
      console.warn('同步模块入口配置失败，使用本地缓存或默认0', err);
    }
  },

  /** 运行时更新 Tab 入口配置（写入本地缓存，覆盖云端/本地默认值） */
  setModuleEntryTabs(tabs) {
    this.globalData.moduleEntryTabs = Array.isArray(tabs) ? tabs : this.globalData.moduleEntryTabs;
    try {
      wx.setStorageSync(STORAGE_KEY, { tabs: this.globalData.moduleEntryTabs });
    } catch (e) {
      /* ignore */
    }
    this.eventBus.emit('moduleEntryVisibilityChange');
  },

  async login() {
    try {
      // 每次启动都用最新登录态覆盖旧 token，避免旧 token 导致后续接口持续 401
      this.resetNotificationUnreadCount();
      try {
        wx.removeStorageSync('access_token');
        wx.removeStorageSync(PHONE_AUTHORIZED_LOGIN_KEY);
        wx.removeStorageSync(WECHAT_AUTHORIZED_LOGIN_KEY);
        wx.removeStorageSync(LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY);
      } catch (e) {
        /* ignore */
      }
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          timeout: 10000,
          success: resolve,
          fail: reject,
        });
      });
      const code = loginRes && loginRes.code;
      if (!code) throw new Error('wx.login 未返回 code');

      const res = await httpRequest({
        method: 'POST',
        path: 'api/auth/wechat/login',
        data: { code },
        auth: false,
      });

      if (!res || !res.token) {
        console.warn('>>> login 失败: 后端未返回 token', res);
        throw new Error((res && res.message) || '后端登录失败');
      }

      wx.setStorageSync('access_token', res.token);

      this.globalData.userInfo = normalizeUserInfo(res.user);
      this.globalData.openid = (res.user && res.user.openid) || '';
      this.globalData.offlineMode = false;
      if (this.globalData.userInfo) cacheSet('offline_cache_user_me', this.globalData.userInfo, 7 * 24 * 3600);
    } catch (err) {
      console.warn('>>> 自建后端登录失败，进入离线模式', err);
      // 登录失败时清理 token，避免携带无效 token 继续请求导致 token_invalid
      try {
        wx.removeStorageSync('access_token');
        wx.removeStorageSync(PHONE_AUTHORIZED_LOGIN_KEY);
        wx.removeStorageSync(WECHAT_AUTHORIZED_LOGIN_KEY);
        wx.removeStorageSync(LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY);
      } catch (e) {
        /* ignore */
      }
      this.globalData.offlineMode = true;
      // 离线模式：尽量用缓存用户信息
      const cachedMe = cacheGet('offline_cache_user_me');
      if (cachedMe) this.globalData.userInfo = normalizeUserInfo(cachedMe);
    }
  },

  async phoneLogin(phoneCode) {
    const code = String(phoneCode || '').trim();
    if (!code) throw new Error('未获取到手机号授权凭证');

    try {
      this.resetNotificationUnreadCount();
      wx.removeStorageSync('access_token');
      wx.removeStorageSync(PHONE_AUTHORIZED_LOGIN_KEY);
      wx.removeStorageSync(WECHAT_AUTHORIZED_LOGIN_KEY);
      wx.removeStorageSync(LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY);
    } catch (e) {
      /* ignore */
    }

    const jsCode = await this.getLoginCode();
    if (!jsCode) throw new Error('wx.login 未返回 code');

    const res = await httpRequest({
      method: 'POST',
      path: 'api/auth/wechat/phone-login',
      data: { code: jsCode, phoneCode: code },
      auth: false,
    });

    if (!res || !res.token) {
      throw new Error((res && res.message) || '手机号登录失败');
    }

    wx.setStorageSync('access_token', res.token);
    wx.setStorageSync(PHONE_AUTHORIZED_LOGIN_KEY, true);
    this.globalData.userInfo = normalizeUserInfo(res.user);
    this.globalData.openid = (res.user && res.user.openid) || '';
    this.globalData.offlineMode = false;
    if (this.globalData.userInfo) cacheSet('offline_cache_user_me', this.globalData.userInfo, 7 * 24 * 3600);
    await this.syncModuleEntryTabsFromApi();
    this.eventBus.emit('userInfoChange');
    this.refreshNotificationUnreadCount();
    return res;
  },

  refreshNotificationUnreadCount() {
    return notificationUnread.refreshNotificationUnreadCount(this, () =>
      httpRequest({
        method: 'GET',
        path: 'api/notifications/unread-count',
        auth: true,
      }),
    );
  },

  resetNotificationUnreadCount() {
    return notificationUnread.resetNotificationUnreadCount(this);
  },

  async refreshLoginCode() {
    const loginRes = await new Promise((resolve, reject) => {
      wx.login({
        timeout: 10000,
        success: resolve,
        fail: reject,
      });
    });
    const code = loginRes && loginRes.code;
    if (!code) throw new Error('wx.login 未返回 code');
    this.globalData.loginCodeTicket = { code, createdAt: Date.now() };
    return code;
  },

  async getLoginCode() {
    const ticket = this.globalData.loginCodeTicket;
    if (isFreshLoginCode(ticket)) {
      this.globalData.loginCodeTicket = null;
      return ticket.code;
    }
    return this.refreshLoginCode();
  },

  globalData: {
    userInfo: null,
    userId: 'user1', // 任务/商城等模块当前用户，Mock 用
    openid: '',
    useCloudBase: false,
    offlineMode: false,
    apiBaseUrl: '',
    loginCodeTicket: null,
    moduleEntryTabs: null,
    notificationUnreadCount: 0,
    notificationUnreadAccountKey: '',
    /** 底部自定义 TabBar 当前选中 key，与 tab 页路由同步（跨页面组件实例共享） */
    tabBarSelectedKey: '',
  },

  /** 全局事件总线 */
  eventBus: createBus(),
});
