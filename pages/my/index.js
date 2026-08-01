import { userAPI } from '~/api/cloud';
import { mallFavoritesUrl, mallMyItemsUrl, mallOrdersUrl } from '~/utils/mallPaths';
import { isModuleEnabled } from '~/utils/moduleEntryGuard';
import { decryptText } from '~/utils/textCipher';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureIdentitySelected, ensureMutationReady } from '~/utils/authIdentity';
import { NOTIFICATION_UNREAD_EVENT } from '~/utils/notificationUnread';

/**
 * 每个入口带 module：与 `isModuleEnabled` 的 key 一致；null 表示不限模块（始终可显）
 * @type {Array<{ module?: 'task'|'forum'|'mall'|null, name?: string, nameEnc?: string, icon: string, url: string, desc?: string, descEnc?: string }>}
 */

/** 业主互助分区 */
const RAW_SECTION_TASK = [
  { module: 'task', nameEnc: 'j+u8ivXgkdfeyO/P', icon: 'root-list', url: 'task', descEnc: 'j/yIivPvk+T0yOr/kcr6yc6/gMGriODykvbhyd7VkfjY' },
  { module: 'task', name: '我的草稿', icon: 'edit', url: 'taskDrafts', desc: '查看未发布的任务草稿' },
  { module: 'task', name: '我的撤回', icon: 'rollback', url: 'taskCancelled', desc: '查看已撤销发布的任务' },
];

/** 小区留言分区 */
const RAW_SECTION_FORUM = [
  { module: 'forum', nameEnc: 'j+u8ivXgkNTzyMj+', icon: 'chat', url: 'posts', descEnc: 'j+u8iOD1kNTmyv/qnNzDyOuqjNu7iML0' },
  { module: 'forum', nameEnc: 'j/ebhfjrkvbhyN34kd/p', icon: 'star', url: 'favorites', descEnc: 'j+u8i/vSnfvqyv/qnNzDyOuqjNu7iML0' },
];

/** 小区市场分区 */
const RAW_SECTION_MALL = [
  { module: 'mall', nameEnc: 'j+u8iOD1kNTmyv/q', icon: 'shop', url: 'mall', descEnc: 'j+u8iPPMkPnjyPrgkf3oyM6yjvmphPjWktHLAoPf9prNgA==' },
  { module: 'mall', nameEnc: 'j+u8ivXgncLHyOj7', icon: 'cart', url: 'orders', descEnc: 'j+u8idbUkOTVyv/qkMr3yPunjOSXivXgncLHyOj7' },
  { module: 'mall', nameEnc: 'j/ebhfjrkvbhyPDokeH4', icon: 'star', url: 'mallFav', descEnc: 'j+u8i/vSnfvqyv/qkef/yOm/jPariPzl' },
];

/** 更多服务（module: null 不受模块开关影响） */
const RAW_SECTION_MORE = [
  { module: null, nameEnc: 'j9Wli+7LnOz/yvrL', icon: 'notification', url: 'notice', descEnc: 'jdiWiOXFkdTrytbVk8nmy8C5j+KC' },
  { module: null, nameEnc: 'j+eihcjlkOPoxMPm', icon: 'edit', url: 'feedback', descEnc: 'j+y9idXAkNffxcvAkvrvxOGfgMG1' },
];

function entryVisible(m) {
  if (m.module == null) return true;
  return isModuleEnabled(m.module);
}

function mapDecryptItem(m) {
  const rest = { ...m };
  delete rest.module;
  return {
    ...rest,
    name: m.nameEnc ? decryptText(m.nameEnc) : m.name,
    desc: m.descEnc ? decryptText(m.descEnc) : m.desc,
  };
}

function buildSection(id, title, rawItems) {
  const items = rawItems.filter(entryVisible).map(mapDecryptItem);
  if (!items.length) return null;
  return { id, title, items };
}

function defaultPhoneUserName(user) {
  const phone = String(user.phoneNumber || user.phone || '').trim();
  return phone.length >= 4 ? `用户${phone.slice(-4)}` : '用户';
}

function normalizePersonalInfo(user) {
  if (!user) return {};
  const avatar = user.avatar || user.avatarUrl || user.image || '';
  const name = String(user.name || '').trim();
  const brief = String(user.brief || user.introduction || '').trim();
  return {
    ...user,
    avatar,
    avatarUrl: user.avatarUrl || avatar,
    image: user.image || avatar,
    displayName: name && name !== '微信用户' ? name : defaultPhoneUserName(user),
    displayBrief: brief || '这个人很懒, 什么都没有写',
    displayAvatar: avatar,
  };
}

Page({
  data: {
    isLoad: false,
    isLoggingIn: false,
    personalInfo: {},
    menuSections: [],
    unreadCount: 0,
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.userInfo || !app.globalData.userInfo.phoneNumber) {
      if (app.refreshLoginCode) {
        app.refreshLoginCode().catch((err) => {
          console.warn('[my] 预取 wx.login code 失败', err);
        });
      }
    }
    syncCustomTabBar(this, 'my');
    if (app.refreshNotificationUnreadCount) app.refreshNotificationUnreadCount();
    consumeListRefresh(LIST_REFRESH_KEYS.user);
    this.refreshPersonalInfo();
  },

  onLoad() {
    const app = getApp();
    this._servicePageAlive = true;
    this._openingService = false;
    this._onModuleEntryVisibilityChange = () => {
      this.refreshMenuList();
    };
    this._onUserInfoChange = () => {
      this.refreshPersonalInfo();
    };
    this._onNotificationUnreadCountChange = (count) => {
      this.setData({ unreadCount: Number.isSafeInteger(count) && count > 0 ? count : 0 });
    };
    app.eventBus.on('moduleEntryVisibilityChange', this._onModuleEntryVisibilityChange);
    app.eventBus.on('userInfoChange', this._onUserInfoChange);
    app.eventBus.on(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
    this._onNotificationUnreadCountChange(app.globalData.notificationUnreadCount);
    this.refreshMenuList();
  },

  onUnload() {
    this._authPageAlive = false;
    this._servicePageAlive = false;
    this._openingService = false;
    this._personalInfoRequestId = (this._personalInfoRequestId || 0) + 1;
    if (this._openingServiceTimer) {
      clearTimeout(this._openingServiceTimer);
      this._openingServiceTimer = null;
    }
    const app = getApp();
    if (this._onModuleEntryVisibilityChange) {
      app.eventBus.off('moduleEntryVisibilityChange', this._onModuleEntryVisibilityChange);
    }
    if (this._onUserInfoChange) {
      app.eventBus.off('userInfoChange', this._onUserInfoChange);
    }
    if (this._onNotificationUnreadCountChange) {
      app.eventBus.off(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
    }
  },

  async refreshPersonalInfo() {
    const app = getApp();
    const token = wx.getStorageSync('access_token');
    if (!token) {
      this.setData({
        isLoad: false,
        personalInfo: {},
      });
      return;
    }

    const requestId = (this._personalInfoRequestId || 0) + 1;
    this._personalInfoRequestId = requestId;
    const cachedUserInfo = app.globalData.userInfo || {};
    let latestUserInfo;
    try {
      latestUserInfo = await this.getPersonalInfo();
    } catch (err) {
      if (!this._servicePageAlive || requestId !== this._personalInfoRequestId) return;
      try {
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('phone_authorized_login_v1');
        wx.removeStorageSync('wechat_authorized_login_v2');
        wx.removeStorageSync('wechat_authorized_login');
      } catch (e) {
        /* ignore */
      }
      app.globalData.openid = '';
      app.globalData.userInfo = null;
      app.globalData.offlineMode = false;
      if (app.resetNotificationUnreadCount) app.resetNotificationUnreadCount();
      this.setData({ isLoad: false, personalInfo: {} });
      return;
    }
    if (!this._servicePageAlive || requestId !== this._personalInfoRequestId) return;

    if (latestUserInfo) {
      const avatar = latestUserInfo.avatar || latestUserInfo.avatarUrl || latestUserInfo.image || '';
      app.globalData.userInfo = {
        ...cachedUserInfo,
        ...latestUserInfo,
        nickName: latestUserInfo.nickName || latestUserInfo.name || cachedUserInfo.nickName || '',
        avatar,
        avatarUrl: latestUserInfo.avatarUrl || avatar,
      };
    }

    const personalInfo = app.globalData.userInfo || cachedUserInfo;
    const hasPhone = Boolean(String(personalInfo.phoneNumber || personalInfo.phone || '').trim());
    this.setData({
      isLoad: hasPhone,
      personalInfo: hasPhone ? normalizePersonalInfo(personalInfo) : {},
    });
  },

  refreshMenuList() {
    const menuSections = [];

    const taskSec = buildSection('task', '业主互助', RAW_SECTION_TASK);
    if (taskSec) menuSections.push(taskSec);

    const forumSec = buildSection('forum', '小区留言', RAW_SECTION_FORUM);
    if (forumSec) menuSections.push(forumSec);

    const mallSec = buildSection('mall', '小区市场', RAW_SECTION_MALL);
    if (mallSec) menuSections.push(mallSec);

    const moreSec = buildSection('more', '更多服务', RAW_SECTION_MORE);
    if (moreSec) menuSections.push(moreSec);

    this.setData({ menuSections });
  },

  async getPersonalInfo() {
    try {
      const res = await userAPI.getUserInfo();
      return res && res.code === 200 && res.data ? res.data : null;
    } catch (err) {
      if ([401, 403].includes(Number(err && err.statusCode))) throw err;
      console.warn('获取用户信息失败，继续使用本地资料', err);
      return null;
    }
  },

  async onGetPhoneNumber(e) {
    if (this.data.isLoggingIn) return;
    const detail = e.detail || {};
    if (detail.errMsg && !/ok/i.test(detail.errMsg)) {
      wx.showToast({ title: '已取消手机号授权', icon: 'none' });
      return;
    }
    if (!detail.code) {
      wx.showToast({ title: '未获取到手机号授权凭证', icon: 'none' });
      return;
    }

    this.setData({ isLoggingIn: true });
    try {
      const app = getApp();
      wx.showLoading({ title: '验证中...' });
      await app.phoneLogin(detail.code);
      wx.hideLoading();

      if (app.globalData.offlineMode) {
        wx.showToast({ title: '网络不可用，请稍后重试', icon: 'none' });
        return;
      }

      await ensureIdentitySelected(this);
      this.setData({
        isLoad: true,
        personalInfo: normalizePersonalInfo(app.globalData.userInfo),
      });
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '手机号验证失败', icon: 'none' });
      console.error('手机号验证登录失败', err);
    } finally {
      this.setData({ isLoggingIn: false });
    }
  },

  async onNavigateTo() {
    if (!(await ensureMutationReady(this))) return;
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },

  onAuthorized() {
    this.refreshPersonalInfo();
  },

  onAvatarLoadError() {
    this.setData({
      'personalInfo.displayAvatar': '',
    });
  },

  async onMenuTap(e) {
    if (this._openingService) return;
    this._openingService = true;
    let navigationStarted = false;
    const navigateToService = (url) => {
      wx.navigateTo({
        url,
        complete: () => {
          if (!this._servicePageAlive) {
            this._openingService = false;
            return;
          }
          if (this._openingServiceTimer) clearTimeout(this._openingServiceTimer);
          this._openingServiceTimer = setTimeout(() => {
            this._openingService = false;
            this._openingServiceTimer = null;
          }, 300);
        },
      });
      navigationStarted = true;
    };

    try {
      const { url, name } = e.currentTarget.dataset;
      const routes = {
        task: '/packageTask/my-tasks/index',
        taskDrafts: '/packageTask/my-tasks/index?type=draft',
        taskCancelled: '/packageTask/my-tasks/index?type=cancelled',
        posts: '/packageForum/my-posts/index',
        favorites: '/packageForum/favorites/index',
        mall: mallMyItemsUrl(),
        orders: mallOrdersUrl(),
        mallFav: mallFavoritesUrl(),
        notice: '/packageCommon/notice/index',
        feedback: '/packageCommon/feedback/index',
        about: '/packageCommon/about/index',
      };
      if (routes[url]) {
        const protectedRoutes = [
          'task',
          'taskDrafts',
          'taskCancelled',
          'posts',
          'favorites',
          'mall',
          'orders',
          'mallFav',
          'notice',
        ];
        if (protectedRoutes.includes(url) && !(await ensureMutationReady(this))) return;
        navigateToService(routes[url]);
        return;
      }
      if (url) {
        navigateToService(url);
        return;
      }
      wx.showToast({ title: name || '敬请期待', icon: 'none' });
    } finally {
      if (!navigationStarted) this._openingService = false;
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        try {
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('phone_authorized_login_v1');
          wx.removeStorageSync('wechat_authorized_login_v2');
          wx.removeStorageSync('wechat_authorized_login');
        } catch (e) {
          /* ignore */
        }
        app.globalData.openid = '';
        app.globalData.userInfo = null;
        app.globalData.offlineMode = false;
        if (app.resetNotificationUnreadCount) app.resetNotificationUnreadCount();
        this.setData({ isLoad: false, personalInfo: {} });
        app.eventBus.emit('userInfoChange');
        wx.showToast({ title: '已退出登录', icon: 'none' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 300);
      },
    });
  },
});
