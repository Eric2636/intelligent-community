import useToastBehavior from '~/behaviors/useToast';
import { userAPI } from '~/api/cloud';
import { mallFavoritesUrl, mallMyItemsUrl, mallOrdersUrl } from '~/utils/mallPaths';
import { isModuleEnabled } from '~/utils/moduleEntryGuard';
import { decryptText } from '~/utils/textCipher';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';

/**
 * 每个入口带 module：与 `isModuleEnabled` 的 key 一致；null 表示不限模块（始终可显）
 * @type {Array<{ module?: 'task'|'errand'|'forum'|'mall'|null, name?: string, nameEnc?: string, icon: string, url: string, desc?: string, descEnc?: string }>}
 */

/** 业主互助分区 */
const RAW_SECTION_TASK = [
  { module: 'task', nameEnc: 'j+u8ivXgkdfeyO/P', icon: 'root-list', url: 'task', descEnc: 'j/yIivPvk+T0yOr/kcr6yc6/gMGriODykvbhyd7VkfjY' },
  { module: 'task', nameEnc: 'j9Wli+7LnOz/yvrL', icon: 'notification', url: 'notice', descEnc: 'jdiWiOXFkdTrytbVk8nmy8C5j+KC' },
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

/** 更多服务：跑腿 + 通用（module: null 不受模块开关影响） */
const RAW_SECTION_MORE = [
  { module: 'errand', name: '小区跑腿', icon: 'service', url: 'errand', desc: '发布取件代拿等便民跑腿需求' },
  { module: null, nameEnc: 'j+eihcjlkOPoxMPm', icon: 'edit', url: 'feedback', descEnc: 'j+y9idXAkNffxcvAkvrvxOGfgMG1' },
  { module: null, nameEnc: 'jOaeidXqk+T0yd7C', icon: 'info-circle', url: 'about', descEnc: 'jdmKiPzlkdfuyt7jkMr3yv+5j/+B' },
  { module: null, nameEnc: 'gc2TitLK', icon: 'setting', url: '/pages/setting/index', descEnc: 'gdeLiODTkdTrxOX0k+bRxdiPjt6D' },
  { module: null, nameEnc: 'geK5itzfkMLHy/nj', icon: 'service', url: '', descEnc: 'j/+khPjKnM79y+zQkvroyc2d' },
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

Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    personalInfo: {},
    menuSections: [],
  },

  onLoad() {
    const app = getApp();
    this._onModuleEntryVisibilityChange = () => {
      this.refreshMenuList();
    };
    app.eventBus.on('moduleEntryVisibilityChange', this._onModuleEntryVisibilityChange);
  },

  onUnload() {
    const app = getApp();
    if (this._onModuleEntryVisibilityChange) {
      app.eventBus.off('moduleEntryVisibilityChange', this._onModuleEntryVisibilityChange);
    }
  },

  async onShow() {
    syncCustomTabBar(this);
    this.refreshMenuList();

    const token = wx.getStorageSync('access_token');
    const app = getApp();
    if (app.globalData.useCloudBase && token) {
      const personalInfo = await this.getPersonalInfo();
      this.setData({
        isLoad: true,
        personalInfo: personalInfo || {},
      });
    } else {
      this.setData({
        isLoad: !!token,
        personalInfo: {},
      });
    }
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
      const app = getApp();
      if (app.globalData.useCloudBase) {
        try {
          const res = await userAPI.getUserInfo();
          if (res.code === 200 && res.data) {
            return res.data;
          }
        } catch (err) {
          console.error('获取用户信息失败', err);
        }
        const openid = app.globalData.openid;
        return {
          name: '用户',
          avatar: '',
          openid: openid || '',
        };
      } else {
        return {};
      }
    } catch (e) {
      return {};
    }
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onNavigateTo() {
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },

  onMenuTap(e) {
    const { url, name } = e.currentTarget.dataset;
    const routes = {
      task: '/packageTask/my-tasks/index',
      errand: '/packageErrand/my-errands/index',
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
      wx.navigateTo({ url: routes[url] });
      return;
    }
    if (url) {
      wx.navigateTo({ url });
      return;
    }
    this.onShowToast('#t-toast', name || '敬请期待');
  },
});
