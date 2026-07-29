const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function loadMyPage(options = {}) {
  const pageSource = await readFile(path.join(root, 'pages/my/index.js'), 'utf8');
  let definition;
  const app = {
    globalData: {
      userInfo: {
        phoneNumber: '13800004592',
        name: '微信用户',
        avatar: '',
        brief: '',
      },
      notificationUnreadCount: 0,
    },
    eventBus: {
      on() {},
      off() {},
    },
    refreshNotificationUnreadCount() {},
  };
  let profileRequests = 0;

  vm.runInNewContext(pageSource.replace(/^import .*;\s*$/gm, ''), {
    Page(config) {
      definition = config;
    },
    LIST_REFRESH_KEYS: { user: 'user' },
    NOTIFICATION_UNREAD_EVENT: 'notificationUnreadCountChange',
    consumeListRefresh() {
      return false;
    },
    decryptText(value) {
      return value;
    },
    ensureIdentitySelected: async () => true,
    ensureMutationReady: async () => true,
    getApp() {
      return app;
    },
    isModuleEnabled() {
      return true;
    },
    mallFavoritesUrl() {
      return '';
    },
    mallMyItemsUrl() {
      return '';
    },
    mallOrdersUrl() {
      return '';
    },
    setTimeout,
    clearTimeout,
    syncCustomTabBar() {},
    userAPI: {
      async getUserInfo() {
        profileRequests += 1;
        if (options.error) throw options.error;
        return {
          code: 200,
          data: options.profile || {
            phoneNumber: '13800004592',
            name: '金辉用户',
            avatar: 'https://cdn.example.com/avatar.png',
            brief: '最新个人简介',
          },
        };
      },
    },
    wx: {
      getStorageSync(key) {
        return key === 'access_token' ? 'token' : '';
      },
    },
    console: {
      error() {},
      warn() {},
    },
  });

  const page = {
    data: {
      isLoad: false,
      personalInfo: {},
    },
    setData(updates) {
      Object.assign(this.data, updates);
    },
    _servicePageAlive: true,
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return { app, page, getProfileRequests: () => profileRequests };
}

test('logged-in my page fetches and displays the latest server profile', async () => {
  const harness = await loadMyPage();

  await harness.page.refreshPersonalInfo();

  assert.equal(harness.getProfileRequests(), 1);
  assert.equal(harness.page.data.isLoad, true);
  assert.equal(harness.page.data.personalInfo.displayName, '金辉用户');
  assert.equal(harness.page.data.personalInfo.displayAvatar, 'https://cdn.example.com/avatar.png');
  assert.equal(harness.page.data.personalInfo.displayBrief, '最新个人简介');
  assert.equal(harness.app.globalData.userInfo.name, '金辉用户');
});

test('profile request failure preserves the logged-in cached profile', async () => {
  const harness = await loadMyPage({ error: new Error('network failed') });

  await harness.page.refreshPersonalInfo();

  assert.equal(harness.page.data.isLoad, true);
  assert.equal(harness.page.data.personalInfo.displayName, '用户4592');
  assert.equal(harness.app.globalData.userInfo.phoneNumber, '13800004592');
});

test('my page refreshes the profile whenever the tab becomes visible', async () => {
  const harness = await loadMyPage();
  let refreshes = 0;
  harness.page.refreshPersonalInfo = async () => {
    refreshes += 1;
  };

  harness.page.onShow();
  await Promise.resolve();

  assert.equal(refreshes, 1);
});
