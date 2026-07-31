const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
    setData(updates) {
      setDataCalls.push(updates);
      Object.assign(this.data, updates);
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return { page, setDataCalls };
}

test('三个首页列表不得在分页更新时对整个列表重新执行淡入动画', async () => {
  const files = [
    'pages/task/index.wxml',
    'pages/forum/index.wxml',
    'pages/mall/index.wxml',
  ];
  const templates = await Promise.all(files.map(source));

  templates.forEach((wxml, index) => {
    const file = files[index];
    assert.doesNotMatch(
      wxml,
      /class="[^"]*\blist-fade-in\b[^"]*"/,
      `${file} 不得把淡入动画挂在整个列表容器上`,
    );
  });
});

test('业主互助只有首次无数据加载时显示骨架屏', async () => {
  const wxml = await source('pages/forum/index.wxml');
  assert.match(
    wxml,
    /wx:if="\{\{loading && list\.length === 0\}\}"/,
    '已有帖子时加载下一页不得用骨架屏替换现有列表',
  );
});

test('业主互助加载下一页只开启底部 loadingMore 状态', async () => {
  const request = deferred();
  const pageSource = await source('pages/forum/index.js');
  const definition = loadPageDefinition(pageSource, {
    Subject: class {},
    consumeListRefresh: () => false,
    createHotSearch: () => () => {},
    ensureMutationReady: async () => true,
    filename: 'pages/forum/index.js',
    forumAPI: {
      getPostList: () => request.promise,
    },
    forumListPostHasMedia: () => false,
    LIST_REFRESH_KEYS: { forum: 'forum' },
    normalizeForumListPost: (item) => item,
    redirectIfEntryHidden: () => false,
    syncCustomTabBar() {},
    wx: {
      showToast() {},
    },
  });
  const { page } = instantiatePage(definition);
  page._pageAlive = true;
  page._searchRequestId = 0;
  page.data.list = [{ id: 'existing-post' }];
  page.data.page = 2;

  const pending = page.loadPosts(false);

  assert.equal(page.data.loading, false, '加载下一页不得开启整页 loading');
  assert.equal(page.data.loadingMore, true, '加载下一页应只显示底部加载状态');
  assert.deepEqual(page.data.list, [{ id: 'existing-post' }], '请求期间必须保留已有帖子');

  request.resolve({ code: 200, data: { pinned: [], list: [] } });
  await pending;
  assert.equal(page.data.loadingMore, false, '加载结束后应关闭底部加载状态');
});
