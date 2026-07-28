const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function loadPage(pageSource, dependencies) {
  let definition;
  vm.runInNewContext(pageSource.replace(/^import .*;\s*$/gm, ''), {
    Page(config) {
      definition = config;
    },
    STATUS_TEXT: undefined,
    config: { enableTaskPayment: false },
    ensureMutationReady: dependencies.ensureMutationReady,
    chooseAndUploadMedia: dependencies.chooseAndUploadMedia,
    firstUrl() {
      return '';
    },
    getApp: dependencies.getApp,
    redirectIfEntryHidden() {
      return false;
    },
    taskAPI: dependencies.taskAPI,
    withDefaultAvatar(value) {
      return value || '/default-avatar.png';
    },
    withImage(payload) {
      return payload;
    },
    wx: dependencies.wx,
  });
  return definition;
}

function createHarness(pageSource, options = {}) {
  const calls = {
    auth: 0,
    reject: [],
    cancel: [],
    submit: [],
    uploads: 0,
    loadDetail: 0,
    modals: [],
    toasts: [],
  };
  let active = true;
  let authResult =
    Object.prototype.hasOwnProperty.call(options, 'authResult') ? options.authResult : true;
  const page = {
    data: {
      id: 'task-1',
      task: {
        status: 'pending_confirm',
        publisherId: 'user-a',
        takerId: 'user-b',
      },
      loading: false,
      isPublisher: true,
      isTaker: false,
      proofText: '',
      proofImages: [],
      proofUploading: false,
    },
    setData(updates) {
      Object.assign(this.data, updates);
    },
  };
  const definition = loadPage(pageSource, {
    ensureMutationReady: async () => {
      calls.auth += 1;
      return authResult && active;
    },
    chooseAndUploadMedia: async () => {
      calls.uploads += 1;
      if (options.uploadError) throw options.uploadError;
      return options.uploadResult || { images: ['https://cdn.example.com/new.png'], videos: [] };
    },
    getApp: () => ({ globalData: { userInfo: { id: 'user-a' } } }),
    taskAPI: {
      rejectComplete: async (taskId) => {
        calls.reject.push(taskId);
        return options.rejectResult || { code: 200, data: {} };
      },
      cancelTask: async (taskId) => {
        calls.cancel.push(taskId);
        return options.cancelResult || { code: 200, data: {} };
      },
      submitComplete: async (...args) => {
        calls.submit.push(args);
        return options.submitResult || { code: 200, data: {} };
      },
    },
    wx: {
      showModal(modalOptions) {
        calls.modals.push(modalOptions);
        if (options.autoConfirm !== false) {
          Promise.resolve(modalOptions.success({ confirm: true, cancel: false }));
        }
      },
      showToast(toastOptions) {
        calls.toasts.push(toastOptions);
      },
    },
  });
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  page.loadDetail = async () => {
    calls.loadDetail += 1;
  };
  return {
    calls,
    page,
    setActive(value) {
      active = value;
    },
    setAuthResult(value) {
      authResult = value;
    },
  };
}

test('task detail exposes a TDesign secondary danger reject action only in publisher pending-confirm block', async () => {
  const [template, configSource] = await Promise.all([
    source('packageTask/detail/index.wxml'),
    source('packageTask/detail/index.json'),
  ]);
  const config = JSON.parse(configSource);
  const pendingBlock = template.slice(
    template.indexOf("task.status === 'pending_confirm' && isPublisher"),
    template.indexOf("task.status === 'pending_take' && isPublisher"),
  );

  assert.match(
    pendingBlock,
    /<t-button\b[^>]*theme="danger"[^>]*variant="outline"[^>]*bindtap="onRejectComplete"[^>]*>驳回<\/t-button>/,
  );
  assert.equal(config.usingComponents['t-button'], 'tdesign-miniprogram/button/button');
});

test('retained text, image and submission time proofs remain visible after rejection', async () => {
  const [pageSource, template] = await Promise.all([
    source('packageTask/detail/index.js'),
    source('packageTask/detail/index.wxml'),
  ]);
  const proofBlock = template.slice(
    template.indexOf('class="detail-card__proof"'),
    template.indexOf('<button class="detail-share-btn"'),
  );

  assert.match(template, /wx:if="\{\{task\.proofText \|\| task\.proofImages\.length\}\}" class="detail-card__proof"/);
  assert.match(proofBlock, /wx:for="\{\{task\.proofImages\}\}"/);
  assert.match(proofBlock, /bindtap="onPreviewProofImages"/);
  assert.match(proofBlock, /\{\{task\.completedAt\}\}/);
  assert.match(pageSource, /onPreviewProofImages\(e\)/);
});

test('guest reject opens auth only and login completion never replays the protected action', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  const harness = createHarness(pageSource, { authResult: false });

  await harness.page.onRejectComplete();
  assert.equal(harness.calls.auth, 1);
  assert.equal(harness.calls.modals.length, 0);
  assert.equal(harness.calls.reject.length, 0);

  harness.setAuthResult(true);
  await Promise.resolve();
  assert.equal(harness.calls.reject.length, 0);

  await harness.page.onRejectComplete();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.calls.reject.length, 1);
});

test('reject requires explicit confirmation, is single-flight and refreshes only while mounted', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  let resolveReject;
  const rejectPromise = new Promise((resolve) => {
    resolveReject = resolve;
  });
  const harness = createHarness(pageSource, {
    rejectResult: rejectPromise,
  });

  const first = harness.page.onRejectComplete();
  await Promise.resolve();
  await harness.page.onRejectComplete();
  assert.equal(harness.calls.modals.length, 1);
  assert.equal(harness.calls.reject.length, 1);

  harness.page.onUnload();
  harness.setActive(false);
  resolveReject({ code: 200, data: {} });
  await first;
  assert.equal(harness.calls.loadDetail, 0);
  assert.equal(harness.calls.toasts.length, 0);
});

test('canceling the reject confirmation performs no request', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  const harness = createHarness(pageSource, { autoConfirm: false });

  const rejection = harness.page.onRejectComplete();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const modal = harness.calls.modals[0];
  assert.ok(modal);
  assert.match(modal.title, /驳回/);
  await modal.success({ confirm: false, cancel: true });
  await rejection;
  assert.equal(harness.calls.reject.length, 0);
});

test('task API declares reject-complete as a required-auth mutation', async () => {
  const cloudSource = await source('api/cloud.js');
  const start = cloudSource.indexOf('  rejectComplete(');
  const end = cloudSource.indexOf('  cancelTask(', start + 3);
  assert.notEqual(start, -1);
  const body = cloudSource.slice(start, end);
  assert.match(body, /path:\s*`api\/tasks\/\$\{taskId\}\/reject-complete`/);
  assert.match(body, /auth:\s*true/);
});

test('publisher can cancel pending, assigned, and pending-confirm tasks through TDesign danger actions', async () => {
  const template = await source('packageTask/detail/index.wxml');
  ['pending_take', 'in_progress', 'pending_confirm'].forEach((status) => {
    const marker = `task.status === '${status}' && isPublisher`;
    const start = template.indexOf(marker);
    assert.notEqual(start, -1, `${status} publisher action block should exist`);
    const block = template.slice(start, template.indexOf('</block>', start));
    assert.match(block, /theme="danger"/);
    assert.match(block, /variant="outline"/);
    assert.match(block, /bindtap="onCancel"/);
  });
});

test('assigned cancellation confirms once, is single-flight, and refreshes after success', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  let resolveCancel;
  const harness = createHarness(pageSource, {
    cancelResult: new Promise((resolve) => {
      resolveCancel = resolve;
    }),
  });
  harness.page.data.task.status = 'in_progress';

  const first = harness.page.onCancel();
  await Promise.resolve();
  await harness.page.onCancel();
  assert.equal(harness.calls.modals.length, 1);
  assert.match(harness.calls.modals[0].content, /通知对方/);
  assert.equal(harness.calls.cancel.length, 1);

  resolveCancel({ code: 200 });
  await first;
  assert.equal(harness.calls.loadDetail, 1);
});

test('proof images upload, remove, and submit as the third API argument', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  const harness = createHarness(pageSource);
  harness.page.data.isPublisher = false;
  harness.page.data.isTaker = true;
  harness.page.data.task.status = 'in_progress';

  await harness.page.onAddProofImages();
  assert.equal(harness.calls.uploads, 1);
  assert.deepEqual(Array.from(harness.page.data.proofImages), ['https://cdn.example.com/new.png']);
  await harness.page.onSubmitComplete();
  assert.deepEqual(Array.from(harness.calls.submit[0], (value) => (
    Array.isArray(value) ? Array.from(value) : value
  )), [
    'task-1',
    '',
    ['https://cdn.example.com/new.png'],
  ]);

  harness.page.onRemoveProofImage({ currentTarget: { dataset: { index: 0 } } });
  assert.deepEqual(Array.from(harness.page.data.proofImages), []);
});

test('failed proof upload preserves existing images and text-or-image validation blocks empty proof', async () => {
  const pageSource = await source('packageTask/detail/index.js');
  const harness = createHarness(pageSource, { uploadError: new Error('upload failed') });
  harness.page.data.proofImages = ['https://cdn.example.com/old.png'];
  await harness.page.onAddProofImages();
  assert.deepEqual(harness.page.data.proofImages, ['https://cdn.example.com/old.png']);

  harness.page.data.proofImages = [];
  await harness.page.onSubmitComplete();
  assert.equal(harness.calls.submit.length, 0);
  assert.match(harness.calls.toasts.at(-1).title, /说明或上传图片/);
});
