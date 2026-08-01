const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mall api exposes authenticated owner update, visibility and delete calls', () => {
  const source = read('api/cloud.js');
  assert.match(source, /updateItem\(itemId, data\)/);
  assert.match(source, /api\/items\/\$\{encodeURIComponent\(itemId\)\}/);
  assert.match(source, /setItemVisibility\(itemId, visibility\)/);
  assert.match(source, /api\/items\/\$\{encodeURIComponent\(itemId\)\}\/visibility/);
  assert.match(source, /deleteItem\(itemId\)/);
});

test('mall publish page supports edit mode without adding a separate form', () => {
  const js = read('packageMall/publish/index.js');
  const wxml = read('packageMall/publish/index.wxml');
  assert.match(js, /isEditMode/);
  assert.match(js, /mallAPI\.getItemDetail/);
  assert.match(js, /mallAPI\.updateItem/);
  assert.match(wxml, /isEditMode \? '编辑信息' : '发布'/);
  assert.match(wxml, /isEditMode \? '保存修改' : '发布'/);
  assert.match(js, /emptyLocation\s*=\s*this\.data\.isEditMode\s*\?\s*null\s*:\s*undefined/);
  assert.match(js, /locationName:\s*location\s*\?\s*location\.name\s*:\s*emptyLocation/);
  assert.match(js, /catch\s*\(err\)[\s\S]*finally[\s\S]*submitting:\s*false/);
});

test('owner actions use TDesign bottom action sheet on detail and my-list pages', () => {
  ['packageMall/detail/index.json', 'packageMall/my-list/index.json'].forEach((file) => {
    assert.match(read(file), /tdesign-miniprogram\/action-sheet\/action-sheet/);
  });
  const detailWxml = read('packageMall/detail/index.wxml');
  const mineWxml = read('packageMall/my-list/index.wxml');
  assert.match(detailWxml, /wx:if="\{\{isMine\}\}"[^>]*bindtap="onOpenOwnerActions"/);
  assert.match(detailWxml, /<t-action-sheet/);
  assert.match(mineWxml, /catchtap="onOpenOwnerActions"/);
  assert.match(mineWxml, /<t-action-sheet/);
});

test('owner actions update visibility and confirm destructive deletion', () => {
  ['packageMall/detail/index.js', 'packageMall/my-list/index.js'].forEach((file) => {
    const source = read(file);
    assert.match(source, /mallAPI\.setItemVisibility/);
    assert.match(source, /mallAPI\.deleteItem/);
    assert.match(source, /wx\.showModal/);
  });
});

test('public mall cards have no decorative right arrow', () => {
  const wxml = read('pages/mall/index.wxml');
  const less = read('pages/mall/index.less');
  assert.doesNotMatch(wxml, /mall-card__arrow|chevron-right/);
  assert.doesNotMatch(less, /\.mall-card__arrow/);
});
