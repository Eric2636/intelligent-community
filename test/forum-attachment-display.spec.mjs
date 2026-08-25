import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { forumAttachmentDisplayMeta, readableFileSize } = require('../utils/forumAttachmentDisplay.js');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('attachment display derives uppercase format and readable byte sizes', () => {
  assert.deepEqual(forumAttachmentDisplayMeta({ name: 'notice.final.pdf', sizeBytes: 1536 }), {
    formatLabel: 'PDF',
    sizeLabel: '1.5 KB',
    secondaryText: 'PDF · 1.5 KB',
  });
  assert.equal(forumAttachmentDisplayMeta({ name: 'minutes.docx', sizeBytes: 2 * 1024 * 1024 }).secondaryText, 'DOCX · 2 MB');
  assert.equal(forumAttachmentDisplayMeta({ name: 'README', sizeBytes: 12 }).secondaryText, '文件 · 12 B');
});

test('readable attachment sizes keep stable binary-unit boundaries', () => {
  const cases = [
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1048575, '1024 KB'],
    [1048576, '1 MB'],
    [20 * 1024 * 1024, '20 MB'],
  ];
  for (const [bytes, expected] of cases) assert.equal(readableFileSize(bytes), expected);
});

test('post detail renders a counted full-row attachment card without changing preview behavior', () => {
  const view = read('packageForum/post/index.wxml');
  const style = read('packageForum/post/index.less');
  const script = read('packageForum/post/index.js');
  const variables = new Set([...read('variable.less').matchAll(/^(@[\w-]+):/gm)].map((match) => match[1]));
  assert.match(view, /附件（\{\{post\.attachments\.length\}\}）/);
  assert.match(view, /class="post-attachments__item"[^>]*data-item="\{\{item\}\}"[^>]*bindtap="onOpenAttachment"/);
  assert.match(view, /class="post-attachments__item"[^>]*hover-class="post-attachments__item--pressed"/);
  assert.match(view, /post-attachments__icon/);
  assert.match(view, /post-attachments__name/);
  assert.match(view, /\{\{item\.displayMeta\.secondaryText\}\}/);
  assert.match(view, />预览<\/text>/);
  assert.match(view, /name="chevron-right"/);
  assert.match(style, /&__name\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(style, /&__action\s*\{[\s\S]*?flex-shrink:\s*0/);
  assert.match(style, /&__item--pressed\s*\{[\s\S]*?background:/);
  assert.deepEqual([...new Set(style.match(/@[\w-]+/g) || [])].filter((name) => name !== '@import' && !variables.has(name)), []);
  assert.match(script, /forumAttachmentDisplayMeta/);
  assert.match(script, /wx\.downloadFile/);
  assert.match(script, /res\.statusCode !== 200/);
  assert.match(script, /wx\.openDocument\(\{ filePath: res\.tempFilePath, showMenu: true/);
});
