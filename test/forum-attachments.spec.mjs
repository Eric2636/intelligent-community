import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildForumPostEditPayload } from '../utils/forumPostPayload.js';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file) => readFile(path.join(root, file), 'utf8');

test('mini program exposes attachments only for administrators and submits complete IDs', async () => {
  const source = `${await read('packageForum/publish/index.js')}\n${await read('utils/forumAttachmentPicker.js')}`;
  const wxml = await read('packageForum/publish/index.wxml');
  assert.match(source, /canManageForumPosts/);
  assert.match(source, /chooseMessageFile/);
  assert.match(source, /5 - this\.data\.attachments\.length/);
  assert.match(source, /20 \* 1024 \* 1024/);
  assert.match(source, /attachments\.map/);
  assert.match(wxml, /附件（最多5个，单个20MB）/);
});

test('forum publish styles reference only defined shared LESS variables', async () => {
  const source = await read('packageForum/publish/index.less');
  const variables = await read('variable.less');
  const defined = new Set(
    [...variables.matchAll(/^@([\w-]+)\s*:/gm)].map((match) => match[1]),
  );
  const referenced = new Set(
    [...source.matchAll(/@([\w-]+)/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'import'),
  );
  const undefinedVariables = [...referenced].filter((name) => !defined.has(name));
  assert.deepEqual(undefinedVariables, []);
});

test('mini program performs SHA-256 preflight and uses a multipart upload only on a miss', async () => {
  const api = await read('api/cloud.js');
  const page = await read('utils/forumAttachmentPicker.js');
  const hash = await read('utils/sha256.js');
  assert.match(api, /api\/posts\/attachments\/check/);
  assert.match(api, /api\/posts\/attachments\/upload/);
  assert.match(hash, /SHA-256/);
  assert.match(page, /payload\?\.exists \? payload : await upload/);
});

test('post detail downloads attachments through openDocument', async () => {
  const source = await read('packageForum/post/index.js');
  const wxml = await read('packageForum/post/index.wxml');
  assert.match(source, /wx\.downloadFile/);
  assert.match(source, /wx\.openDocument/);
  assert.match(wxml, /post\.attachments/);
});

test('attachment chooser exposes a full action area and recovers across selection stages', async () => {
  const page = await read('utils/forumAttachmentPicker.js');
  const view = await read('packageForum/publish/index.wxml');
  assert.match(page, /typeof wxApi\.chooseMessageFile !== 'function'/);
  assert.match(page, /attachmentStage:\s*'selecting'/);
  assert.match(page, /attachmentStage:\s*'hashing'/);
  assert.match(page, /attachmentStage:\s*'checking'/);
  assert.match(page, /attachmentStage:\s*'uploading'/);
  assert.match(page, /fail:\s*reject/);
  assert.match(page, /cancel/i);
  assert.match(view, /attachment-picker__action/);
  assert.match(view, /正在选择文件|正在计算文件哈希|正在检查秒传|正在上传/);
});

test('registration fields have explicit labels and a native date picker affordance', async () => {
  const view = await read('packageForum/publish/index.wxml');
  assert.match(view, />报名人数上限</);
  assert.match(view, />报名截止日期</);
  assert.match(view, /picker mode="date"/);
  assert.match(view, /name="calendar"/);
  assert.match(view, /name="chevron-right"/);
});

test('functional post selector uses the activity type business language', async () => {
  const view = await read('packageForum/publish/index.wxml');
  assert.match(view, /publish-admin-options__label">活动类型</);
  assert.match(view, /data-value="CONTENT"[^>]*>内容</);
  assert.doesNotMatch(view, /publish-admin-options__label">帖子类型|data-value="CONTENT"[^>]*>内容贴</);
});

test('mini administrator edit submits the complete attachment ID list', async () => {
  const api = await read('api/cloud.js');
  const page = await read('packageForum/publish/index.js');
  const mine = await read('packageForum/my-posts/index.js');
  assert.match(api, /updatePost\(postId, data\)/);
  assert.match(page, /loadEditPost/);
  assert.match(page, /this\.data\.editing \? await forumAPI\.updatePost/);
  assert.match(page, /buildForumPostEditPayload/);
  assert.match(page, /!this\.data\.editing && featureType === 'REGISTRATION'/);
  assert.match(mine, /editPostId=/);
});

test('mini edit payload is the strict UpdateForumPostDto for normal, announcement and registration posts', () => {
  for (const feature of ['CONTENT', 'ANNOUNCEMENT', 'REGISTRATION']) {
    const payload = buildForumPostEditPayload({
      title: `${feature} title`, content: '正文', mediaImages: ['https://img/a.jpg'], mediaVideos: [],
      attachments: [{ mediaAssetId: 'asset-1' }], featureType: feature, pinned: true,
      registrationCapacity: 20, registrationDeadlineAt: '2099-01-01', postType: 'ANNOUNCEMENT',
    });
    assert.deepEqual(Object.keys(payload).sort(), ['attachments', 'content', 'images', 'title', 'videos']);
    assert.equal(payload.title, `${feature} title`);
    assert.deepEqual(payload.attachments, [{ mediaAssetId: 'asset-1' }]);
    assert.equal('featureType' in payload, false);
    assert.equal('postType' in payload, false);
    assert.equal('pinned' in payload, false);
    assert.equal('registrationCapacity' in payload, false);
    assert.equal('registrationDeadlineAt' in payload, false);
  }
});

test('mini edit mode hides controls that the edit DTO cannot change', async () => {
  const wxml = await read('packageForum/publish/index.wxml');
  assert.match(wxml, /canManageForumPosts && !editing/);
});
