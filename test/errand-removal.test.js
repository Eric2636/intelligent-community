const assert = require('node:assert/strict');
const test = require('node:test');
const { access, readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function loadAppDefinition(appSource, wx) {
  let definition;
  const transformed = appSource.replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(transformed, {
    App(config) {
      definition = config;
    },
    config: {},
    createBus: () => ({ emit() {} }),
    readStoredModuleTabs: () => null,
    STORAGE_KEY: 'module_entry_tabs',
    httpRequest: async () => ({}),
    cacheGet: () => null,
    cacheSet() {},
    wx,
  });
  return definition;
}

test('mini program no longer registers or calls the removed errand module', async () => {
  const [appConfig, cloudApi, moduleEntry, listRefresh, cloudMedia, nav, myPage] = await Promise.all([
    source('app.json'),
    source('api/cloud.js'),
    source('config/moduleEntry.js'),
    source('utils/listRefresh.js'),
    source('utils/cloudMedia.js'),
    source('components/nav/index.js'),
    source('pages/my/index.js'),
  ]);

  const businessSources = [appConfig, cloudApi, moduleEntry, listRefresh, cloudMedia, nav, myPage].join('\n');
  assert.doesNotMatch(businessSources, /errand|跑腿|packageErrand|pages\/errand/i);
  ['forum', 'task', 'mall', 'avatar'].forEach((moduleName) => {
    assert.match(cloudMedia, new RegExp(`['"]${moduleName}['"]`), `共享上传模块 ${moduleName} 必须保留`);
  });
});

test('removed errand pages are absent from the mini program source tree', async () => {
  await assert.rejects(access(path.join(root, 'pages/errand')));
  await assert.rejects(access(path.join(root, 'packageErrand')));
});

test('retired errand deep links show an offline notice and safely relaunch the home page once', async () => {
  const appSource = await source('app.js');
  const notices = [];
  const relaunches = [];
  const definition = loadAppDefinition(appSource, {
    showToast(options) {
      notices.push(options);
    },
    reLaunch(options) {
      relaunches.push(options);
    },
  });

  assert.equal(typeof definition.onPageNotFound, 'function');
  definition.onPageNotFound.call(definition, { path: '/packageErrand/detail/index?id=legacy' });
  definition.onPageNotFound.call(definition, { path: 'pages/errand/index' });

  assert.deepEqual(notices.map(({ title }) => title), ['功能已下线']);
  assert.deepEqual(relaunches.map(({ url }) => url), ['/pages/task/index']);
});

test('unrelated unknown pages are left to the platform and never trigger the retired-feature fallback', async () => {
  const appSource = await source('app.js');
  const calls = [];
  const definition = loadAppDefinition(appSource, {
    showToast() {
      calls.push('toast');
    },
    reLaunch() {
      calls.push('relaunch');
    },
  });

  definition.onPageNotFound.call(definition, { path: 'packageMall/not-a-real-page/index' });
  definition.onPageNotFound.call(definition, {});

  assert.deepEqual(calls, []);
});
