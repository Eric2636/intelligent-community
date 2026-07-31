const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadCachedRequest(cloudSource) {
  const end = cloudSource.indexOf('/**\n * 任务相关 API');
  assert.notEqual(end, -1, 'cloud cache helper section must exist');
  const helperSource = cloudSource
    .slice(0, end)
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^import \{[\s\S]*?^\} from .*;\s*$/gm, '');

  const cache = new Map();
  const writtenKeys = [];
  const responses = [];
  const identity = { token: '', userId: '' };
  const backend = { apiBaseUrl: 'http://127.0.0.1:3000' };
  const dependencies = {
    cacheGet: (key) => cache.get(key) || null,
    cacheSet: (key, value) => {
      writtenKeys.push(key);
      cache.set(key, value);
    },
    formatDateTimeFields: (value) => value,
    getCurrentUserId: () => identity.userId,
    getToken: () => identity.token,
    httpRequest: async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    invalidateHttpCachePrefix: () => {},
  };
  const transformed = `
    const {
      cacheGet,
      cacheSet,
      formatDateTimeFields,
      getCurrentUserId,
      getToken,
      httpRequest,
      invalidateHttpCachePrefix,
    } = dependencies;
    ${helperSource}
    module.exports = { cachedRequest };
  `;
  const context = {
    dependencies,
    getApp: () => ({ globalData: { apiBaseUrl: backend.apiBaseUrl } }),
    module: { exports: {} },
  };
  vm.runInNewContext(transformed, context, { filename: 'api/cloud-cache-helpers.js' });

  return {
    cache,
    backend,
    cachedRequest: context.module.exports.cachedRequest,
    identity,
    responses,
    writtenKeys,
  };
}

readFile(path.join(root, 'api/cloud.js'), 'utf8').then(async (cloudSource) => {
  const runtime = loadCachedRequest(cloudSource);
  const query = { categoryId: 'all' };
  const options = { auth: 'optional', cacheScope: 'identity' };
  const userAResponse = { code: 200, data: [{ id: 'item-1', isFavorited: true }] };

  runtime.identity.userId = 'user-A';
  runtime.identity.token = 'token-A-must-never-enter-cache-key';
  runtime.responses.push(userAResponse);
  await runtime.cachedRequest('api/items', query, 60, options);

  assert.equal(runtime.writtenKeys.length, 1);
  assert.match(runtime.writtenKeys[0], /scope:user:user-A/);
  assert.match(runtime.writtenKeys[0], /backend:http%3A%2F%2F127\.0\.0\.1%3A3000/);
  assert.doesNotMatch(runtime.writtenKeys[0], /token-A-must-never-enter-cache-key/);

  runtime.identity.userId = 'user-A';
  runtime.identity.token = '';
  runtime.responses.push(new Error('guest offline'));
  await assert.rejects(runtime.cachedRequest('api/items', query, 60, options), /guest offline/);

  runtime.identity.userId = 'user-B';
  runtime.identity.token = 'token-B';
  runtime.responses.push(new Error('user B offline'));
  await assert.rejects(runtime.cachedRequest('api/items', query, 60, options), /user B offline/);

  runtime.identity.userId = '';
  runtime.identity.token = '';
  const guestResponse = { code: 200, data: [{ id: 'item-1', isFavorited: false }] };
  runtime.responses.push(guestResponse);
  await runtime.cachedRequest('api/items', query, 60, options);

  const serverError = new Error('HTTP 500');
  serverError.statusCode = 500;
  runtime.responses.push(serverError);
  await assert.rejects(
    runtime.cachedRequest('api/items', query, 60, options),
    /HTTP 500/,
    'HTTP 4xx/5xx must be surfaced instead of being hidden by stale cache',
  );

  runtime.backend.apiBaseUrl = 'https://lllhjh.asia';
  runtime.responses.push(new Error('production offline'));
  await assert.rejects(
    runtime.cachedRequest('api/items', query, 60, options),
    /production offline/,
    'cache created for local API must never be reused for production API',
  );

  runtime.backend.apiBaseUrl = 'http://127.0.0.1:3000';
  runtime.responses.push(new Error('guest offline after cache'));
  const offlineResponse = await runtime.cachedRequest('api/items', query, 60, options);
  assert.equal(
    offlineResponse.__fromOfflineCache,
    true,
    'offline fallback must be explicitly marked so the page can notify the user',
  );
  assert.deepEqual(offlineResponse.data, guestResponse.data);

  runtime.identity.userId = '';
  runtime.identity.token = 'token-without-stable-user-id';
  const writesBeforeUnknownIdentity = runtime.writtenKeys.length;
  runtime.responses.push(userAResponse);
  await runtime.cachedRequest('api/items', { categoryId: 'flea' }, 60, options);
  assert.equal(
    runtime.writtenKeys.length,
    writesBeforeUnknownIdentity,
    'authenticated responses without a stable userId must not be cached',
  );
  assert.equal(
    runtime.writtenKeys.some((key) => key.includes('token-without-stable-user-id')),
    false,
    'tokens must never be cache-key material',
  );

  process.stdout.write('mall identity-scoped offline cache guards passed\n');
});
