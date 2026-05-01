// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { readStoredModuleTabs, STORAGE_KEY } from './utils/moduleEntryGuard';
import { request as httpRequest } from './api/http';
import { cacheGet, cacheSet } from './utils/persistCache';

if (config.isMock) {
  Mock();
}

/** 本地联调：模拟器走 127.0.0.1；真机预览须填宿主机局域网 IP */
const DEV_API_PORT = 3000;
const DEV_API_HOST_LAN = '192.168.82.169';

App({
  async onLaunch() {
    console.log('>>> onLaunch 开始执行');
    const storedTabs = readStoredModuleTabs();
    this.globalData.moduleEntryTabs = storedTabs && Array.isArray(storedTabs.tabs) ? storedTabs.tabs : null;

    // 关闭 vConsole 调试器，避免真机/预览时出现调试面板
    try {
      wx.setEnableDebug({ enableDebug: false });
    } catch (e) {
      /* ignore */
    }

    let apiBase = `http://${DEV_API_HOST_LAN}:${DEV_API_PORT}`;
    try {
      if (wx.getSystemInfoSync().platform === 'devtools') {
        apiBase = `http://127.0.0.1:${DEV_API_PORT}`;
      }
    } catch (e) {
      /* ignore */
    }
    this.globalData.apiBaseUrl = apiBase;
    this.globalData.offlineMode = false;

    // 先读取本地缓存的用户信息（离线 B1 用）
    const cachedMe = cacheGet('offline_cache_user_me');
    if (cachedMe) this.globalData.userInfo = cachedMe;

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

    // 启动即登录（必须登录才能浏览；失败则进入离线模式）
    // 启动自检：先打一下 health，确认小程序侧能否发出 HTTP 请求（开发调试用）
    try {
      await httpRequest({ method: 'GET', path: 'api/health', auth: false });
    } catch (e) {
      console.warn('启动自检：health 请求失败', e);
    }
    await this.login();
    console.log('>>> login 执行完毕, offlineMode:', this.globalData.offlineMode);
    console.log('>>> 准备调用 syncModuleEntryTabsFromApi');
    await this.syncModuleEntryTabsFromApi();
    console.log('>>> syncModuleEntryTabsFromApi 执行完毕');
  },

  onShow() {
    // 自建后端：后续可在此同步配置
  },

  /** 自建后端：拉取 Tab 入口配置并覆盖本地缓存 */
  async syncModuleEntryTabsFromApi() {
    console.log('>>> syncModuleEntryTabsFromApi 开始执行');
    try {
      const res = await httpRequest({
        method: 'GET',
        path: 'api/app-settings/module-entry-tabs',
        auth: true,
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
      try {
        wx.removeStorageSync('access_token');
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
      this.globalData.userInfo = res.user || null;
      this.globalData.openid = (res.user && res.user.openid) || '';
      this.globalData.offlineMode = false;
      if (res.user) cacheSet('offline_cache_user_me', res.user, 7 * 24 * 3600);
      console.log('>>> login 成功, token:', res.token ? '已设置' : '无');
    } catch (err) {
      console.warn('>>> 自建后端登录失败，进入离线模式', err);
      // 登录失败时清理 token，避免携带无效 token 继续请求导致 token_invalid
      try {
        wx.removeStorageSync('access_token');
      } catch (e) {
        /* ignore */
      }
      this.globalData.offlineMode = true;
      // 离线模式：尽量用缓存用户信息
      const cachedMe = cacheGet('offline_cache_user_me');
      if (cachedMe) this.globalData.userInfo = cachedMe;
    }
  },

  globalData: {
    userInfo: null,
    userId: 'user1', // 任务/商城等模块当前用户，Mock 用
    openid: '',
    useCloudBase: false,
    offlineMode: false,
    apiBaseUrl: '',
    moduleEntryTabs: null,
    /** 底部自定义 TabBar 当前选中 key，与 tab 页路由同步（跨页面组件实例共享） */
    tabBarSelectedKey: '',
  },

  /** 全局事件总线 */
  eventBus: createBus(),
});
