import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { runForumAttachmentPicker, inferForumAttachmentMimeType } = require('../utils/forumAttachmentPicker.js');

function context(overrides = {}) {
  const toasts = [];
  const stages = [];
  const page = {
    data: { canManageForumPosts: true, attachmentUploading: false, attachmentStage: '', attachments: [] },
    setData(patch) { Object.assign(this.data, patch); if (patch.attachmentStage) stages.push(patch.attachmentStage); },
  };
  const wxApi = { showToast: (value) => toasts.push(value.title), chooseMessageFile: ({ success }) => success({ tempFiles: [] }) };
  return { page, wxApi: { ...wxApi, ...overrides.wxApi }, toasts, stages, hash: overrides.hash || (async () => 'sha'), check: overrides.check || (async () => ({ exists: true, mediaAssetId: 'asset' })), upload: overrides.upload || (async () => ({ mediaAssetId: 'uploaded' })) };
}

test('attachment handler rejects unavailable API and duplicate taps without starting work', async () => {
  const unavailable = context({ wxApi: { chooseMessageFile: undefined } });
  await runForumAttachmentPicker.call(unavailable.page, unavailable);
  assert.match(unavailable.toasts[0], /不支持/);
  const busy = context(); busy.page.data.attachmentUploading = true;
  await runForumAttachmentPicker.call(busy.page, busy);
  assert.deepEqual(busy.stages, []);
});

test('attachment handler treats user cancellation separately and always restores state', async () => {
  const c = context({ wxApi: { chooseMessageFile: ({ fail }) => fail({ errMsg: 'chooseMessageFile:fail cancel' }) } });
  await runForumAttachmentPicker.call(c.page, c);
  assert.equal(c.toasts.at(-1), '已取消选择文件');
  assert.equal(c.page.data.attachmentUploading, false);
  assert.equal(c.page.data.attachmentStage, '');
});

test('hash, check and upload failures report clearly and restore state', async () => {
  for (const [key, message] of [['hash', 'hash失败'], ['check', 'check失败'], ['upload', 'upload失败']]) {
    const file = { path: '/tmp/a.pdf', name: 'a.pdf', size: 12, type: 'application/pdf' };
    const options = { wxApi: { chooseMessageFile: ({ success }) => success({ tempFiles: [file] }) }, check: async () => ({ exists: false }) };
    options[key] = async () => { throw new Error(message); };
    const c = context(options);
    await runForumAttachmentPicker.call(c.page, c);
    assert.equal(c.toasts.at(-1), message);
    assert.equal(c.page.data.attachmentUploading, false);
  }
});

test('instant upload skips upload and a later file failure retains each earlier successful attachment', async () => {
  const files = [1, 2].map((n) => ({ path: `/tmp/${n}.pdf`, name: `${n}.pdf`, size: 12, type: 'application/pdf' }));
  let uploads = 0;
  const c = context({
    wxApi: { chooseMessageFile: ({ success }) => success({ tempFiles: files }) },
    hash: async (path) => path,
    check: async ({ filename }) => filename === '1.pdf' ? ({ exists: true, mediaAssetId: 'instant' }) : ({ exists: false }),
    upload: async () => { uploads += 1; throw new Error('第二个失败'); },
  });
  await runForumAttachmentPicker.call(c.page, c);
  assert.equal(uploads, 1);
  assert.deepEqual(c.page.data.attachments.map((item) => item.mediaAssetId), ['instant']);
  assert.equal(c.toasts.at(-1), '第二个失败');
  assert.deepEqual(c.stages, ['selecting', 'hashing', 'checking', 'hashing', 'checking', 'uploading']);
});

test('WeChat generic file type is ignored and supported MIME types come from the final filename', async () => {
  const cases = [
    ['pdf', 'application/pdf'],
    ['doc', 'application/msword'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xls', 'application/vnd.ms-excel'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['ppt', 'application/vnd.ms-powerpoint'],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['txt', 'text/plain'],
  ];
  for (const [extension, expected] of cases) {
    for (const actualExtension of [extension, extension.toUpperCase()]) {
      const filename = `a.${actualExtension}`;
      let checked;
      const c = context({
        wxApi: { chooseMessageFile: ({ success }) => success({ tempFiles: [{ name: filename, path: `/tmp/${filename}`, size: 12, type: 'file' }] }) },
        check: async (payload) => { checked = payload; return { exists: true, mediaAssetId: filename }; },
      });
      await runForumAttachmentPicker.call(c.page, c);
      assert.equal(inferForumAttachmentMimeType(filename), expected);
      assert.equal(checked.contentType, expected);
    }
  }
});

test('unsupported extensions fail before hash, check or upload and always restore state', async () => {
  for (const filename of ['archive.zip', 'unknown.bin']) {
    const calls = [];
    const c = context({
      wxApi: { chooseMessageFile: ({ success }) => success({ tempFiles: [{ name: filename, path: `/tmp/${filename}`, size: 12, type: 'file' }] }) },
      hash: async () => { calls.push('hash'); },
      check: async () => { calls.push('check'); },
      upload: async () => { calls.push('upload'); },
    });
    await runForumAttachmentPicker.call(c.page, c);
    assert.deepEqual(calls, []);
    assert.match(c.toasts.at(-1), /不支持/);
    assert.equal(c.page.data.attachmentUploading, false);
    assert.equal(c.page.data.attachmentStage, '');
  }
});

test('check miss uploads with the same inferred MIME while a hit never uploads', async () => {
  for (const exists of [false, true]) {
    let checked;
    let uploaded;
    const c = context({
      wxApi: { chooseMessageFile: ({ success }) => success({ tempFiles: [{ name: 'a.pdf', path: '/tmp/a.pdf', size: 12, type: 'file' }] }) },
      check: async (payload) => { checked = payload; return exists ? { exists: true, mediaAssetId: 'hit' } : { exists: false }; },
      upload: async (_path, payload) => { uploaded = payload; return { mediaAssetId: 'miss' }; },
    });
    await runForumAttachmentPicker.call(c.page, c);
    assert.equal(checked.contentType, 'application/pdf');
    if (exists) assert.equal(uploaded, undefined);
    else assert.equal(uploaded.contentType, checked.contentType);
  }
});
