const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

Promise.all([
  source('app.js'),
  source('pages/my/index.js'),
  source('pages/my/info-edit/index.js'),
  source('utils/moduleEntryGuard.js'),
]).then(([app, myPage, infoEdit, moduleEntryGuard]) => {
  assert.doesNotMatch(myPage, /profileDisplay/, '“我的”页不应依赖可能被遗漏打包的新工具模块');
  assert.doesNotMatch(infoEdit, /profileDisplay/, '资料编辑页不应依赖可能被遗漏打包的新工具模块');
  assert.match(
    app,
    /if \(config\.enableVConsole\)\s*\{[\s\S]*?wx\.setEnableDebug\(\{ enableDebug: true \}\)/,
    '仅允许测试/本地配置开启微信调试面板',
  );
  assert.match(
    moduleEntryGuard,
    /DEFAULT_TAB_LIST[\s\S]*?key: 'my'[\s\S]*?always: true/,
    '无远端配置时底栏默认列表必须包含“我的”',
  );
  assert.match(
    moduleEntryGuard,
    /return normalizeTabs\(DEFAULT_TAB_LIST\)/,
    '无远端配置时必须回退到默认底栏列表',
  );

  process.stdout.write('production regression guards passed\n');
});
