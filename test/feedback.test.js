const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function loadFeedbackPage(pageSource, dependencies) {
  let definition;
  const transformed = pageSource.replace(/^import .*;\s*$/gm, '');
  vm.runInNewContext(transformed, {
    Page(config) {
      definition = config;
    },
    commonAPI: dependencies.commonAPI,
    ensureMutationReady: dependencies.ensureMutationReady,
    clearTimeout: dependencies.clearTimeout,
    getCurrentPages: dependencies.getCurrentPages,
    setTimeout: dependencies.setTimeout,
    wx: dependencies.wx,
  });
  return definition;
}

function instantiatePage(definition) {
  const page = {
    data: { ...definition.data },
    setData(updates, callback) {
      Object.assign(this.data, updates);
      if (callback) callback();
    },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });
  return page;
}

function dispatchBoundComponentEvent(template, componentName, eventName, page, detail) {
  const componentTag = template.match(new RegExp(`<${componentName}\\b[\\s\\S]*?\\/>`));
  assert.ok(componentTag, `缺少 ${componentName} 组件`);
  const binding = componentTag[0].match(new RegExp(`\\bbind:${eventName}="([^"]+)"`));
  assert.ok(binding, `${componentName} 缺少 ${eventName} 事件绑定`);
  const handler = page[binding[1]];
  assert.equal(typeof handler, 'function', `${eventName} 绑定的方法不存在`);
  handler({ detail });
}

function createHarness(pageSource, overrides = {}) {
  const calls = {
    auth: 0,
    clearedTimers: [],
    navigationOptions: [],
    requests: [],
    timers: [],
    toasts: [],
    navigateBack: 0,
  };
  let authResult =
    Object.prototype.hasOwnProperty.call(overrides, 'authResult') ? overrides.authResult : true;
  let resolveRequest;
  const requestPromise =
    overrides.requestPromise ||
    new Promise((resolve) => {
      resolveRequest = resolve;
    });
  let nextTimerId = 1;
  let currentPage;
  const definition = loadFeedbackPage(pageSource, {
    commonAPI: {
      submitFeedback: async (payload) => {
        calls.requests.push(payload);
        return requestPromise;
      },
    },
    ensureMutationReady: async () => {
      calls.auth += 1;
      return authResult;
    },
    getCurrentPages: () => [currentPage],
    setTimeout: (callback, delay) => {
      const timer = { active: true, callback, delay, id: nextTimerId };
      nextTimerId += 1;
      calls.timers.push(timer);
      return timer.id;
    },
    clearTimeout: (timerId) => {
      const timer = calls.timers.find((item) => item.id === timerId);
      if (timer) timer.active = false;
      calls.clearedTimers.push(timerId);
    },
    wx: {
      showToast(options) {
        calls.toasts.push(options);
      },
      navigateBack(options) {
        calls.navigateBack += 1;
        calls.navigationOptions.push(options || {});
      },
    },
  });
  const page = instantiatePage(definition);
  currentPage = page;
  page.onLoad();
  return {
    calls,
    page,
    resolveRequest,
    completeNavigation(result) {
      const options = calls.navigationOptions[calls.navigationOptions.length - 1];
      assert.ok(options, 'navigateBack 尚未调用');
      if (typeof options[result] === 'function') options[result]();
      if (typeof options.complete === 'function') options.complete();
    },
    runTimers() {
      calls.timers
        .filter((timer) => timer.active)
        .forEach((timer) => {
          timer.active = false;
          timer.callback();
        });
    },
    setAuthResult(value) {
      authResult = value;
    },
  };
}

test('more services contains only notifications and feedback', async () => {
  const myPage = await source('pages/my/index.js');
  const moreSection = myPage.slice(
    myPage.indexOf('const RAW_SECTION_MORE'),
    myPage.indexOf('function entryVisible'),
  );

  assert.equal((moreSection.match(/url:/g) || []).length, 2);
  assert.match(moreSection, /url: 'notice'/);
  assert.match(moreSection, /url: 'feedback'/);
  assert.doesNotMatch(moreSection, /about|setting|service|联系客服/);
});

test('feedback page renders only a content textarea and submit button', async () => {
  const [pageSource, template, configSource] = await Promise.all([
    source('packageCommon/feedback/index.js'),
    source('packageCommon/feedback/index.wxml'),
    source('packageCommon/feedback/index.json'),
  ]);
  const config = JSON.parse(configSource);

  assert.deepEqual(
    Object.keys(
      loadFeedbackPage(pageSource, {
        commonAPI: {},
        ensureMutationReady: async () => true,
        getCurrentPages: () => [],
        setTimeout,
        wx: {},
      }).data,
    ).sort(),
    ['content', 'contentLength', 'submitting'],
  );
  assert.match(template, /<t-textarea\b/);
  assert.match(template, /maxlength="-1"/);
  assert.doesNotMatch(template, /<t-textarea\b[\s\S]*?\bmaxlength="500"/);
  assert.match(template, /<t-button\b/);
  assert.doesNotMatch(template, /feedbackType|typeOptions|contact|t-picker|t-input/);
  assert.match(template, /<auth-login-dialog\s+id="auth-login-dialog"/);
  assert.deepEqual(config.usingComponents, {
    't-button': 'tdesign-miniprogram/button/button',
    't-textarea': 'tdesign-miniprogram/textarea/textarea',
  });
});

test('feedback textarea follows TDesign events without UTF-16 truncation', async () => {
  const [pageSource, template, tdesignTextarea, tdesignUtils, tdesignPackage] = await Promise.all([
    source('packageCommon/feedback/index.js'),
    source('packageCommon/feedback/index.wxml'),
    source('node_modules/tdesign-miniprogram/miniprogram_dist/textarea/textarea.js'),
    source('node_modules/tdesign-miniprogram/miniprogram_dist/common/utils.js'),
    source('node_modules/tdesign-miniprogram/package.json'),
  ]);
  const packageInfo = JSON.parse(tdesignPackage);

  assert.match(packageInfo.version, /^1\./);
  assert.match(tdesignTextarea, /onInput\(e\)[\s\S]*?triggerEvent\("change",\{value:this\.data\.value,cursor:a\}\)/);
  assert.doesNotMatch(tdesignTextarea, /triggerEvent\("input"/);
  assert.match(tdesignUtils, /"maxlength"===e[\s\S]*?o\.slice\(0,e\)/);
  assert.match(template, /<t-textarea\b[\s\S]*?\bbind:change="onContentInput"[\s\S]*?\/>/);
  assert.doesNotMatch(template, /<t-textarea\b[\s\S]*?\bbind:input=/);
  assert.match(template, /<t-textarea\b[\s\S]*?\bmaxlength="-1"[\s\S]*?\/>/);

  const harness = createHarness(pageSource);
  dispatchBoundComponentEvent(
    template,
    't-textarea',
    'change',
    harness.page,
    { value: '来自 TDesign change 的内容', cursor: 20 },
  );
  assert.equal(harness.page.data.content, '来自 TDesign change 的内容');
  assert.equal(
    harness.page.data.contentLength,
    Array.from('来自 TDesign change 的内容').length,
  );
});

test('guest submit opens auth but does not submit or replay after authorization', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const harness = createHarness(pageSource, { authResult: false });
  harness.page.setData({ content: ' 建议增加公告筛选 ' });

  await harness.page.submit();
  assert.equal(harness.calls.auth, 1);
  assert.equal(harness.calls.requests.length, 0);

  harness.setAuthResult(true);
  harness.page.onAuthorized();
  await Promise.resolve();
  assert.equal(harness.calls.requests.length, 0);

  const submit = harness.page.submit();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.calls.requests.length, 1);
  assert.equal(harness.calls.requests[0].content, '建议增加公告筛选');
  assert.deepEqual(Object.keys(harness.calls.requests[0]), ['content']);
  harness.resolveRequest({ code: 200 });
  await submit;
});

test('blank feedback is rejected and submission stays locked until navigation succeeds', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const harness = createHarness(pageSource);

  harness.page.setData({ content: '   ' });
  await harness.page.submit();
  assert.equal(harness.calls.requests.length, 0);
  assert.match(harness.calls.toasts[harness.calls.toasts.length - 1].title, /请输入反馈内容/);

  harness.page.setData({ content: ' 可否增加夜间模式 ' });
  const first = harness.page.submit();
  await harness.page.submit();
  assert.equal(harness.calls.requests.length, 1);
  harness.resolveRequest({ code: 200 });
  await first;
  assert.equal(harness.page.data.content, '');
  assert.equal(harness.page.data.submitting, true);
  assert.equal(harness.page._submitInFlight, true);
  assert.equal(harness.calls.timers.length, 1);
  assert.equal(harness.calls.navigateBack, 0);

  harness.page.setData({ content: '返回前重复提交' });
  await harness.page.submit();
  assert.equal(harness.calls.requests.length, 1);

  harness.runTimers();
  assert.equal(harness.calls.navigateBack, 1);
  assert.equal(harness.page._submitInFlight, true);
  await harness.page.submit();
  assert.equal(harness.calls.requests.length, 1);

  harness.completeNavigation('success');
  assert.equal(harness.page._submitInFlight, false);
  assert.equal(harness.page.data.submitting, false);
});

test('navigation failure and unload release the success lock safely', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const failedNavigation = createHarness(pageSource);
  failedNavigation.page.setData({ content: '已保存但返回失败' });
  const first = failedNavigation.page.submit();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  failedNavigation.resolveRequest({ code: 200 });
  await first;
  failedNavigation.runTimers();
  failedNavigation.completeNavigation('fail');
  assert.equal(failedNavigation.page._submitInFlight, false);
  assert.equal(failedNavigation.page.data.submitting, false);

  const unloaded = createHarness(pageSource);
  unloaded.page.setData({ content: '成功后马上卸载' });
  const second = unloaded.page.submit();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  unloaded.resolveRequest({ code: 200 });
  await second;
  assert.equal(unloaded.page._submitInFlight, true);
  unloaded.page.onUnload();
  unloaded.runTimers();
  assert.equal(unloaded.page._submitInFlight, false);
  assert.equal(unloaded.calls.navigateBack, 0);
  assert.deepEqual(unloaded.calls.clearedTimers, [1]);
});

test('missing navigateBack callbacks cannot leave feedback permanently locked', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const harness = createHarness(pageSource);
  harness.page.setData({ content: '返回回调异常' });
  const pending = harness.page.submit();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  harness.resolveRequest({ code: 200 });
  await pending;

  harness.runTimers();
  assert.equal(harness.calls.navigateBack, 1);
  assert.equal(harness.page._submitInFlight, true);

  harness.runTimers();
  assert.equal(harness.page._submitInFlight, false);
  assert.equal(harness.page.data.submitting, false);
  assert.equal(
    harness.calls.toasts[harness.calls.toasts.length - 1].title,
    '反馈已提交，请手动返回',
  );
});

test('mini feedback counts Unicode code points at the 500-character boundary', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const trimmedHarness = createHarness(pageSource);
  trimmedHarness.page.onContentInput({ detail: { value: '  😀  ' } });
  assert.equal(trimmedHarness.page.data.contentLength, 1);
  const cases = [
    ['😀'.repeat(250), true],
    ['😀'.repeat(500), true],
    ['😀'.repeat(501), false],
    ['e\u0301'.repeat(250), true],
    ['e\u0301'.repeat(251), false],
  ];

  await Promise.all(
    cases.map(async ([content, accepted]) => {
      const harness = createHarness(pageSource);
      harness.page.onContentInput({ detail: { value: content } });
      const pending = harness.page.submit();
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      assert.equal(harness.page.data.contentLength, Array.from(content).length);
      assert.equal(harness.calls.requests.length, accepted ? 1 : 0);
      if (accepted) {
        harness.resolveRequest({ code: 500, message: '测试结束' });
        await pending;
      } else {
      await pending;
      assert.match(
        harness.calls.toasts[harness.calls.toasts.length - 1].title,
        /不能超过500个字符/,
      );
      }
    }),
  );
});

test('failed submission keeps content and unload prevents late UI updates', async () => {
  const pageSource = await source('packageCommon/feedback/index.js');
  const failed = createHarness(pageSource, {
    requestPromise: Promise.resolve({ code: 500, message: '服务繁忙' }),
  });
  failed.page.setData({ content: ' 请保留这段内容 ' });
  await failed.page.submit();
  assert.equal(failed.page.data.content, ' 请保留这段内容 ');
  assert.equal(failed.page.data.submitting, false);
  assert.equal(failed.calls.toasts[failed.calls.toasts.length - 1].title, '服务繁忙');

  let resolveLate;
  const late = createHarness(pageSource, {
    requestPromise: new Promise((resolve) => {
      resolveLate = resolve;
    }),
  });
  late.page.setData({ content: '页面离开后不更新' });
  const pending = late.page.submit();
  late.page.onUnload();
  resolveLate({ code: 200 });
  await pending;
  assert.equal(late.page.data.content, '页面离开后不更新');
  assert.equal(late.calls.navigateBack, 0);
});
