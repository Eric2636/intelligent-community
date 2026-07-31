const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

Promise.all([
  readFile(path.join(root, 'app.json'), 'utf8'),
  readFile(path.join(root, 'packageMall/publish/index.js'), 'utf8'),
]).then(([appConfigSource, mallPublishSource]) => {
  const appConfig = JSON.parse(appConfigSource);

  assert.match(mallPublishSource, /wx\.chooseLocation\s*\(/, '小区市场发布页应使用微信地点选择能力');
  assert.ok(
    Array.isArray(appConfig.requiredPrivateInfos),
    '调用隐私接口时，app.json 必须配置 requiredPrivateInfos',
  );
  assert.ok(
    appConfig.requiredPrivateInfos.includes('chooseLocation'),
    'app.json 必须声明 chooseLocation，否则正式版无法选择门店地点',
  );
});
