const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadHttp(httpSource, storedToken) {
  const requests = [];
  const logs = [];
  const transformed = httpSource
    .replace("import config from '../config';", "const config = { useLocalDevApi: true, devPort: 8080 };")
    .replace(/export function /g, 'function ')
    .concat('\nmodule.exports = { request, getToken, buildUrl };\n');
  const context = {
    getApp: () => ({ globalData: { apiBaseUrl: 'https://api.example.test' } }),
    module: { exports: {} },
    console: {
      log(...args) {
        logs.push(['log', ...args]);
      },
      warn(...args) {
        logs.push(['warn', ...args]);
      },
    },
    wx: {
      getStorageSync: () => storedToken,
      request(options) {
        requests.push(options);
      },
    },
  };
  vm.runInNewContext(transformed, context, { filename: 'api/http.js' });
  return { http: context.module.exports, logs, requests };
}

async function completeRequest(runtime, options, responseData = { code: 200 }) {
  const resultPromise = runtime.http.request(options);
  assert.equal(runtime.requests.length, 1, 'request must continue to wx.request');
  runtime.requests[0].success({ statusCode: 200, data: responseData });
  return resultPromise;
}

readFile(path.join(root, 'api/http.js'), 'utf8').then(async (httpSource) => {
  const optionalWithToken = loadHttp(httpSource, 'stored-secret-token');
  await completeRequest(optionalWithToken, {
    method: 'GET',
    path: 'api/items/item-1',
    auth: 'optional',
  });
  assert.equal(
    optionalWithToken.requests[0].header.Authorization,
    'Bearer stored-secret-token',
    'optional auth must carry an available token for personalization',
  );

  const optionalWithoutToken = loadHttp(httpSource, '');
  await completeRequest(optionalWithoutToken, {
    method: 'GET',
    path: 'api/items/item-1/comments',
    auth: 'optional',
  });
  assert.equal(optionalWithoutToken.requests[0].header.Authorization, undefined);

  const publicWithoutCredentials = loadHttp(httpSource, 'stored-secret-token');
  await completeRequest(publicWithoutCredentials, {
    method: 'GET',
    path: 'api/categories',
    auth: false,
  });
  assert.equal(publicWithoutCredentials.requests[0].header.Authorization, undefined);

  const sensitivePath = loadHttp(httpSource, '');
  await completeRequest(sensitivePath, {
    method: 'GET',
    path: 'api/items?access_token=query-secret#refresh_token=fragment-secret',
    auth: false,
  });
  const sensitivePathLogs = JSON.stringify(sensitivePath.logs);
  assert.doesNotMatch(sensitivePathLogs, /query-secret|fragment-secret|access_token|refresh_token/);
  sensitivePath.logs.forEach((entry) => {
    assert.equal(entry[2].path, 'api/items');
  });

  const login = loadHttp(httpSource, '');
  await completeRequest(
    login,
    { method: 'POST', path: 'api/auth/wechat-login', auth: false },
    {
      code: 200,
      data: {
        access_token: 'login-access-token-must-not-be-logged',
        refresh_token: 'login-refresh-token-must-not-be-logged',
      },
    },
  );
  const serializedLogs = JSON.stringify(login.logs);
  assert.doesNotMatch(serializedLogs, /login-access-token-must-not-be-logged/);
  assert.doesNotMatch(serializedLogs, /login-refresh-token-must-not-be-logged/);
  assert.doesNotMatch(serializedLogs, /access_token|refresh_token/);

  const responseLog = login.logs.find((entry) => entry[1] === '[http.response]');
  assert.ok(responseLog, 'response metadata should remain observable');
  assert.deepEqual(Object.keys(responseLog[2]).sort(), ['method', 'path', 'statusCode']);

  process.stdout.write('http optional-auth and safe-log guards passed\n');
});
