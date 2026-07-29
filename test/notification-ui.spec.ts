import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function flush() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function loadNotificationRoute(routeSource) {
  const transformed = routeSource
    .replace(/export function /g, 'function ')
    .concat('\nmodule.exports = { notificationUrl, notificationProbe };\n');
  const context = { module: { exports: {} } };
  vm.runInNewContext(transformed, context, { filename: 'utils/notificationRoute.js' });
  return context.module.exports;
}

function loadNoticePage(pageSource, dependencies) {
  let definition;
  vm.runInNewContext(pageSource.replace(/^import .*;\s*$/gm, ''), {
    Page(config) {
      definition = config;
    },
    commonAPI: dependencies.commonAPI,
    ensureMutationReady: dependencies.ensureMutationReady,
    notificationProbe: dependencies.notificationProbe,
    notificationUrl: dependencies.notificationUrl,
    NOTIFICATION_UNREAD_EVENT: 'notificationUnreadCountChange',
    forumAPI: dependencies.forumAPI,
    taskAPI: dependencies.taskAPI,
    mallAPI: dependencies.mallAPI,
    getApp: () => dependencies.app,
    wx: dependencies.wx,
    Date,
    Promise,
    setTimeout,
  });
  assert.ok(definition);
  return definition;
}

function instantiatePage(definition) {
  const page = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(updates, callback) {
      Object.assign(this.data, updates);
      if (callback) callback();
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return page;
}

function notification(overrides = {}) {
  return {
    id: 'notice-1',
    type: 'task',
    bizType: 'task',
    bizId: 'task-1',
    title: '任务有新状态',
    content: '有人领取了你的任务',
    readAt: null,
    createdAt: '2026-07-26 09:00',
    ...overrides,
  };
}

function createDependencies(overrides = {}) {
  const calls = {
    list: 0,
    unread: 0,
    mark: 0,
    allRead: 0,
    remove: 0,
    probe: 0,
    navigate: [],
    toast: [],
  };
  const commonAPI = {
    async getNotifications() {
      calls.list += 1;
      return { code: 200, data: { list: [], total: 0, page: 1, pageSize: 20 } };
    },
    async getNotificationUnreadCount() {
      calls.unread += 1;
      return { code: 200, data: { count: 0 } };
    },
    async markNotificationRead() {
      calls.mark += 1;
      return { code: 200, data: {} };
    },
    async markAllNotificationsRead() {
      calls.allRead += 1;
      return { code: 200, data: {} };
    },
    async deleteNotification() {
      calls.remove += 1;
      return { code: 200, data: {} };
    },
    ...overrides.commonAPI,
  };
  const eventHandlers = {};
  const eventBus = {
    on(name, callback) {
      if (!eventHandlers[name]) eventHandlers[name] = [];
      eventHandlers[name].push(callback);
    },
    off(name, callback) {
      if (!eventHandlers[name]) return;
      eventHandlers[name] = eventHandlers[name].filter((item) => item !== callback);
    },
    emit(name, value) {
      (eventHandlers[name] || []).slice().forEach((callback) => callback(value));
    },
  };
  const app = {
    globalData: { notificationUnreadCount: 0 },
    eventBus,
    async refreshNotificationUnreadCount() {
      calls.unread += 1;
      return 0;
    },
    ...overrides.app,
  };
  return {
    calls,
    commonAPI,
    app,
    ensureMutationReady: overrides.ensureMutationReady || (async () => true),
    notificationUrl:
      overrides.notificationUrl ||
      ((row) => `/packageTask/detail/index?id=${encodeURIComponent(row.bizId)}`),
    notificationProbe:
      overrides.notificationProbe ||
      (async () => {
        calls.probe += 1;
        return { code: 200, data: {} };
      }),
    forumAPI: {},
    taskAPI: {},
    mallAPI: {},
    wx: {
      navigateTo({ url }) {
        calls.navigate.push(url);
      },
      showToast({ title }) {
        calls.toast.push(title);
      },
      stopPullDownRefresh() {},
      ...overrides.wx,
    },
  };
}

test('commonAPI exposes five authenticated notification endpoints', async () => {
  const cloud = await source('api/cloud.js');
  assert.match(cloud, /getNotifications\(params = \{\}\)[\s\S]*path: 'api\/notifications'[\s\S]*auth: true/);
  assert.match(cloud, /getNotificationUnreadCount\(\)[\s\S]*path: 'api\/notifications\/unread-count'[\s\S]*auth: true/);
  assert.match(cloud, /markNotificationRead\(id\)[\s\S]*method: 'PATCH'[\s\S]*api\/notifications\/\$\{[^}]+\}\/read[\s\S]*auth: true/);
  assert.match(cloud, /markAllNotificationsRead\(\)[\s\S]*method: 'PATCH'[\s\S]*path: 'api\/notifications\/read-all'[\s\S]*auth: true/);
  assert.match(cloud, /deleteNotification\(id\)[\s\S]*method: 'DELETE'[\s\S]*api\/notifications\/\$\{[^}]+\}[\s\S]*auth: true/);
});

test('notificationRoute only maps strict business types and safely encodes ids', async () => {
  const route = loadNotificationRoute(await source('utils/notificationRoute.js'));
  assert.equal(
    route.notificationUrl({ bizType: 'forum', bizId: 'post?id=1&x=/../' }),
    '/packageForum/post/index?postId=post%3Fid%3D1%26x%3D%2F..%2F',
  );
  assert.equal(route.notificationUrl({ bizType: 'task', bizId: 'task/1' }), '/packageTask/detail/index?id=task%2F1');
  assert.equal(route.notificationUrl({ bizType: 'mall', bizId: 'order#1' }), '/packageMall/order-detail/index?id=order%231');
  [
    { bizType: 'system', bizId: 'ignored' },
    { bizType: 'forum?x=1', bizId: 'post-1' },
    { bizType: 'forum', bizId: '' },
    { bizType: 'forum', bizId: { toString: () => 'attack' } },
    { bizType: '__proto__', bizId: 'x' },
  ].forEach((row) => {
    assert.equal(route.notificationUrl(row), '');
  });
});

test('notificationRoute selects exactly one matching detail probe', async () => {
  const route = loadNotificationRoute(await source('utils/notificationRoute.js'));
  const calls = [];
  const apis = {
    forumAPI: { getPostDetail: async (id) => calls.push(`forum:${id}`) },
    taskAPI: { getTaskDetail: async (id) => calls.push(`task:${id}`) },
    mallAPI: { getOrderDetail: async (id) => calls.push(`mall:${id}`) },
  };
  await route.notificationProbe({ bizType: 'forum', bizId: 'post-1' }, apis);
  await route.notificationProbe({ bizType: 'task', bizId: 'task-1' }, apis);
  await route.notificationProbe({ bizType: 'mall', bizId: 'order-1' }, apis);
  assert.equal(route.notificationProbe({ bizType: 'system', bizId: 'x' }, apis), null);
  assert.deepEqual(calls, ['forum:post-1', 'task:task-1', 'mall:order-1']);
});

test('detail probes encode malicious ids in the actual API request path', async () => {
  const cloudSource = await source('api/cloud.js');
  const transformed = cloudSource
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/export const /g, 'const ')
    .replace(/export default[\s\S]*$/m, '')
    .concat('\nmodule.exports = { taskAPI, forumAPI, mallAPI };\n');
  const requests = [];
  const context = {
    module: { exports: {} },
    httpRequest(options) {
      requests.push(options);
      return Promise.resolve({ code: 200, data: {} });
    },
    formatDateTimeFields: (value) => value,
    encodeURIComponent,
  };
  vm.runInNewContext(transformed, context, { filename: 'api/cloud.js' });
  const { taskAPI: task, forumAPI: forum, mallAPI: mall } = context.module.exports;
  const malicious = '../notifications?x#';
  await task.getTaskDetail(malicious);
  await forum.getPostDetail(malicious);
  await mall.getOrderDetail(malicious);
  assert.deepEqual(
    requests.map((request) => request.path),
    [
      'api/tasks/..%2Fnotifications%3Fx%23',
      'api/posts/..%2Fnotifications%3Fx%23',
      'api/orders/..%2Fnotifications%3Fx%23',
    ],
  );

  const route = loadNotificationRoute(await source('utils/notificationRoute.js'));
  let probes = 0;
  const apis = {
    forumAPI: { getPostDetail() { probes += 1; } },
    taskAPI: { getTaskDetail() { probes += 1; } },
    mallAPI: { getOrderDetail() { probes += 1; } },
  };
  assert.equal(route.notificationProbe({ bizType: 'forum', bizId: '' }, apis), null);
  assert.equal(route.notificationProbe({ bizType: 'unknown', bizId: malicious }, apis), null);
  assert.equal(probes, 0);
});

test('notice template follows TDesign 1.12.1 SwipeCell right action and click event contract', async () => {
  const [template, pageSource, config, componentTemplate, componentSource, packageInfo] = await Promise.all([
    source('packageCommon/notice/index.wxml'),
    source('packageCommon/notice/index.js'),
    source('packageCommon/notice/index.json'),
    source('node_modules/tdesign-miniprogram/miniprogram_dist/swipe-cell/swipe-cell.wxml'),
    source('node_modules/tdesign-miniprogram/miniprogram_dist/swipe-cell/swipe-cell.js'),
    source('node_modules/tdesign-miniprogram/package.json'),
  ]);
  assert.match(packageInfo, /"version": "1\.12\.1"/);
  assert.match(componentTemplate, /wx:for="{{right}}"/);
  assert.match(componentSource, /triggerEvent\("click",t\)/);
  assert.match(config, /"t-swipe-cell": "tdesign-miniprogram\/swipe-cell\/swipe-cell"/);
  assert.match(template, /<t-swipe-cell\b[^>]*right="{{item\.rightActions}}"[^>]*bind:click="deleteNotification"/);
  assert.match(template, /notice-type \{\{item\.bizType\}\}/);
  assert.match(template, /未读 \{\{unreadCount\}\}/);
  assert.match(pageSource, /className: 'notice-delete-action'/);
});

test('guest deep link opens auth only and authorized event never replays list loading', async () => {
  const dependencies = createDependencies({ ensureMutationReady: async () => false });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.onLoad();
  await flush();
  assert.equal(dependencies.calls.list, 0);
  assert.equal(dependencies.calls.unread, 0);
  page.onAuthorized();
  await flush();
  assert.equal(dependencies.calls.list, 0);
  assert.equal(dependencies.calls.unread, 0);
  assert.equal(page.data.showManualLoad, true);
});

test('logged-in entry and manual post-login load refresh absolute unread count, then unsubscribe on unload', async () => {
  const dependencies = createDependencies({
    app: {
      globalData: { notificationUnreadCount: 2 },
    },
  });
  dependencies.app.refreshNotificationUnreadCount = async () => {
    dependencies.calls.unread += 1;
    dependencies.app.globalData.notificationUnreadCount = 5;
    dependencies.app.eventBus.emit('notificationUnreadCountChange', 5);
    return 5;
  };
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.onLoad();
  await flush();
  await flush();
  assert.equal(dependencies.calls.unread, 1);
  assert.equal(page.data.unreadCount, 5);
  dependencies.app.eventBus.emit('notificationUnreadCountChange', 8);
  assert.equal(page.data.unreadCount, 8);
  page.onUnload();
  dependencies.app.eventBus.emit('notificationUnreadCountChange', 1);
  assert.equal(page.data.unreadCount, 8);

  let loggedIn = false;
  const manualDependencies = createDependencies({
    ensureMutationReady: async () => loggedIn,
  });
  const manualDefinition = loadNoticePage(await source('packageCommon/notice/index.js'), manualDependencies);
  const manualPage = instantiatePage(manualDefinition);
  manualPage.onLoad();
  await flush();
  manualPage.onAuthorized();
  assert.equal(manualDependencies.calls.unread, 0);
  loggedIn = true;
  await manualPage.onManualLoad();
  assert.equal(manualDependencies.calls.unread, 1);
});

test('manual load requests descending server page and accepts only latest response', async () => {
  const first = deferred();
  const second = deferred();
  const params = [];
  const dependencies = createDependencies({
    commonAPI: {
      getNotifications(query) {
        params.push(query);
        return params.length === 1 ? first.promise : second.promise;
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  const older = page.loadNotices({ reset: true });
  await flush();
  const newer = page.loadNotices({ reset: true });
  second.resolve({ code: 200, data: { list: [notification({ id: 'new' })], total: 1, page: 1, pageSize: 20 } });
  await newer;
  first.resolve({ code: 200, data: { list: [notification({ id: 'stale' })], total: 1, page: 1, pageSize: 20 } });
  await older;
  assert.equal(JSON.stringify(params), JSON.stringify([{ page: 1, pageSize: 20 }, { page: 1, pageSize: 20 }]));
  assert.equal(page.data.noticeList[0].id, 'new');
});

test('latest invocation wins even when its authorization check resolves first', async () => {
  const firstAuth = deferred();
  const secondAuth = deferred();
  const authChecks = [firstAuth.promise, secondAuth.promise];
  let apiCalls = 0;
  const dependencies = createDependencies({
    ensureMutationReady: () => authChecks.shift(),
    commonAPI: {
      async getNotifications() {
        apiCalls += 1;
        return { code: 200, data: { list: [notification({ id: 'latest' })], total: 1 } };
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  const older = page.loadNotices({ reset: true });
  const newer = page.loadNotices({ reset: true });
  secondAuth.resolve(true);
  await newer;
  firstAuth.resolve(true);
  await older;
  assert.equal(apiCalls, 1);
  assert.equal(page.data.noticeList[0].id, 'latest');
});

test('page unload invalidates pending list response', async () => {
  const pending = deferred();
  const dependencies = createDependencies({
    commonAPI: { getNotifications: () => pending.promise },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  const request = page.loadNotices({ reset: true });
  page.onUnload();
  pending.resolve({ code: 200, data: { list: [notification()], total: 1, page: 1, pageSize: 20 } });
  await request;
  assert.deepEqual(page.data.noticeList, []);
});

test('unread click marks read before probing and server unread count is the only badge refresh', async () => {
  const order = [];
  const dependencies = createDependencies({
    commonAPI: {
      async markNotificationRead() {
        order.push('mark');
        return { code: 200, data: {} };
      },
    },
    app: {
      eventBus: { emit() {} },
      async refreshNotificationUnreadCount() {
        order.push('count');
        return 4;
      },
    },
    notificationProbe: async () => {
      order.push('probe');
      return { code: 200, data: {} };
    },
    wx: {
      navigateTo({ url }) {
        order.push(`navigate:${url}`);
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification()];
  await page.onNoticeTap({ currentTarget: { dataset: { id: 'notice-1' } } });
  assert.deepEqual(order, [
    'mark',
    'count',
    'probe',
    'navigate:/packageTask/detail/index?id=task-1',
  ]);
  assert.ok(page.data.noticeList[0].readAt);
});

test('mark-read failure preserves unread row and blocks probe and navigation', async () => {
  const dependencies = createDependencies({
    commonAPI: { markNotificationRead: async () => { throw new Error('network'); } },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification()];
  await page.onNoticeTap({ currentTarget: { dataset: { id: 'notice-1' } } });
  assert.equal(page.data.noticeList[0].readAt, null);
  assert.equal(dependencies.calls.probe, 0);
  assert.equal(dependencies.calls.navigate.length, 0);
});

test('system message marks read without target warning or navigation', async () => {
  const dependencies = createDependencies();
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification({ type: 'system', bizType: 'system', bizId: null })];
  await page.onNoticeTap({ currentTarget: { dataset: { id: 'notice-1' } } });
  assert.equal(dependencies.calls.mark, 1);
  assert.equal(dependencies.calls.probe, 0);
  assert.equal(dependencies.calls.navigate.length, 0);
  assert.equal(dependencies.calls.toast.includes('内容已不存在'), false);
});

test('deleted target stays in notification list and reports content missing', async () => {
  const missing = Object.assign(new Error('not found'), { statusCode: 404 });
  const dependencies = createDependencies({
    notificationProbe: async () => { throw missing; },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification({ readAt: '2026-07-26 09:10' })];
  await page.onNoticeTap({ currentTarget: { dataset: { id: 'notice-1' } } });
  assert.equal(page.data.noticeList.length, 1);
  assert.equal(dependencies.calls.toast.at(-1), '内容已不存在');
  assert.equal(dependencies.calls.navigate.length, 0);
});

test('double notification taps share one mark/probe/navigation flight', async () => {
  const pending = deferred();
  const dependencies = createDependencies({
    commonAPI: {
      async markNotificationRead() {
        dependencies.calls.mark += 1;
        return pending.promise;
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification()];
  const event = { currentTarget: { dataset: { id: 'notice-1' } } };
  const first = page.onNoticeTap(event);
  const second = page.onNoticeTap(event);
  pending.resolve({ code: 200, data: {} });
  await Promise.all([first, second]);
  assert.equal(dependencies.calls.mark, 1);
  assert.equal(dependencies.calls.probe, 1);
  assert.equal(dependencies.calls.navigate.length, 1);
});

test('tap single-flight is keyed by notification id and unload blocks late navigation', async () => {
  const probeA = deferred();
  const probeB = deferred();
  const probeC = deferred();
  const dependencies = createDependencies({
    notificationProbe(row) {
      dependencies.calls.probe += 1;
      if (row.id === 'notice-a') return probeA.promise;
      if (row.id === 'notice-b') return probeB.promise;
      return probeC.promise;
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [
    notification({ id: 'notice-a', bizId: 'task-a', readAt: 'read' }),
    notification({ id: 'notice-b', bizId: 'task-b', readAt: 'read' }),
    notification({ id: 'notice-c', bizId: 'task-c', readAt: 'read' }),
  ];
  const event = (id) => ({ currentTarget: { dataset: { id } } });
  const firstA = page.onNoticeTap(event('notice-a'));
  const secondA = page.onNoticeTap(event('notice-a'));
  const firstB = page.onNoticeTap(event('notice-b'));
  assert.equal(firstA, secondA);
  assert.notEqual(firstA, firstB);
  assert.equal(dependencies.calls.probe, 2);
  probeB.resolve({ code: 200, data: {} });
  probeA.resolve({ code: 200, data: {} });
  await Promise.all([firstA, firstB]);
  assert.equal(dependencies.calls.navigate.length, 2);

  const late = page.onNoticeTap(event('notice-c'));
  assert.equal(page._noticeTapFlights.size, 1);
  page.onUnload();
  assert.equal(page._noticeTapFlights.size, 0);
  probeC.resolve({ code: 200, data: {} });
  await late;
  assert.equal(dependencies.calls.navigate.length, 2);
});

test('mark-all-read and delete are single-flight and preserve local rows on failure', async () => {
  const allRead = deferred();
  const remove = deferred();
  const dependencies = createDependencies({
    commonAPI: {
      markAllNotificationsRead: () => {
        dependencies.calls.allRead += 1;
        return allRead.promise;
      },
      deleteNotification: () => {
        dependencies.calls.remove += 1;
        return remove.promise;
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification()];

  const readOne = page.markAllRead();
  const readTwo = page.markAllRead();
  allRead.reject(new Error('read failed'));
  await Promise.all([readOne, readTwo]);
  assert.equal(dependencies.calls.allRead, 1);
  assert.equal(page.data.noticeList[0].readAt, null);

  const event = { detail: { id: 'notice-1' }, currentTarget: { dataset: {} } };
  const deleteOne = page.deleteNotification(event);
  const deleteTwo = page.deleteNotification(event);
  assert.equal(deleteTwo, deleteOne);
  remove.reject(new Error('delete failed'));
  await Promise.all([deleteOne, deleteTwo]);
  assert.equal(dependencies.calls.remove, 1);
  assert.equal(page.data.noticeList.length, 1);
});

test('successful delete removes only that row and refreshes server count', async () => {
  const remaining = notification({ id: 'notice-2' });
  const dependencies = createDependencies({
    commonAPI: {
      async getNotifications() {
        return { code: 200, data: { list: [remaining], total: 1, page: 1, pageSize: 20 } };
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = [notification(), notification({ id: 'notice-2' })];
  await page.deleteNotification({ detail: { id: 'notice-1' }, currentTarget: { dataset: {} } });
  assert.deepEqual(page.data.noticeList.map((row) => row.id), ['notice-2']);
  assert.equal(dependencies.calls.remove, 1);
  assert.equal(dependencies.calls.unread, 1);
});

test('successful first-page delete reloads page one so the next server row fills the hole', async () => {
  const initial = Array.from({ length: 20 }, (_, index) =>
    notification({ id: `notice-${index + 1}` }),
  );
  const reloaded = Array.from({ length: 20 }, (_, index) =>
    notification({ id: `notice-${index + 2}` }),
  );
  const listQueries = [];
  const dependencies = createDependencies({
    commonAPI: {
      async getNotifications(query) {
        listQueries.push(query);
        return { code: 200, data: { list: reloaded, total: 20, page: 1, pageSize: 20 } };
      },
    },
  });
  const definition = loadNoticePage(await source('packageCommon/notice/index.js'), dependencies);
  const page = instantiatePage(definition);
  page.data.noticeList = initial;
  page.data.page = 1;
  page.data.total = 21;
  page.data.hasMore = true;
  await page.deleteNotification({ detail: { id: 'notice-1' }, currentTarget: { dataset: {} } });
  assert.equal(JSON.stringify(listQueries), JSON.stringify([{ page: 1, pageSize: 20 }]));
  assert.equal(page.data.noticeList.length, 20);
  assert.equal(page.data.noticeList[0].id, 'notice-2');
  assert.equal(page.data.noticeList.at(-1).id, 'notice-21');
  assert.equal(page.data.total, 20);
});

test('my page and actual custom tab bar consume one absolute unread-count event', async () => {
  const [mySource, myTemplate, myConfig, tabSource, tabTemplate, appSource] = await Promise.all([
    source('pages/my/index.js'),
    source('pages/my/index.wxml'),
    source('pages/my/index.json'),
    source('custom-tab-bar/index.js'),
    source('custom-tab-bar/index.wxml'),
    source('app.js'),
  ]);
  assert.match(mySource, /NOTIFICATION_UNREAD_EVENT/);
  assert.match(mySource, /refreshNotificationUnreadCount\(\)/);
  assert.match(myTemplate, /card\.url === 'notice'/);
  assert.match(myTemplate, /unreadCount/);
  assert.match(myConfig, /"t-badge": "tdesign-miniprogram\/badge\/badge"/);
  assert.match(tabSource, /NOTIFICATION_UNREAD_EVENT/);
  assert.match(tabTemplate, /badge-props="{{item\.badgeProps}}"/);
  assert.match(appSource, /onShow\(\)[\s\S]*refreshNotificationUnreadCount\(\)/);
  assert.match(appSource, /resetNotificationUnreadCount\(\)/);
  assert.doesNotMatch(mySource, /unreadCount\s*[+-]=|unreadCount\s*:\s*this\.data\.unreadCount\s*[+-]/);
  assert.doesNotMatch(tabSource, /unreadCount\s*[+-]=|unreadCount\s*:\s*this\.data\.unreadCount\s*[+-]/);
});

test('account switch and failed count request clear old account count and ignore stale response', async () => {
  const stateSource = await source('utils/notificationUnread.js');
  const transformed = stateSource
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ')
    .replace(/export async function /g, 'async function ')
    .concat('\nmodule.exports = { refreshNotificationUnreadCount, resetNotificationUnreadCount };\n');
  let token = 'account-a';
  let phoneAuthorized = true;
  const events = [];
  const app = {
    globalData: { notificationUnreadCount: 7, notificationUnreadAccountKey: 'account-a' },
    eventBus: { emit(_name, count) { events.push(count); } },
  };
  const context = {
    module: { exports: {} },
    wx: {
      getStorageSync(key) {
        if (key === 'access_token') return token;
        if (key === 'phone_authorized_login_v1') return phoneAuthorized;
        return '';
      },
    },
  };
  vm.runInNewContext(transformed, context, { filename: 'utils/notificationUnread.js' });
  const state = context.module.exports;

  const stale = deferred();
  const staleRequest = state.refreshNotificationUnreadCount(app, () => stale.promise);
  token = 'account-b';
  const failedRequest = state.refreshNotificationUnreadCount(app, async () => { throw new Error('offline'); });
  await failedRequest;
  assert.equal(app.globalData.notificationUnreadCount, 0);
  assert.equal(events.at(-1), 0);
  stale.resolve({ code: 200, data: { count: 9 } });
  await staleRequest;
  assert.equal(app.globalData.notificationUnreadCount, 0);
  assert.equal(events.includes(9), false);

  let guestRequests = 0;
  phoneAuthorized = false;
  await state.refreshNotificationUnreadCount(app, async () => {
    guestRequests += 1;
    return { code: 200, data: { count: 3 } };
  });
  assert.equal(guestRequests, 0);
  assert.equal(app.globalData.notificationUnreadCount, 0);
});
