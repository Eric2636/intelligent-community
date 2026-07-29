const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function setData(target, updates) {
  Object.keys(updates).forEach((key) => {
    target.data[key] = updates[key];
  });
}

function loadAuthIdentity(authSource, dependencies) {
  const transformed = authSource
    .replace("import { userAPI } from '~/api/cloud';", 'const { userAPI } = dependencies;')
    .replace(/export (async )?function /g, '$1function ')
    .concat(
      '\nmodule.exports = { hasLoginToken, requestAuthorizedLogin, ensureLoggedIn, ' +
        'ensureIdentitySelected, completeAuthorizedLogin, ensureMutationReady };\n',
    );
  const context = {
    dependencies,
    getApp: dependencies.getApp,
    getCurrentPages: dependencies.getCurrentPages,
    module: { exports: {} },
    wx: dependencies.wx,
  };
  vm.runInNewContext(transformed, context, { filename: 'utils/authIdentity.js' });
  return context.module.exports;
}

function loadDialog(dialogSource, dependencies) {
  let definition;
  const transformed = dialogSource.replace(
    "import { completeAuthorizedLogin } from '~/utils/authIdentity';",
    'const { completeAuthorizedLogin } = dependencies;',
  );
  vm.runInNewContext(transformed, {
    Component(config) {
      definition = config;
    },
    dependencies,
    wx: dependencies.wx,
  });
  return definition;
}

function instantiate(definition) {
  const events = [];
  const instance = {
    data: { ...definition.data },
    setData(updates) {
      setData(this, updates);
    },
    triggerEvent(name, detail) {
      events.push({ name, detail });
    },
  };
  Object.entries(definition.methods).forEach(([name, method]) => {
    instance[name] = method.bind(instance);
  });
  if (definition.lifetimes && definition.lifetimes.attached) {
    definition.lifetimes.attached.call(instance);
  }
  return { instance, events };
}

function loadPageDefinition(pageSource, dependencies) {
  let definition;
  const transformed = pageSource.replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(transformed, {
    Page(config) {
      definition = config;
    },
    LIST_REFRESH_KEYS: new Proxy({}, { get: (_, key) => String(key) }),
    consumeListRefresh: () => true,
    ensureMutationReady: dependencies.ensureMutationReady,
    forumAPI: dependencies.privateAPI,
    taskAPI: dependencies.privateAPI,
    mallAPI: dependencies.privateAPI,
    commonAPI: dependencies.privateAPI,
    redirectIfEntryHidden: () => false,
    normalizeForumListPost: (item) => item,
    formatDateTimeYmdHm: (value) => value,
    withDefaultAvatar: (value) => value,
    mallDetailUrl: (id) => String(id),
    mallOrderDetailUrl: (id) => String(id),
    NOTIFICATION_UNREAD_EVENT: 'notificationUnreadCountChange',
    getApp: () => ({
      globalData: { notificationUnreadCount: 0 },
      eventBus: {
        on() {},
        off() {},
        emit() {},
      },
      refreshNotificationUnreadCount: async () => 0,
    }),
    wx: {
      navigateTo() {},
      previewImage() {},
      setNavigationBarTitle() {},
      showToast() {},
      stopPullDownRefresh() {},
    },
  });
  return definition;
}

function instantiatePage(definition) {
  const page = {
    data: { ...definition.data },
    setData(updates, callback) {
      setData(this, updates);
      if (callback) callback();
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return page;
}

function findRootViewClose(template, rootMarker) {
  const rootStart = template.indexOf(rootMarker);
  assert.ok(rootStart >= 0, `缺少页面根容器：${rootMarker}`);
  const tokens = Array.from(template.slice(rootStart).matchAll(/<\/?view\b[^>]*>/g));
  let depth = 0;
  let rootClose = -1;
  tokens.some((token) => {
    if (token[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth !== 0) return false;
    rootClose = rootStart + token.index;
    return true;
  });
  return rootClose;
}

async function run() {
  const [authSource, dialogSource, dialogTemplate, dialogStyles, mallPageSource, appConfig, appStyles] = await Promise.all([
    source('utils/authIdentity.js'),
    source('components/auth-login-dialog/index.js'),
    source('components/auth-login-dialog/index.wxml'),
    source('components/auth-login-dialog/index.less'),
    source('pages/mall/index.js'),
    source('app.json'),
    source('app.less'),
  ]);

  assert.doesNotMatch(
    authSource,
    /switchTab\s*\(\s*\{\s*url:\s*['"]\/pages\/my\/index['"]/,
    '统一鉴权工具禁止把游客跳转到“我的”',
  );
  assert.match(dialogTemplate, /<button\b[^>]*open-type="getPhoneNumber"/, '手机号授权必须使用原生 button');
  assert.match(dialogTemplate, /aria-role="dialog"/, '登录弹框必须声明 dialog 无障碍角色');
  assert.match(dialogTemplate, /aria-labelledby="auth-login-dialog-title"/, '登录弹框必须关联可读标题');
  assert.match(
    mallPageSource,
    /async goPublish\(\)\s*\{\s*if \(!\(await ensureMutationReady\(this\)\)\) return;/,
    '小区市场新增商品入口必须在导航前进行统一权限校验',
  );
  assert.match(dialogTemplate, /<t-popup\b[^>]*placement="center"/, '授权弹框必须恢复为居中显示');
  assert.doesNotMatch(dialogTemplate, /class="auth-dialog__header"/, '授权弹框不应保留底部面板标题栏');
  assert.doesNotMatch(dialogTemplate, /class="auth-dialog__actions"/, '授权弹框按钮不应采用横向布局');
  assert.match(
    dialogStyles,
    /\.auth-dialog\s*\{[\s\S]*?width:\s*620rpx/,
    '授权弹框必须恢复紧凑的居中卡片宽度',
  );
  assert.match(
    dialogStyles,
    /\.auth-dialog__authorize\s*\{[\s\S]*?#0052d9/,
    '授权按钮必须恢复 TDesign 蓝色',
  );
  assert.match(
    dialogStyles,
    /\.auth-dialog__cancel\s*\{[\s\S]*?margin-top:\s*20rpx/,
    '取消按钮必须位于授权按钮下方',
  );
  assert.match(appConfig, /"auth-login-dialog":\s*"\/components\/auth-login-dialog\/index"/, '必须全局注册登录弹框');

  const protectedPages = [
    'pages/task/index',
    'pages/forum/index',
    'pages/mall/index',
    'pages/my/index',
    'pages/my/info-edit/index',
    'packageTask/detail/index',
    'packageTask/publish/index',
    'packageForum/post/index',
    'packageForum/publish/index',
    'packageMall/detail/index',
    'packageMall/publish/index',
    'packageMall/order-detail/index',
    'packageCommon/feedback/index',
    'packageTask/my-tasks/index',
    'packageForum/my-posts/index',
    'packageForum/favorites/index',
    'packageMall/my-list/index',
    'packageMall/order-list/index',
    'packageMall/favorites/index',
    'packageCommon/notice/index',
  ];
  const [protectedTemplates, protectedPageSources] = await Promise.all([
    Promise.all(protectedPages.map((page) => source(`${page}.wxml`))),
    Promise.all(protectedPages.map((page) => source(`${page}.js`))),
  ]);
  protectedPages.forEach((page, index) => {
    assert.match(
      protectedTemplates[index],
      /<auth-login-dialog\s+id="auth-login-dialog"/,
      `${page} 必须挂载统一登录弹框`,
    );
    assert.match(
      protectedPageSources[index],
      /import \{[^}]*ensureMutationReady[^}]*\} from '~\/utils\/authIdentity';/,
      `${page} 必须接入统一鉴权入口`,
    );
    assert.match(protectedPageSources[index], /_authPageAlive = false;/, `${page} onUnload 必须标记页面失活`);
    assert.doesNotMatch(
      protectedPageSources[index],
      /ensureMutationReady\(\)/,
      `${page} 每个鉴权调用都必须传入来源页面`,
    );
  });

  const privateGetPages = [
    ['packageTask/my-tasks/index', 'loadTasks', 'taskAPI.getMyTasks', '<view class="my-tasks-page">', 'class="tab-content"'],
    ['packageForum/my-posts/index', 'loadPosts', 'forumAPI.getMyPosts', '<view class="my-posts-page">', '<t-pull-down-refresh'],
    ['packageForum/favorites/index', 'loadList', 'forumAPI.getMyFavoritePosts', '<view class="favorites-page">', '<view wx:if="{{loading}}"'],
    ['packageMall/my-list/index', 'loadItems', 'mallAPI.getMyItems', '<view class="my-list-page">', '<t-pull-down-refresh'],
    ['packageMall/order-list/index', 'loadOrders', 'mallAPI.getMyOrders', '<view class="order-list-page">', '<view wx:if="{{loading}}"'],
    ['packageMall/favorites/index', 'loadList', 'mallAPI.getMyFavoriteItems', '<view class="fav-page">', '<view wx:if="{{loading}}"'],
    ['packageCommon/notice/index', 'loadNotices', 'commonAPI.getNotifications', '<view class="notice-page">', 'class="notice-list"'],
  ];
  await Promise.all(privateGetPages.map(async ([page, loader, privateCall, rootMarker, mainMarker]) => {
    const protectedIndex = protectedPages.indexOf(page);
    const pageSource = protectedPageSources[protectedIndex];
    assert.match(
      protectedTemplates[protectedIndex],
      /bindauthorized="onAuthorized"/,
      `${page} 必须只接收授权状态更新`,
    );
    assert.match(
      protectedTemplates[protectedIndex],
      /登录成功，请点击加载内容/,
      `${page} 必须提示用户再次点击加载`,
    );
    assert.match(
      protectedTemplates[protectedIndex],
      /bindtap="onManualLoad"/,
      `${page} 必须提供手动加载按钮`,
    );
    const manualAt = protectedTemplates[protectedIndex].indexOf('class="auth-manual-load"');
    const rootCloseAt = findRootViewClose(protectedTemplates[protectedIndex], rootMarker);
    const mainAt = protectedTemplates[protectedIndex].indexOf(mainMarker);
    assert.ok(manualAt > protectedTemplates[protectedIndex].indexOf(rootMarker), `${page} 提示卡必须在根容器内部`);
    assert.ok(manualAt < rootCloseAt, `${page} 提示卡不得放在根容器之后`);
    assert.ok(manualAt < mainAt, `${page} 提示卡必须在主要列表/骨架之前`);
    assert.match(
      protectedTemplates[protectedIndex],
      /wx:if="{{!showManualLoad}}"/,
      `${page} 显示手动加载提示时必须隐藏原列表或骨架`,
    );
    const loaderStart = pageSource.indexOf(`async ${loader}(`);
    const guardAt = pageSource.indexOf('await ensureMutationReady(this)', loaderStart);
    const privateCallAt = pageSource.indexOf(privateCall, loaderStart);
    assert.ok(loaderStart >= 0, `${page} 缺少 ${loader}`);
    assert.ok(guardAt > loaderStart && guardAt < privateCallAt, `${page} 私有 GET 前必须先鉴权`);

    let apiCalls = 0;
    let authCalls = 0;
    const privateAPI = new Proxy(
      {},
      {
        get: () => async () => {
          apiCalls += 1;
          return { code: 200, data: [] };
        },
      },
    );
    let authResult = false;
    const definition = loadPageDefinition(pageSource, {
      privateAPI,
      ensureMutationReady: async () => {
        authCalls += 1;
        return authResult;
      },
    });
    const onLoadPage = instantiatePage(definition);
    onLoadPage.onLoad({});
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.ok(authCalls >= 1, `${page} 深链 onLoad 必须请求统一鉴权`);
    assert.equal(apiCalls, 0, `${page} 游客 onLoad 不得请求私有 API`);

    if (onLoadPage.onShow) {
      const onShowPage = instantiatePage(definition);
      onShowPage._skipNextShowRefresh = false;
      onShowPage.onShow();
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      assert.equal(apiCalls, 0, `${page} 游客 onShow 不得请求私有 API`);
    }

    onLoadPage.onAuthorized();
    await Promise.resolve();
    assert.equal(apiCalls, 0, `${page} authorized 不得自动请求私有 API`);
    assert.equal(onLoadPage.data.showManualLoad, true, `${page} authorized 后必须显示手动加载提示`);
    authResult = true;
    await onLoadPage.onManualLoad();
    assert.equal(apiCalls, 1, `${page} 用户再次点击后必须只加载一次`);
  }));
  assert.match(appStyles, /\.auth-manual-load\s*\{[\s\S]*?display:\s*flex;/, '手动加载卡必须使用首屏布局');
  assert.match(appStyles, /\.auth-manual-load\s*\{[\s\S]*?align-items:\s*center;/, '手动加载卡内容必须垂直居中');
  assert.match(appStyles, /\.auth-manual-load\s*\{[\s\S]*?justify-content:\s*center;/, '手动加载卡内容必须水平居中');
  assert.match(appStyles, /\.auth-manual-load\s*\{[\s\S]*?min-height:/, '手动加载卡必须提供明确首屏高度');

  const guardedMutationPages = [
    'pages/task/index.js',
    'pages/forum/index.js',
    'pages/my/index.js',
    'pages/my/info-edit/index.js',
    'packageTask/detail/index.js',
    'packageTask/publish/index.js',
    'packageForum/post/index.js',
    'packageForum/publish/index.js',
    'packageMall/detail/index.js',
    'packageMall/publish/index.js',
    'packageMall/order-detail/index.js',
    'packageCommon/feedback/index.js',
  ];
  const guardedSources = await Promise.all(guardedMutationPages.map(source));
  guardedSources.forEach((pageSource, index) => {
    assert.match(
      pageSource,
      /import \{[^}]*ensureMutationReady[^}]*\} from '~\/utils\/authIdentity';/,
      `${guardedMutationPages[index]} 必须接入统一鉴权入口`,
    );
    assert.doesNotMatch(pageSource, /title:\s*['"]请先登录['"]/, `${guardedMutationPages[index]} 禁止直接登录 toast`);
  });
  assert.doesNotMatch(guardedSources[11], /\?\./, '反馈页必须兼容项目当前 ES2018 lint 解析器');
  [
    ['pages/my/info-edit/index.js', guardedSources[3], 2],
    ['packageMall/detail/index.js', guardedSources[8], 4],
    ['packageMall/order-detail/index.js', guardedSources[10], 2],
    ['packageCommon/feedback/index.js', guardedSources[11], 1],
  ].forEach(([filePath, pageSource, minimum]) => {
    const guards = pageSource.match(/await ensureMutationReady\(this\)/g) || [];
    assert.ok(guards.length >= minimum, `${filePath} 每个受保护操作都必须先鉴权`);
  });

  let dialogOpenCount = 0;
  let token = '';
  let phoneAuthorized = false;
  let serverUserCalls = 0;
  const app = {
    globalData: { userInfo: null },
    eventBus: { emit() {} },
  };
  const wx = {
    getStorageSync(key) {
      if (key === 'access_token') return token;
      if (key === 'phone_authorized_login_v1') return phoneAuthorized;
      return '';
    },
    removeStorageSync() {},
    showToast() {},
    showActionSheet() {},
    showLoading() {},
    hideLoading() {},
  };
  const guestPage = {
    selectComponent(selector) {
      assert.equal(selector, '#auth-login-dialog');
      return { open: () => { dialogOpenCount += 1; } };
    },
  };
  const auth = loadAuthIdentity(authSource, {
    getApp: () => app,
    getCurrentPages: () => [guestPage],
    userAPI: {
      async getUserInfo() {
        serverUserCalls += 1;
        return { code: 200, data: { phoneNumber: '13800000000', identityType: 'OWNER' } };
      },
      async updateUserInfo() {
        throw new Error('身份已存在时不应保存');
      },
    },
    wx,
  });

  assert.equal(await auth.ensureMutationReady(guestPage), false, '首次游客点击必须仅打开弹框');
  assert.equal(dialogOpenCount, 1);
  assert.equal(serverUserCalls, 0, '游客点击不得调用业务或个人接口');
  token = 'token';
  phoneAuthorized = true;
  app.globalData.userInfo = { phoneNumber: '13800000000', identityType: 'OWNER' };
  assert.equal(await auth.ensureMutationReady(guestPage), true, '登录完成后必须由用户再次点击才放行业务');
  assert.equal(serverUserCalls, 1);

  let phoneLoginCalls = 0;
  let identityPrompts = 0;
  let identityUpdates = 0;
  const loginApp = {
    globalData: { userInfo: null, offlineMode: false },
    async phoneLogin(code) {
      phoneLoginCalls += 1;
      assert.equal(code, 'phone-code');
      this.globalData.userInfo = { phoneNumber: '13800000000' };
    },
    eventBus: { emit() {} },
  };
  const loginPage = {};
  const loginAuth = loadAuthIdentity(authSource, {
    getApp: () => loginApp,
    getCurrentPages: () => [loginPage],
    userAPI: {
      async getUserInfo() {
        return { code: 200, data: loginApp.globalData.userInfo };
      },
      async updateUserInfo({ identityType }) {
        identityUpdates += 1;
        loginApp.globalData.userInfo = { ...loginApp.globalData.userInfo, identityType };
        return { code: 200, data: loginApp.globalData.userInfo };
      },
    },
    wx: {
      getStorageSync() {
        return '';
      },
      showActionSheet(options) {
        identityPrompts += 1;
        options.success({ tapIndex: 0 });
      },
      showLoading() {},
      hideLoading() {},
      showToast() {},
    },
  });
  await loginAuth.completeAuthorizedLogin('phone-code', loginPage);
  assert.equal(phoneLoginCalls, 1, '授权成功必须复用 app.phoneLogin');
  assert.equal(identityPrompts, 1, '登录后未选身份必须立即引导选择');
  assert.equal(identityUpdates, 1, '选择身份后必须保存');

  loginApp.globalData.userInfo = { phoneNumber: '13800000000', adminLabel: '管理员' };
  identityPrompts = 0;
  identityUpdates = 0;
  await loginAuth.ensureIdentitySelected(loginPage);
  assert.equal(identityPrompts, 1, '管理员标签不能绕过 OWNER/OUTSIDER 身份选择');
  assert.equal(identityUpdates, 1, '管理员缺少 identityType 时仍必须保存身份');

  loginApp.globalData.userInfo = { phoneNumber: '13800000000' };
  identityPrompts = 0;
  identityUpdates = 0;
  const loggedInDialogOpens = 0;
  const identityOnlyAuth = loadAuthIdentity(authSource, {
    getApp: () => loginApp,
    getCurrentPages: () => [loginPage],
    userAPI: {
      async getUserInfo() {
        return { code: 200, data: loginApp.globalData.userInfo };
      },
      async updateUserInfo({ identityType }) {
        identityUpdates += 1;
        loginApp.globalData.userInfo = { ...loginApp.globalData.userInfo, identityType };
        return { code: 200, data: loginApp.globalData.userInfo };
      },
    },
    wx: {
      getStorageSync(key) {
        if (key === 'access_token') return 'token';
        if (key === 'phone_authorized_login_v1') return true;
        return '';
      },
      showActionSheet(options) {
        identityPrompts += 1;
        options.success({ tapIndex: 1 });
      },
      showLoading() {},
      hideLoading() {},
      showToast() {},
    },
  });
  assert.equal(await identityOnlyAuth.ensureMutationReady(loginPage), true);
  assert.equal(loggedInDialogOpens, 0, '已登录未选身份时不得再弹登录框');
  assert.equal(identityPrompts, 1, '已登录未选身份时只引导身份选择');
  assert.equal(phoneLoginCalls, 1, '身份补全不得重复手机号登录');

  loginApp.globalData.userInfo = { phoneNumber: '13800000000' };
  identityPrompts = 0;
  identityUpdates = 0;
  let pendingIdentitySheet;
  const concurrentAuth = loadAuthIdentity(authSource, {
    getApp: () => loginApp,
    getCurrentPages: () => [loginPage],
    userAPI: {
      async getUserInfo() {
        return { code: 200, data: loginApp.globalData.userInfo };
      },
      async updateUserInfo({ identityType }) {
        identityUpdates += 1;
        loginApp.globalData.userInfo = { ...loginApp.globalData.userInfo, identityType };
        return { code: 200, data: loginApp.globalData.userInfo };
      },
    },
    wx: {
      getStorageSync(key) {
        if (key === 'access_token') return 'token';
        if (key === 'phone_authorized_login_v1') return true;
        return '';
      },
      showActionSheet(options) {
        identityPrompts += 1;
        pendingIdentitySheet = options;
      },
      showLoading() {},
      hideLoading() {},
      showToast() {},
    },
  });
  const concurrentReady = [
    concurrentAuth.ensureMutationReady(loginPage),
    concurrentAuth.ensureMutationReady(loginPage),
  ];
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(identityPrompts, 1, '并发鉴权只能打开一个身份选择');
  pendingIdentitySheet.success({ tapIndex: 0 });
  assert.deepEqual(await Promise.all(concurrentReady), [true, true]);
  assert.equal(identityUpdates, 1, '并发鉴权只能保存一次身份');

  let releaseServerUser;
  let activePages;
  const originalPage = { selectComponent: () => ({ open() {} }) };
  const replacementPage = {
    selectComponent() {
      throw new Error('旧操作不得在新页面寻找弹框');
    },
  };
  activePages = [originalPage];
  const switchedAuth = loadAuthIdentity(authSource, {
    getApp: () => app,
    getCurrentPages: () => activePages,
    userAPI: {
      getUserInfo() {
        return new Promise((resolve) => {
          releaseServerUser = resolve;
        });
      },
      async updateUserInfo() {
        throw new Error('页面切换后不得继续身份或业务流程');
      },
    },
    wx: {
      getStorageSync(key) {
        if (key === 'access_token') return 'token';
        if (key === 'phone_authorized_login_v1') return true;
        return '';
      },
      showActionSheet() {
        throw new Error('页面切换后不得弹身份选择');
      },
      removeStorageSync() {},
      showToast() {},
    },
  });
  const switchedReady = switchedAuth.ensureMutationReady(originalPage);
  await Promise.resolve();
  activePages = [replacementPage];
  releaseServerUser({ code: 200, data: { phoneNumber: '13800000000' } });
  assert.equal(await switchedReady, false, '鉴权期间切页必须中止旧操作');

  let completeCalls = 0;
  const toasts = [];
  const dialog = loadDialog(dialogSource, {
    async completeAuthorizedLogin(code) {
      completeCalls += 1;
      assert.equal(code, 'phone-code');
      return true;
    },
    wx: {
      showToast(options) {
        toasts.push(options.title);
      },
    },
  });
  const { instance, events } = instantiate(dialog);
  instance.open();
  instance.open();
  assert.equal(instance.data.visible, true, 'open 必须幂等');
  assert.equal(instance.data.submitting, false);
  instance.onCancel();
  assert.equal(instance.data.visible, false, '取消必须关闭弹框');
  assert.equal(completeCalls, 0, '取消不得登录');
  assert.deepEqual(events.map((event) => event.name), ['cancel']);

  instance.open();
  await instance.onGetPhoneNumber({ detail: { errMsg: 'getPhoneNumber:fail user deny' } });
  assert.equal(instance.data.visible, true, '授权失败后应保留弹框供重试');
  assert.equal(instance.data.submitting, false, '授权失败后必须恢复按钮');
  assert.equal(completeCalls, 0);
  assert.ok(toasts.length > 0, '授权失败必须提示');

  await Promise.all([
    instance.onGetPhoneNumber({ detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code' } }),
    instance.onGetPhoneNumber({ detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code' } }),
  ]);
  assert.equal(completeCalls, 1, '重复点击不得发起重复登录请求');
  assert.equal(instance.data.visible, false, '登录并完成身份后关闭弹框');
  assert.deepEqual(
    events.map((event) => event.name),
    ['cancel', 'authorized'],
    '授权成功只通知登录态更新，不携带待执行操作',
  );
  assert.equal(events[1].detail, undefined);

  instance.open();
  const pendingDetachedLogin = instance.onGetPhoneNumber({
    detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code' },
  });
  dialog.lifetimes.detached.call(instance);
  await pendingDetachedLogin;
  assert.equal(instance._alive, false, 'detached 必须标记组件失活');
  const detachedEventCount = events.length;
  instance.data.submitting = false;
  instance.onCancel();
  assert.equal(events.length, detachedEventCount, 'detached 后不得再触发事件');

  process.stdout.write('auth login dialog guards passed\n');
}

run();
