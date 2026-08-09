const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('商品详情通过底部弹窗展示可手动复制的联系方式', () => {
  const wxml = read('packageMall/detail/index.wxml');
  const js = read('packageMall/detail/index.js');
  const json = JSON.parse(read('packageMall/detail/index.json'));

  assert.equal(json.usingComponents['t-popup'], 'tdesign-miniprogram/popup/popup');
  assert.match(wxml, /<t-popup[^>]*placement="bottom"/);
  assert.match(wxml, /bindtap="onCopyContact"/);
  assert.doesNotMatch(wxml, /detail-card__contact/);
  assert.match(js, /contactPopupVisible:\s*false/);
  assert.match(js, /contactPopupVisible:\s*true/);
  assert.match(js, /legacyContact !== '保密'/);
  assert.match(js, /onCopyContact\(/);
  assert.match(js, /wx\.setClipboardData/);
  assert.doesNotMatch(js, /wx\.makePhoneCall/);
});

test('市场发布页编辑微信号和手机号，详情弹窗按类型逐项复制', () => {
  const publishJs = read('packageMall/publish/index.js');
  const publishWxml = read('packageMall/publish/index.wxml');
  const detailJs = read('packageMall/detail/index.js');
  const detailWxml = read('packageMall/detail/index.wxml');

  assert.match(publishWxml, /微信号/);
  assert.match(publishWxml, /手机号/);
  assert.match(publishJs, /wechatContact/);
  assert.match(publishJs, /phoneContact/);
  assert.match(publishJs, /请至少填写微信号或手机号/);
  assert.match(detailJs, /contactEntries/);
  assert.match(detailWxml, /wx:for="\{\{contactEntries\}\}"/);
  assert.match(detailWxml, /复制\{\{item\.label\}\}/);
  assert.match(detailJs, /dataset\.value/);
});

test('手机号也是微信号时只展示一条可添加微信的手机号', () => {
  const publishJs = read('packageMall/publish/index.js');
  const publishWxml = read('packageMall/publish/index.wxml');
  const detailJs = read('packageMall/detail/index.js');

  assert.match(publishWxml, /手机号也是微信号/);
  assert.match(publishJs, /phoneIsWechat/);
  assert.match(detailJs, /手机号（可添加微信）/);
});

test('联系商家按钮始终显示，不随商品归属变化', () => {
  const wxml = read('packageMall/detail/index.wxml');

  assert.match(
    wxml,
    /<view class="detail-bar__row">\s*<t-button class="detail-bar__action" theme="primary" size="large" block bindtap="onContact">联系商家<\/t-button>/,
  );
  assert.doesNotMatch(
    wxml,
    /wx:if="\{\{!isMine\}\}"[^>]*>[\s\S]{0,1000}bindtap="onContact"/,
  );
});
