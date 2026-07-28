const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function methodBody(source, methodName, nextMethodName) {
  const start = source.indexOf(`  ${methodName}(`);
  assert.notEqual(start, -1, `mallAPI.${methodName} must exist`);
  const end = nextMethodName ? source.indexOf(`  ${nextMethodName}(`, start + 1) : source.indexOf('\n};', start);
  assert.notEqual(end, -1, `mallAPI.${methodName} body must have an end marker`);
  return source.slice(start, end);
}

readFile(path.join(root, 'api/cloud.js'), 'utf8').then((source) => {
  const publicReads = [
    ['getItems', 'getItemList'],
    ['getItemDetail', 'getItemComments'],
    ['getItemComments', 'createItemComment'],
    ['getCategories', null],
  ];
  publicReads.forEach(([methodName, nextMethodName]) => {
    assert.match(
      methodBody(source, methodName, nextMethodName),
      /auth:\s*'optional'/,
      `mallAPI.${methodName} must send a token only as optional personalization`,
    );
  });

  const privateCalls = [
    ['createItemComment', 'deleteItemComment'],
    ['deleteItemComment', 'likeItemComment'],
    ['likeItemComment', 'unlikeItemComment'],
    ['unlikeItemComment', 'publishItem'],
    ['publishItem', 'getMyItems'],
    ['getMyItems', 'favoriteItem'],
    ['favoriteItem', 'unfavoriteItem'],
    ['unfavoriteItem', 'getMyFavoriteItems'],
    ['getMyFavoriteItems', 'createOrder'],
    ['createOrder', 'getMyOrders'],
    ['getMyOrders', 'getOrderDetail'],
    ['getOrderDetail', 'updateOrderStatus'],
    ['updateOrderStatus', 'getCategories'],
  ];
  privateCalls.forEach(([methodName, nextMethodName]) => {
    assert.match(
      methodBody(source, methodName, nextMethodName),
      /auth:\s*true/,
      `mallAPI.${methodName} must keep required authentication`,
    );
  });
  ['favoriteItem', 'unfavoriteItem'].forEach((methodName) => {
    const nextMethodName = methodName === 'favoriteItem' ? 'unfavoriteItem' : 'getMyFavoriteItems';
    assert.match(
      methodBody(source, methodName, nextMethodName),
      /if\s*\(res && res\.code === 200\)\s*clearItemListCache\(\)/,
      `mallAPI.${methodName} must invalidate every identity-scoped item-list cache`,
    );
  });

  process.stdout.write('mall public-read mini API guards passed\n');
});
