import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyListMutation } from '../utils/listMutation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('list mutation patches, replaces and removes only the target row', () => {
  const list = [
    { id: 'a', title: 'A', count: 1 },
    { _id: 'b', title: 'B', count: 2 },
  ];

  assert.deepEqual(applyListMutation(list, { type: 'patch', id: 'a', data: { count: 3 } }), [
    { id: 'a', title: 'A', count: 3 },
    list[1],
  ]);
  assert.deepEqual(applyListMutation(list, { type: 'upsert', id: 'b', data: { id: 'b', title: '新 B' } }), [
    list[0],
    { id: 'b', title: '新 B' },
  ]);
  assert.deepEqual(applyListMutation(list, { type: 'remove', id: 'a' }), [list[1]]);
  assert.equal(applyListMutation(list, { type: 'patch', id: 'missing', data: {} }), list);
  assert.equal(applyListMutation(list, null), list);
});

test('list mutation imports use explicit relative paths that the WeChat packager can include', () => {
  const files = [
    'pages/task/index.js',
    'pages/forum/index.js',
    'pages/mall/index.js',
    'packageTask/detail/index.js',
    'packageTask/my-tasks/index.js',
    'packageForum/post/index.js',
    'packageForum/my-posts/index.js',
    'packageForum/favorites/index.js',
    'packageMall/detail/index.js',
    'packageMall/publish/index.js',
    'packageMall/my-list/index.js',
    'packageMall/favorites/index.js',
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /from ['"]~\/utils\/listMutation['"]/, `${file} must not use the alias`);
    assert.match(
      source,
      /from ['"]\.\.\/\.\.\/utils\/listMutation\.js['"]/,
      `${file} must use an explicit relative .js import`,
    );
  }
});

test('task and forum home pages no longer refresh every time onShow runs', () => {
  const task = read('pages/task/index.js');
  const forum = read('pages/forum/index.js');
  assert.doesNotMatch(task, /consumeListRefresh\(LIST_REFRESH_KEYS\.task\);\s*this\.loadList\(true\)/);
  assert.doesNotMatch(forum, /consumeListRefresh\(LIST_REFRESH_KEYS\.forum\);[\s\S]{0,180}loadPosts\(true\)/);
});

test('a consumed refresh marker is either satisfied by an event mutation or silently reconciled', () => {
  const expectations = [
    ['pages/task/index.js', 'task'],
    ['pages/forum/index.js', 'forum'],
    ['pages/mall/index.js', 'mall'],
    ['packageTask/my-tasks/index.js', 'taskMine'],
    ['packageForum/my-posts/index.js', 'forumMine'],
    ['packageForum/favorites/index.js', 'forumFavorites'],
    ['packageMall/my-list/index.js', 'mallMine'],
    ['packageMall/favorites/index.js', 'mallFavorites'],
  ];
  for (const [file, key] of expectations) {
    const source = read(file);
    assert.match(source, new RegExp(`consumeListRefresh\\(LIST_REFRESH_KEYS\\.${key}\\)`));
    assert.match(source, /_listMutationHandled/);
    assert.match(source, /silent:\s*true/);
  }
});

test('favorite lists remove rows when detail reports that the item is no longer favorited', () => {
  assert.match(read('packageForum/favorites/index.js'), /isFavorited\s*===\s*false[\s\S]{0,120}type:\s*'remove'/);
  assert.match(read('packageMall/favorites/index.js'), /isFavorited\s*===\s*false[\s\S]{0,120}type:\s*'remove'/);
});

test('detail navigation registers listMutation events for main and personal lists', () => {
  const sources = [
    'pages/task/index.js',
    'pages/forum/index.js',
    'pages/mall/index.js',
    'packageTask/my-tasks/index.js',
    'packageForum/my-posts/index.js',
    'packageForum/favorites/index.js',
    'packageMall/my-list/index.js',
    'packageMall/favorites/index.js',
  ];
  for (const file of sources) {
    assert.match(read(file), /listMutation/, `${file} must subscribe to detail mutations`);
  }
});

test('task, forum and mall details emit latest summaries and removals', () => {
  for (const file of [
    'packageTask/detail/index.js',
    'packageForum/post/index.js',
    'packageMall/detail/index.js',
  ]) {
    const source = read(file);
    assert.match(source, /emitListMutation/, `${file} must send item changes to its opener`);
  }
});
