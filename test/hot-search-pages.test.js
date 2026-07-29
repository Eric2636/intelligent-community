import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { Subject } from 'rxjs';

import { createHotSearch } from '../utils/hotSearch.js';

const root = process.cwd();
const PAGE_SEARCH_WAIT = 30;
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');
const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

function loadPageDefinition(pageSource, globals, filename) {
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
    { filename },
  );
  assert.ok(definition, `${filename} 应注册页面`);
  return definition;
}

function instantiatePage(definition) {
  const page = {
    data: { ...definition.data },
    _setDataCalls: [],
    setData(updates, callback) {
      this._setDataCalls.push(updates);
      Object.assign(this.data, updates);
      if (callback) callback();
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return page;
}

async function createHarness(kind, options = {}) {
  const calls = [];
  const categoryCalls = [];
  const announcementCalls = [];
  const toastCalls = [];
  const makeCall = (params) => {
    const request = deferred();
    calls.push({ params: { ...params }, request });
    return request.promise;
  };
  const taskAPI = { getTaskList: makeCall };
  const forumAPI = {
    getAnnouncements() {
      if (!options.manualAnnouncements) return Promise.resolve({ code: 200, data: [] });
      const request = deferred();
      announcementCalls.push(request);
      return request.promise;
    },
    getPostList: makeCall,
  };
  const mallAPI = {
    getCategories() {
      if (!options.manualCategories) {
        return Promise.resolve({ code: 200, data: [{ id: 'flea', name: '闲置' }] });
      }
      const request = deferred();
      categoryCalls.push(request);
      return request.promise;
    },
    getItems: makeCall,
  };
  const pageSource = await source(`pages/${kind}/index.js`);
  const definition = loadPageDefinition(
    pageSource,
    {
      LIST_REFRESH_KEYS: new Proxy({}, { get: (_, key) => String(key) }),
      Subject,
      consumeListRefresh: () => false,
      createHotSearch: (input$, run) => createHotSearch(input$, run, PAGE_SEARCH_WAIT),
      ensureMutationReady: async () => true,
      formatDateTimeYmdHm: (value) => value,
      forumAPI,
      forumListPostHasMedia: () => false,
      mallAPI,
      mallDetailUrl: (id) => String(id),
      mallPublishUrl: () => '/packageMall/publish/index',
      normalizeForumListPost: (item) => item,
      redirectIfEntryHidden: () => false,
      syncCustomTabBar() {},
      taskAPI,
      normalizeAvatar: (value) => value || '',
      wx: {
        navigateTo() {},
        previewImage() {},
        showToast(config) {
          toastCalls.push(config);
        },
      },
    },
    `pages/${kind}/index.js`,
  );
  const page = instantiatePage(definition);

  const resultFor = (label) => {
    if (kind === 'forum') {
      return { code: 200, data: { pinned: [], list: [{ id: label, title: label }] } };
    }
    return { code: 200, data: [{ id: label, title: label }] };
  };
  const resolveInitial = (call) => call.request.resolve(resultFor('default'));
  return {
    announcementCalls,
    calls,
    categoryCalls,
    page,
    resolveInitial,
    resultFor,
    toastCalls,
  };
}

async function verifyHotSearchPage(kind) {
  const harness = await createHarness(kind);
  const { calls, page, toastCalls } = harness;

  page.onLoad();
  await flush();
  assert.equal(calls.length, 1, `${kind} 首次进入应立即加载默认列表`);
  assert.equal(calls[0].params.keyword, undefined, `${kind} 默认查询不得发送 keyword`);
  harness.resolveInitial(calls[0]);
  await flush();
  assert.equal(page.data.list[0].id, 'default');

  page.onSearchInput({ detail: { value: '   ' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, 1, `${kind} 默认状态输入空白不得重复查询`);

  page.onSearchInput({ detail: { value: '  a' } });
  await delay(15);
  page.onSearchInput({ detail: { value: 'a  ' } });
  await delay(PAGE_SEARCH_WAIT - 10);
  assert.equal(calls.length, 1, `${kind} 连续输入后 500ms 内不得查询`);
  await delay(15);
  assert.equal(calls.length, 2, `${kind} 停止输入 500ms 后应查询一次`);
  assert.equal(calls[1].params.keyword, 'a', `${kind} 应使用 trim 后的关键词`);

  page.onSearchInput({ detail: { value: ' a ' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, 2, `${kind} 重复有效关键词不得重复查询`);

  page.onSearchInput({ detail: { value: 'new' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, 3);
  calls[2].request.resolve(harness.resultFor('new'));
  await flush();
  assert.equal(page.data.list[0].id, 'new');
  assert.equal(page.data.loading, false);

  calls[1].request.reject(new Error('stale request failed'));
  await flush();
  assert.equal(page.data.list[0].id, 'new', `${kind} 旧错误不得清空或覆盖最新列表`);
  assert.equal(page.data.loading, false, `${kind} 旧请求 finally 不得改写最新 loading`);
  assert.equal(toastCalls.length, 0, `${kind} 旧错误不得弹出错误提示`);

  page.onSearchInput({ detail: { value: 'stale-success' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  page.onSearchInput({ detail: { value: 'latest' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  const staleSuccessCall = calls[3];
  const latestCall = calls[4];
  latestCall.request.resolve(harness.resultFor('latest'));
  await flush();
  staleSuccessCall.request.resolve(harness.resultFor('stale-success'));
  await flush();
  assert.equal(page.data.list[0].id, 'latest', `${kind} 旧成功结果不得覆盖最新列表`);

  page.onSearchClear();
  await delay(PAGE_SEARCH_WAIT - 10);
  assert.equal(calls.length, 5, `${kind} 清空也必须等待 500ms 防抖`);
  await delay(15);
  assert.equal(calls.length, 6, `${kind} 清空后应恢复默认列表`);
  assert.equal(calls[5].params.keyword, undefined, `${kind} 空白恢复不得发送 keyword`);
  calls[5].request.resolve(harness.resultFor('restored'));
  await flush();
  assert.equal(page.data.list[0].id, 'restored');

  page.onSearchInput({ detail: { value: 'pending-unload' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  const pendingUnloadCall = calls[calls.length - 1];
  page.onUnload();
  pendingUnloadCall.request.resolve(harness.resultFor('after-unload'));
  await flush();
  assert.equal(page.data.list[0].id, 'restored', `${kind} 卸载后的请求结果不得更新页面`);
  const callsBeforeUnloadInput = calls.length;
  page.onSearchInput({ detail: { value: 'after unload' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, callsBeforeUnloadInput, `${kind} 卸载后不得继续搜索`);
  assert.equal(page._keyword$.isStopped, true, `${kind} 卸载时必须 complete 输入流`);
}

async function verifyInputImmediatelyInvalidatesRequests(kind) {
  const harness = await createHarness(kind);
  const { calls, page, toastCalls } = harness;
  page.onLoad();
  await flush();
  harness.resolveInitial(calls[0]);
  await flush();

  page.onSearchInput({ detail: { value: 'old-success' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  const oldSuccess = calls[calls.length - 1];
  page.onSearchInput({ detail: { value: 'next' } });
  oldSuccess.request.resolve(harness.resultFor('old-success'));
  await flush();
  assert.equal(page.data.list[0].id, 'default', `${kind} 新输入后旧成功不得在防抖窗口更新列表`);
  assert.equal(page.data.loading, true, `${kind} 新输入后旧 finally 不得在防抖窗口关闭 loading`);

  await delay(PAGE_SEARCH_WAIT + 15);
  const oldNon200 = calls[calls.length - 1];
  assert.equal(oldNon200.params.keyword, 'next');
  page.onSearchInput({ detail: { value: 'current' } });
  oldNon200.request.resolve({ code: 503, message: 'stale non-200' });
  await flush();
  assert.equal(page.data.list[0].id, 'default', `${kind} 新输入后旧非 200 不得改写列表`);
  assert.equal(page.data.loading, true, `${kind} 新输入后旧非 200 不得关闭 loading`);
  assert.equal(toastCalls.length, 0, `${kind} 新输入后旧非 200 不得提示`);

  await delay(PAGE_SEARCH_WAIT + 15);
  const oldError = calls[calls.length - 1];
  assert.equal(oldError.params.keyword, 'current');
  page.onSearchInput({ detail: { value: 'latest' } });
  oldError.request.reject(new Error('old error during debounce'));
  await flush();
  assert.equal(page.data.list[0].id, 'default', `${kind} 新输入后旧错误不得改写列表`);
  assert.equal(page.data.loading, true, `${kind} 新输入后旧错误不得关闭 loading`);
  assert.equal(toastCalls.length, 0, `${kind} 新输入后旧错误不得提示`);

  await delay(PAGE_SEARCH_WAIT + 15);
  const current = calls[calls.length - 1];
  assert.equal(current.params.keyword, 'latest');
  current.request.resolve(harness.resultFor('latest'));
  await flush();
  assert.equal(page.data.list[0].id, 'latest');
  assert.equal(page.data.loading, false);
  page.onUnload();
}

async function verifyPendingInputUsesCommittedKeyword(kind) {
  const harness = await createHarness(kind);
  const { calls, page } = harness;
  page.onLoad();
  await flush();
  harness.resolveInitial(calls[0]);
  await flush();

  page.onSearchInput({ detail: { value: 'committed' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  calls[calls.length - 1].request.resolve(harness.resultFor('committed'));
  await flush();

  page.onSearchInput({ detail: { value: 'pending raw' } });
  const callsBeforeAction = calls.length;
  if (kind === 'task') {
    page.onRefresh();
  } else if (kind === 'forum') {
    page.onOrderChange({ currentTarget: { dataset: { order: 'hot' } } });
  } else {
    page.onCategoryTap({ currentTarget: { dataset: { id: 'flea' } } });
  }
  assert.equal(calls.length, callsBeforeAction + 1, `${kind} 筛选或刷新应立即按已确认条件查询`);
  assert.equal(
    calls[callsBeforeAction].params.keyword,
    'committed',
    `${kind} 筛选或刷新不得使用防抖中的 raw keyword`,
  );

  if (kind === 'task') {
    page.loadList(false);
    assert.equal(calls[calls.length - 1].params.keyword, 'committed', 'task 分页不得使用 pending raw keyword');
  } else if (kind === 'forum') {
    page.loadPosts(false);
    assert.equal(calls[calls.length - 1].params.keyword, 'committed', 'forum 分页不得使用 pending raw keyword');
  } else {
    page.setData({
      fullList: Array.from({ length: 20 }, (_, index) => ({ id: `item-${index}` })),
      hasMore: true,
      list: Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}` })),
      loading: false,
    });
    const callsBeforePagination = calls.length;
    page.loadMore();
    assert.equal(calls.length, callsBeforePagination, 'mall 本地分页不得产生 pending raw keyword 请求');
  }

  await delay(PAGE_SEARCH_WAIT - 10);
  assert.equal(
    calls.some(({ params }) => params.keyword === 'pending raw'),
    false,
    `${kind} 不足 500ms 不得发送 pending raw keyword`,
  );
  await delay(15);
  assert.equal(calls[calls.length - 1].params.keyword, 'pending raw', `${kind} 防抖完成后才提交新关键词`);
  calls[calls.length - 1].request.resolve(harness.resultFor('pending raw'));
  await flush();
  page.onUnload();
}

async function verifyEquivalentInputSemantics(kind) {
  const harness = await createHarness(kind);
  const { calls, page } = harness;
  page.onLoad();
  await flush();
  const initial = calls[0];
  page.onSearchInput({ detail: { value: '   ' } });
  initial.request.resolve(harness.resultFor('default'));
  await flush();
  assert.equal(page.data.list[0].id, 'default', `${kind} 初始空白不得作废默认请求`);
  assert.equal(page.data.loading, false, `${kind} 默认请求应正常关闭 loading`);
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, 1, `${kind} 初始空白不得重复默认请求`);

  page.onSearchInput({ detail: { value: 'a' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  const originalA = calls[calls.length - 1];
  const requestIdBeforeEquivalentInput = page._searchRequestId;
  page.onSearchInput({ detail: { value: ' a ' } });
  assert.equal(
    page._searchRequestId,
    requestIdBeforeEquivalentInput,
    `${kind} 同一 trim 查询语义不得作废在途请求`,
  );
  originalA.request.resolve(harness.resultFor('a-original'));
  await flush();
  assert.equal(page.data.list[0].id, 'a-original');
  assert.equal(page.data.loading, false);
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(calls.length, 2, `${kind} 同一 trim 查询语义不得新增请求`);

  page.onSearchInput({ detail: { value: 'b' } });
  await delay(10);
  page.onSearchInput({ detail: { value: 'a' } });
  await delay(PAGE_SEARCH_WAIT + 15);
  assert.equal(
    calls.some(({ params }) => params.keyword === 'b'),
    false,
    `${kind} a→b→a 在防抖内不得发送 b`,
  );
  assert.equal(calls.length, 2, `${kind} 无在途请求时回到 committed a 不得重复查询`);

  page.onRefresh();
  const inFlightA = calls[calls.length - 1];
  page.onSearchInput({ detail: { value: 'b' } });
  await delay(10);
  page.onSearchInput({ detail: { value: ' a ' } });
  inFlightA.request.resolve(harness.resultFor('invalidated-a'));
  await flush();
  assert.equal(page.data.list[0].id, 'a-original', `${kind} b 已使原 a 请求失效`);
  assert.equal(page.data.loading, true, `${kind} 失效请求不得关闭 loading`);
  await delay(PAGE_SEARCH_WAIT + 15);
  const replacementA = calls[calls.length - 1];
  assert.equal(replacementA.params.keyword, 'a', `${kind} 回到 a 后必须补发替代请求`);
  assert.notEqual(replacementA, inFlightA);
  assert.equal(
    calls.filter(({ params }) => params.keyword === 'b').length,
    0,
    `${kind} 中间 b 始终不得发出`,
  );
  replacementA.request.resolve(harness.resultFor('replacement-a'));
  await flush();
  assert.equal(page.data.list[0].id, 'replacement-a');
  assert.equal(page.data.loading, false);
  page.onUnload();
}

test('task page implements the complete hot-search lifecycle', async () => {
  await verifyHotSearchPage('task');
});

test('forum page implements the complete hot-search lifecycle', async () => {
  await verifyHotSearchPage('forum');
});

test('mall page implements the complete hot-search lifecycle', async () => {
  await verifyHotSearchPage('mall');
});

test('new raw input immediately invalidates in-flight requests on all pages', async () => {
  await Promise.all(
    ['task', 'forum', 'mall'].map((kind) => verifyInputImmediatelyInvalidatesRequests(kind)),
  );
});

test('refresh, filters and pagination use only the committed keyword during debounce', async () => {
  await Promise.all(['task', 'forum', 'mall'].map((kind) => verifyPendingInputUsesCommittedKeyword(kind)));
});

test('forum current errors preserve the visible pinned posts and list', async () => {
  const harness = await createHarness('forum');
  const { calls, page, toastCalls } = harness;
  page.onLoad();
  await flush();
  harness.resolveInitial(calls[0]);
  await flush();
  page.setData({ pinned: [{ id: 'keep-pinned' }], list: [{ id: 'keep-list' }] });

  page.loadPosts(true);
  calls[calls.length - 1].request.resolve({ code: 503, message: '稍后重试' });
  await flush();
  assert.equal(page.data.pinned[0].id, 'keep-pinned');
  assert.equal(page.data.list[0].id, 'keep-list');
  assert.equal(toastCalls.length, 1);

  page.loadPosts(true);
  calls[calls.length - 1].request.reject(new Error('network unavailable'));
  await flush();
  assert.equal(page.data.pinned[0].id, 'keep-pinned');
  assert.equal(page.data.list[0].id, 'keep-list');
  assert.equal(toastCalls.length, 2);
  page.onUnload();
});

test('equivalent trimmed input preserves requests and a-b-a replaces only when necessary', async () => {
  await Promise.all(['task', 'forum', 'mall'].map((kind) => verifyEquivalentInputSemantics(kind)));
});

test('mall confirms the active category before loading and ignores stale category refreshes', async () => {
  const harness = await createHarness('mall', { manualCategories: true });
  const { calls, categoryCalls, page } = harness;
  page.onLoad();
  assert.equal(calls.length, 0, '分类确认前不得使用默认 flea 查询列表');
  assert.equal(categoryCalls.length, 1);

  categoryCalls[0].resolve({ code: 200, data: [{ id: 'books', name: '书籍' }] });
  await flush();
  assert.equal(page.data.currentCategory, 'books');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.categoryId, 'books');
  calls[0].request.resolve(harness.resultFor('books'));
  await flush();

  page.onRefresh();
  page.onRefresh();
  assert.equal(categoryCalls.length, 3);
  categoryCalls[2].resolve({ code: 200, data: [{ id: 'toys', name: '玩具' }] });
  await flush();
  const toysCall = calls[calls.length - 1];
  assert.equal(page.data.currentCategory, 'toys');
  assert.equal(toysCall.params.categoryId, 'toys');
  assert.equal(page.data.list.length, 0, '分类切换后不得在新分类下继续展示旧分类列表');

  categoryCalls[1].resolve({ code: 200, data: [{ id: 'stale', name: '旧分类' }] });
  await flush();
  assert.equal(page.data.currentCategory, 'toys', '较旧刷新不得覆盖较新分类');
  assert.equal(calls[calls.length - 1], toysCall, '较旧刷新不得再查询旧分类列表');
  toysCall.request.resolve(harness.resultFor('toys'));
  await flush();

  page.onRefresh();
  categoryCalls[3].resolve({ code: 200, data: [{ id: 'services', name: '服务' }] });
  await flush();
  assert.equal(page.data.currentCategory, 'services', '当前分类被停用后应切换到首个有效分类');
  assert.equal(calls[calls.length - 1].params.categoryId, 'services');
  calls[calls.length - 1].request.resolve(harness.resultFor('services'));
  await flush();
  page.onUnload();
});

test('mall category tap invalidates an in-flight category refresh', async () => {
  const harness = await createHarness('mall', { manualCategories: true });
  const { calls, categoryCalls, page } = harness;
  page.onLoad();
  categoryCalls[0].resolve({
    code: 200,
    data: [
      { id: 'books', name: '书籍' },
      { id: 'toys', name: '玩具' },
    ],
  });
  await flush();
  calls[0].request.resolve(harness.resultFor('books'));
  await flush();

  page.onRefresh();
  const pendingCategoryRefresh = categoryCalls[1];
  const categoryRequestIdBeforeTap = page._categoryRequestId;
  page.onCategoryTap({ currentTarget: { dataset: { id: 'toys' } } });
  assert.ok(
    page._categoryRequestId > categoryRequestIdBeforeTap,
    '点击分类必须同步作废正在执行的分类请求',
  );
  const tappedCategoryList = calls[calls.length - 1];
  assert.equal(tappedCategoryList.params.categoryId, 'toys');
  assert.equal(page.data.currentCategory, 'toys');
  assert.equal(page.data.loading, true);

  pendingCategoryRefresh.resolve({
    code: 200,
    data: [{ id: 'books', name: '书籍' }],
  });
  await flush();
  assert.equal(page.data.currentCategory, 'toys', '迟到分类响应不得移除或覆盖用户刚选择的分类');
  assert.equal(page.data.categories.some(({ id }) => id === 'toys'), true);
  assert.equal(calls[calls.length - 1], tappedCategoryList);

  tappedCategoryList.request.resolve(harness.resultFor('toys'));
  await flush();
  assert.equal(page.data.list[0].id, 'toys');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.refreshing, false);
  page.onUnload();
});

test('mall category failures are handled and auxiliary results never update after unload', async () => {
  const failed = await createHarness('mall', { manualCategories: true });
  failed.page._pageAlive = true;
  const failurePromise = failed.page.loadCategories();
  failed.categoryCalls[0].reject(new Error('category network failure'));
  await assert.doesNotReject(failurePromise, '分类失败不得产生未处理 rejection');
  assert.equal(failed.toastCalls.length, 1, '当前分类失败应提示用户');
  assert.equal(failed.page.data.categories.length, 0);

  const unloadedSuccess = await createHarness('mall', { manualCategories: true });
  unloadedSuccess.page.onLoad();
  const successSetDataCount = unloadedSuccess.page._setDataCalls.length;
  unloadedSuccess.page.onUnload();
  unloadedSuccess.categoryCalls[0].resolve({ code: 200, data: [{ id: 'late', name: '迟到分类' }] });
  await flush();
  assert.equal(unloadedSuccess.page._setDataCalls.length, successSetDataCount);
  assert.equal(unloadedSuccess.calls.length, 0);

  const unloadedFailure = await createHarness('mall', { manualCategories: true });
  unloadedFailure.page.onLoad();
  const failureSetDataCount = unloadedFailure.page._setDataCalls.length;
  unloadedFailure.page.onUnload();
  unloadedFailure.categoryCalls[0].reject(new Error('late category failure'));
  await flush();
  assert.equal(unloadedFailure.page._setDataCalls.length, failureSetDataCount);
  assert.equal(unloadedFailure.toastCalls.length, 0, '卸载后的分类失败不得提示');
});

test('forum announcements ignore stale and post-unload success or failure', async () => {
  const harness = await createHarness('forum', { manualAnnouncements: true });
  const { announcementCalls, calls, page, toastCalls } = harness;
  page.onLoad();
  harness.resolveInitial(calls[0]);
  await flush();
  page.loadAnnouncements();
  assert.equal(announcementCalls.length, 2);

  announcementCalls[1].resolve({
    code: 200,
    data: [{ id: 'new-announcement', content: '新公告' }],
  });
  await flush();
  assert.equal(page.data.announcements[0].id, 'new-announcement');
  announcementCalls[0].resolve({
    code: 200,
    data: [{ id: 'old-announcement', content: '旧公告' }],
  });
  await flush();
  assert.equal(page.data.announcements[0].id, 'new-announcement', '旧公告响应不得覆盖新响应');

  page.loadAnnouncements();
  const setDataCount = page._setDataCalls.length;
  page.onUnload();
  announcementCalls[2].resolve({
    code: 200,
    data: [{ id: 'late-announcement', content: '迟到公告' }],
  });
  await flush();
  assert.equal(page._setDataCalls.length, setDataCount);

  const rejected = await createHarness('forum', { manualAnnouncements: true });
  rejected.page.onLoad();
  const rejectedSetDataCount = rejected.page._setDataCalls.length;
  rejected.page.onUnload();
  rejected.announcementCalls[0].reject(new Error('late announcement failure'));
  await flush();
  assert.equal(rejected.page._setDataCalls.length, rejectedSetDataCount);
  assert.equal(rejected.toastCalls.length, 0);
  assert.equal(toastCalls.length, 0);
});
