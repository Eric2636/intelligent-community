const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');
const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function loadPageDefinition(pageSource, globals) {
  let definition;
  const transformed = pageSource.replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(
    transformed,
    {
      ...globals,
      Page(config) {
        definition = config;
      },
    },
    { filename: globals.filename },
  );
  return definition;
}

function instantiatePage(definition) {
  const setDataCalls = [];
  const page = {
    data: { ...definition.data },
    setData(updates, callback) {
      setDataCalls.push(updates);
      Object.assign(this.data, updates);
      if (callback) callback();
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return { page, setDataCalls };
}

function createMyPage(pageSource, options = {}) {
  const navigationCalls = [];
  const timers = [];
  const clearedTimers = [];
  const app = {
    eventBus: {
      emit() {},
      off() {},
      on() {},
    },
    globalData: {
      offlineMode: false,
      openid: '',
      useCloudBase: false,
      userInfo: { phoneNumber: '13800000000' },
    },
  };
  const wx = {
    getStorageSync: () => '',
    hideLoading() {},
    navigateTo(config) {
      navigationCalls.push(config);
      if (options.navigateTo) return options.navigateTo(config);
      return undefined;
    },
    removeStorageSync() {},
    setEnableDebug() {},
    showLoading() {},
    showModal() {},
    showToast() {},
    switchTab() {},
  };
  const definition = loadPageDefinition(pageSource, {
    LIST_REFRESH_KEYS: { user: 'user' },
    consumeListRefresh: () => false,
    decryptText: (value) => value,
    ensureIdentitySelected: async () => true,
    ensureMutationReady: options.ensureMutationReady || (async () => true),
    filename: 'pages/my/index.js',
    getApp: () => app,
    isModuleEnabled: () => true,
    mallFavoritesUrl: () => '/packageMall/favorites/index',
    mallMyItemsUrl: () => '/packageMall/my-list/index',
    mallOrdersUrl: () => '/packageMall/order-list/index',
    setTimeout(callback, delay) {
      const timer = { callback, cleared: false, delay, id: timers.length + 1 };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(timerId) {
      clearedTimers.push(timerId);
      const timer = timers.find(({ id }) => id === timerId);
      if (timer) timer.cleared = true;
    },
    syncCustomTabBar() {},
    userAPI: { getUserInfo: async () => ({ code: 200, data: {} }) },
    wx,
  });
  const { page } = instantiatePage(definition);
  page._servicePageAlive = true;
  page._openingService = false;
  return { clearedTimers, navigationCalls, page, timers };
}

function createMyTasksPage(pageSource, options = {}) {
  const apiCalls = [];
  const navigationCalls = [];
  const toastCalls = [];
  const taskAPI = {
    getMyTasks(type) {
      const request = deferred();
      apiCalls.push({ request, type });
      return request.promise;
    },
  };
  const definition = loadPageDefinition(pageSource, {
    LIST_REFRESH_KEYS: { taskMine: 'taskMine' },
    consumeListRefresh: () => false,
    ensureMutationReady: options.ensureMutationReady || (async () => true),
    filename: 'packageTask/my-tasks/index.js',
    formatDateTimeYmdHm: (value) => value,
    redirectIfEntryHidden: () => false,
    taskAPI,
    normalizeAvatar: (value) => value || '',
    wx: {
      navigateTo(config) {
        navigationCalls.push(config);
      },
      previewImage() {},
      setNavigationBarTitle() {},
      showToast(config) {
        toastCalls.push(config);
      },
      stopPullDownRefresh() {},
    },
  });
  const instance = instantiatePage(definition);
  return { ...instance, apiCalls, navigationCalls, toastCalls };
}

async function verifyServiceNavigation(myPageSource) {
  const authGate = deferred();
  let authCalls = 0;
  const pending = createMyPage(myPageSource, {
    ensureMutationReady: () => {
      authCalls += 1;
      return authGate.promise;
    },
  });
  const taskTap = { currentTarget: { dataset: { name: '我的任务', url: 'task' } } };
  const firstTap = pending.page.onMenuTap(taskTap);
  const duplicateTap = pending.page.onMenuTap(taskTap);
  await duplicateTap;
  assert.equal(authCalls, 1, '权限检查等待期间重复点击只能触发一次鉴权');
  assert.equal(pending.navigationCalls.length, 0, '权限检查完成前不得导航');
  authGate.resolve(true);
  await firstTap;
  assert.equal(pending.navigationCalls.length, 1, '快速重复点击只能压入一个页面');

  pending.navigationCalls[0].complete({ errMsg: 'navigateTo:ok' });
  assert.equal(pending.page._openingService, true, 'navigateTo complete 后需保留短延迟锁');
  assert.equal(pending.timers.length, 1);
  assert.equal(pending.timers[0].delay, 300);
  pending.timers[0].callback();
  assert.equal(pending.page._openingService, false, '300ms 定时器执行后必须解锁');

  const denied = createMyPage(myPageSource, { ensureMutationReady: async () => false });
  await denied.page.onMenuTap(taskTap);
  assert.equal(denied.navigationCalls.length, 0, '鉴权拒绝时不得导航');
  assert.equal(denied.page._openingService, false, '鉴权拒绝后必须立即解锁');

  const failed = createMyPage(myPageSource, {
    navigateTo(config) {
      config.complete({ errMsg: 'navigateTo:fail page limit' });
    },
  });
  await failed.page.onMenuTap(taskTap);
  assert.equal(failed.page._openingService, true, '导航失败的 complete 回调仍应执行短延迟解锁');
  failed.timers[0].callback();
  assert.equal(failed.page._openingService, false);

  const thrown = createMyPage(myPageSource, {
    navigateTo() {
      throw new Error('navigateTo sync failure');
    },
  });
  await assert.rejects(thrown.page.onMenuTap(taskTap), /navigateTo sync failure/);
  assert.equal(thrown.page._openingService, false, 'navigateTo 同步抛错后不得永久锁定');

  const unloaded = createMyPage(myPageSource);
  await unloaded.page.onMenuTap(taskTap);
  unloaded.navigationCalls[0].complete({ errMsg: 'navigateTo:ok' });
  const scheduledTimerId = unloaded.timers[0].id;
  unloaded.page.onUnload();
  assert.equal(unloaded.page._openingService, false, '页面卸载必须立即解锁');
  assert.deepEqual(unloaded.clearedTimers, [scheduledTimerId], '页面卸载必须清理延迟解锁定时器');
}

async function verifyTaskTabsAndRequestOrder(myTasksPageSource) {
  const current = createMyTasksPage(myTasksPageSource);
  current.page.onLoad({});
  await flush();
  assert.deepEqual(
    current.apiCalls.map(({ type }) => type),
    ['published'],
    '进入页面应加载已发布任务',
  );

  current.page.onTabTap({ currentTarget: { dataset: { tab: 'taken' } } });
  await flush();
  current.page.onTabTap({ currentTarget: { dataset: { tab: 'published' } } });
  await flush();
  assert.deepEqual(
    current.apiCalls.map(({ type }) => type),
    ['published', 'taken', 'published'],
    '发布→领取→发布必须只在当前页发起对应列表请求',
  );
  assert.equal(current.navigationCalls.length, 0, '切换任务页签不得调用导航 API');

  current.apiCalls[0].request.resolve({ code: 200, data: [{ id: 'old-published' }] });
  current.apiCalls[1].request.resolve({ code: 200, data: [{ id: 'old-taken' }] });
  await flush();
  assert.equal(current.page.data.loading, true, '旧请求完成不得关闭最新请求的 loading');
  assert.equal(current.page.data.publishedList.length, 0, '旧发布请求不得覆盖最新发布列表');
  assert.equal(current.page.data.takenList.length, 0, '旧领取请求不得回写已离开的页签');

  current.apiCalls[2].request.resolve({ code: 200, data: [{ id: 'latest-published' }] });
  await flush();
  assert.equal(current.page.data.loading, false, '只有最新有效请求可以关闭 loading');
  assert.equal(current.page.data.publishedList[0].id, 'latest-published');
}

async function verifyTaskUnloadGuards(myTasksPageSource) {
  const resolvedAfterUnload = createMyTasksPage(myTasksPageSource);
  resolvedAfterUnload.page.onLoad({});
  await flush();
  resolvedAfterUnload.page.onUnload();
  const setDataCountAfterUnload = resolvedAfterUnload.setDataCalls.length;
  resolvedAfterUnload.apiCalls[0].request.resolve({ code: 200, data: [{ id: 'late' }] });
  await flush();
  assert.equal(
    resolvedAfterUnload.setDataCalls.length,
    setDataCountAfterUnload,
    '页面卸载后的成功响应不得再 setData',
  );
  assert.equal(resolvedAfterUnload.toastCalls.length, 0, '页面卸载后的成功响应不得提示');

  const rejectedAfterUnload = createMyTasksPage(myTasksPageSource);
  rejectedAfterUnload.page.onLoad({});
  await flush();
  rejectedAfterUnload.page.onUnload();
  const rejectedSetDataCount = rejectedAfterUnload.setDataCalls.length;
  rejectedAfterUnload.apiCalls[0].request.reject(new Error('late network failure'));
  await flush();
  assert.equal(
    rejectedAfterUnload.setDataCalls.length,
    rejectedSetDataCount,
    '页面卸载后的异常不得再 setData',
  );
  assert.equal(rejectedAfterUnload.toastCalls.length, 0, '页面卸载后的异常不得 showToast');
}

async function run() {
  const [myPageSource, myTasksPageSource] = await Promise.all([
    source('pages/my/index.js'),
    source('packageTask/my-tasks/index.js'),
  ]);

  await verifyServiceNavigation(myPageSource);
  await verifyTaskTabsAndRequestOrder(myTasksPageSource);
  await verifyTaskUnloadGuards(myTasksPageSource);
  assert.doesNotMatch(myTasksPageSource, /\bauthReady\b/, '未读取的 authReady 状态必须删除');
  process.stdout.write('my task navigation behavior passed\n');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
