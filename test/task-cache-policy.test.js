const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

readFile(path.join(root, 'api/cloud.js'), 'utf8').then((cloudSource) => {
  const taskListStart = cloudSource.indexOf('getTaskList(params = {})');
  const taskDetailStart = cloudSource.indexOf('// 获取任务详情', taskListStart);
  assert.notEqual(taskListStart, -1, '业主互助列表 API 必须存在');
  assert.notEqual(taskDetailStart, -1, '业主互助列表 API 结束标记必须存在');

  const taskListSource = cloudSource.slice(taskListStart, taskDetailStart);
  assert.match(
    taskListSource,
    /return cachedRequest\('api\/tasks\/list'/,
    '业主互助列表必须复用统一离线缓存策略',
  );
  assert.match(
    taskListSource,
    /cacheKeyPrefix:\s*'offline_cache_task_list'/,
    '业主互助列表缓存必须保留独立前缀以支持失效',
  );
  assert.doesNotMatch(
    taskListSource,
    /\.catch\(/,
    '业主互助列表不得再维护一套会吞掉 HTTP 500 的缓存回退逻辑',
  );

  process.stdout.write('task cache policy guards passed\n');
});
