const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function sectionBetween(template, startMarker, endMarker) {
  const start = template.indexOf(startMarker);
  assert.notEqual(start, -1, `缺少列表区块：${startMarker}`);
  const end = endMarker ? template.indexOf(endMarker, start + startMarker.length) : template.length;
  assert.notEqual(end, -1, `缺少列表区块结束标记：${endMarker}`);
  return template.slice(start, end);
}

function assertCardPublisherAvatar(template, pageName) {
  const tags = template.match(/<t-avatar\b[^>]*image="\{\{card\.publisherAvatar\}\}"[^>]*\/>/g) || [];
  assert.equal(tags.length, 1, `${pageName}必须且只能绑定一次发布者头像`);
  assert.match(tags[0], /size="48rpx"/, `${pageName}发布者头像必须使用列表尺寸`);
  assert.match(
    tags[0],
    /alt="\{\{card\.publisherName \|\| '发布者头像'\}\}"/,
    `${pageName}发布者头像必须提供与用户名一致的替代文本`,
  );
  assert.match(
    template,
    /<text class="task-card__publisher-name">\{\{card\.publisherName \|\| '发布者'\}\}<\/text>/,
    `${pageName}必须展示对应的发布者名称`,
  );
}

function methodSource(pageSource, methodName) {
  const methodStart = pageSource.search(new RegExp(`\\n\\s*(?:async\\s+)?${methodName}\\s*\\(`));
  assert.notEqual(methodStart, -1, `缺少页面方法：${methodName}`);
  const bodyStart = pageSource.indexOf('{', methodStart);
  assert.notEqual(bodyStart, -1, `页面方法缺少函数体：${methodName}`);
  let depth = 0;
  for (let index = bodyStart; index < pageSource.length; index += 1) {
    if (pageSource[index] === '{') depth += 1;
    if (pageSource[index] === '}') {
      depth -= 1;
      if (depth === 0) return pageSource.slice(methodStart, index + 1);
    }
  }
  assert.fail(`页面方法函数体未闭合：${methodName}`);
}

Promise.all([
  source('app.js'),
  source('config.js'),
  source('config.local.js'),
  source('config.test.js'),
  source('config.production.js'),
  source('pages/my/index.js'),
  source('pages/my/info-edit/index.js'),
  source('utils/moduleEntryGuard.js'),
  source('pages/task/index.js'),
  source('pages/task/index.wxml'),
  source('pages/task/index.less'),
  source('pages/task/index.json'),
  source('pages/forum/index.js'),
  source('pages/forum/index.wxml'),
  source('pages/forum/index.less'),
  source('pages/mall/index.js'),
  source('pages/mall/index.wxml'),
  source('pages/mall/index.less'),
  source('packageTask/detail/index.js'),
  source('packageTask/detail/index.wxml'),
  source('packageTask/detail/index.json'),
  source('packageTask/my-tasks/index.js'),
  source('packageTask/my-tasks/index.wxml'),
  source('packageTask/my-tasks/index.json'),
  source('utils/defaultAvatar.js'),
]).then(([
  app,
  configEntry,
  localConfig,
  testConfig,
  productionConfig,
  myPage,
  infoEdit,
  moduleEntryGuard,
  taskListPage,
  taskListTemplate,
  taskListStyles,
  taskListConfig,
  forumListPage,
  forumListTemplate,
  forumListStyles,
  mallListPage,
  mallListTemplate,
  mallListStyles,
  taskDetailPage,
  taskDetailTemplate,
  taskDetailConfig,
  myTasksPage,
  myTasksTemplate,
  myTasksConfig,
  defaultAvatar,
]) => {
  assert.doesNotMatch(myPage, /profileDisplay/, '“我的”页不应依赖可能被遗漏打包的新工具模块');
  assert.doesNotMatch(infoEdit, /profileDisplay/, '资料编辑页不应依赖可能被遗漏打包的新工具模块');
  assert.doesNotMatch(
    [app, configEntry, localConfig, testConfig, productionConfig].join('\n'),
    /vconsole|enableVConsole|wx\.setEnableDebug/i,
    '小程序不再集成 vConsole 或保留相关调试开关',
  );
  assert.match(
    moduleEntryGuard,
    /DEFAULT_TAB_LIST[\s\S]*?key: 'my'[\s\S]*?always: true/,
    '无远端配置时底栏默认列表必须包含“我的”',
  );
  assert.match(
    moduleEntryGuard,
    /return normalizeTabs\(DEFAULT_TAB_LIST\)/,
    '无远端配置时必须回退到默认底栏列表',
  );
  assert.match(
    defaultAvatar,
    /export const DEFAULT_AVATAR_ICON = 'user';/,
    '默认头像必须统一使用 TDesign user 图标',
  );
  assert.match(
    defaultAvatar,
    /return typeof value === 'string' \? value\.trim\(\) : '';/,
    'normalizeAvatar 必须保留有效头像地址并让空值交给 TDesign 图标兜底',
  );
  [
    ['业主互助公开列表', taskListPage],
    ['业主互助详情', taskDetailPage],
    ['我的任务列表', myTasksPage],
  ].forEach(([pageName, pageSource]) => {
    assert.match(
      pageSource,
      /import \{ normalizeAvatar \} from '~\/utils\/defaultAvatar';/,
      `${pageName}必须复用统一头像归一化工具`,
    );
    assert.match(
      pageSource,
      /publisherAvatar:\s*normalizeAvatar\([^)]*publisherAvatar\)/,
      `${pageName}必须在数据归一化阶段规范发布者头像`,
    );
  });
  assert.doesNotMatch(
    [taskListPage, taskDetailPage, myTasksPage].join('\n'),
    /\/static\/avatar1\.png/,
    '业务页面不得散落默认头像路径常量',
  );
  assert.match(
    taskDetailPage,
    /takerAvatar:\s*normalizeAvatar\([^)]*takerAvatar\)/,
    '业主互助详情展示接单人时也必须规范头像',
  );
  [
    ['业主互助公开列表', taskListTemplate, taskListConfig],
    ['业主互助详情', taskDetailTemplate, taskDetailConfig],
    ['我的任务列表', myTasksTemplate, myTasksConfig],
  ].forEach(([pageName, template, config]) => {
    assert.match(config, /"t-avatar":\s*"tdesign-miniprogram\/avatar\/avatar"/, `${pageName}必须注册 TDesign 头像组件`);
    assert.match(
      template,
      /<t-avatar\b[^>]*image="\{\{(?:card|task)\.publisherAvatar\}\}"[^>]*icon="\{\{(?:card|task)\.publisherAvatar \? '' : 'user'\}\}"/,
      `${pageName}发布者头像为空时必须显示统一的 TDesign user 图标`,
    );
  });
  assertCardPublisherAvatar(taskListTemplate, '业主互助公开列表');
  [
    ['业主互助', taskListPage, taskListTemplate, taskListStyles, 'task-search-bar__btn'],
    ['小区留言', forumListPage, forumListTemplate, forumListStyles, 'forum-search-bar__btn'],
    ['小区市场', mallListPage, mallListTemplate, mallListStyles, 'mall-search__btn'],
  ].forEach(([pageName, pageSource, template, styles, buttonClass]) => {
    assert.match(pageSource, /import \{ Subject \} from 'rxjs';/, `${pageName}必须使用 RxJS Subject`);
    assert.match(pageSource, /createHotSearch/, `${pageName}必须接入统一热搜工具`);
    assert.match(pageSource, /_searchRequestId/, `${pageName}必须防止旧请求覆盖新结果`);
    assert.match(pageSource, /queryKeyword/, `${pageName}必须分离输入值与已确认查询值`);
    assert.match(pageSource, /_pageAlive/, `${pageName}必须防止页面卸载后更新`);
    assert.doesNotMatch(template, /bindconfirm="onSearchConfirm"/, `${pageName}回车不得主动搜索`);
    assert.doesNotMatch(template, />搜索<\/view>/, `${pageName}不得保留搜索按钮`);
    assert.doesNotMatch(styles, new RegExp(`\\.${buttonClass}\\s*\\{`), `${pageName}不得保留搜索按钮样式`);
    const unload = methodSource(pageSource, 'onUnload');
    assert.match(unload, /_stopHotSearch/, `${pageName}卸载时必须停止热搜订阅`);
    assert.match(unload, /_keyword\$.*complete/, `${pageName}卸载时必须 complete 输入流`);
  });

  const detailPublisherTags =
    taskDetailTemplate.match(/<t-avatar\b[^>]*image="\{\{task\.publisherAvatar\}\}"[^>]*\/>/g) || [];
  assert.equal(detailPublisherTags.length, 1, '业主互助详情必须且只能绑定一次发布者头像');
  assert.match(detailPublisherTags[0], /size="32rpx"/, '业主互助详情发布者头像应与用户名行高接近');
  assert.match(
    detailPublisherTags[0],
    /alt="\{\{task\.publisherName \|\| '发布者头像'\}\}"/,
    '业主互助详情发布者头像必须提供替代文本',
  );
  const detailTakerTags =
    taskDetailTemplate.match(/<t-avatar\b[^>]*image="\{\{task\.takerAvatar\}\}"[^>]*\/>/g) || [];
  assert.equal(detailTakerTags.length, 1, '业主互助详情必须且只能绑定一次接单人头像');
  assert.match(detailTakerTags[0], /size="32rpx"/, '业主互助详情接单人头像应与用户名行高接近');
  assert.match(
    detailTakerTags[0],
    /alt="\{\{task\.takerName \|\| '接单人头像'\}\}"/,
    '业主互助详情接单人头像必须提供替代文本',
  );

  const myTaskSections = [
    [
      '我的任务-我发布的',
      '<view wx:if="{{activeTab === \'published\'}}" class="task-list list-fade-in">',
      '<view wx:if="{{activeTab === \'draft\'}}" class="task-list list-fade-in">',
    ],
    [
      '我的任务-草稿',
      '<view wx:if="{{activeTab === \'draft\'}}" class="task-list list-fade-in">',
      '<view wx:if="{{activeTab === \'cancelled\'}}" class="task-list list-fade-in">',
    ],
    [
      '我的任务-撤回',
      '<view wx:if="{{activeTab === \'cancelled\'}}" class="task-list list-fade-in">',
      '<view wx:if="{{activeTab === \'taken\'}}" class="task-list list-fade-in">',
    ],
    [
      '我的任务-我领取的',
      '<view wx:if="{{activeTab === \'taken\'}}" class="task-list list-fade-in">',
      '',
    ],
  ];
  myTaskSections.forEach(([sectionName, startMarker, endMarker]) => {
    assertCardPublisherAvatar(
      sectionBetween(myTasksTemplate, startMarker, endMarker),
      sectionName,
    );
  });

  const taskTabHandler = methodSource(myTasksPage, 'onTabTap');
  assert.match(taskTabHandler, /this\.setData\(\{\s*activeTab:\s*tab\s*\}/, '我的任务页签必须只在当前页面更新状态');
  assert.match(taskTabHandler, /this\.loadTasks\(\)/, '我的任务页签切换后必须在当前页面加载数据');
  assert.doesNotMatch(
    taskTabHandler,
    /wx\.(navigateTo|redirectTo|reLaunch|switchTab|navigateBack)/,
    '我的任务页签切换不得调用任何导航 API，避免重复压入页面栈',
  );

  const menuTapHandler = methodSource(myPage, 'onMenuTap');
  assert.match(menuTapHandler, /if\s*\(this\._openingService\)\s*return;/, '“我的”服务入口必须同步拦截重复点击');
  assert.match(menuTapHandler, /this\._openingService\s*=\s*true;/, '“我的”服务入口必须在异步权限检查前立即加锁');
  assert.ok(
    menuTapHandler.indexOf('this._openingService = true;') < menuTapHandler.indexOf('await ensureMutationReady(this)'),
    '“我的”服务入口点击锁必须早于异步权限检查',
  );
  assert.match(
    menuTapHandler,
    /complete:\s*\(\)\s*=>\s*\{[\s\S]*?setTimeout\([\s\S]*?this\._openingService\s*=\s*false[\s\S]*?300[\s\S]*?\)/,
    '服务跳转完成后必须短延迟解除点击锁',
  );
  assert.match(
    menuTapHandler,
    /finally\s*\{[\s\S]*?if\s*\(!navigationStarted\)\s*this\._openingService\s*=\s*false;/,
    '权限拒绝或跳转异常时必须立即解除服务入口点击锁',
  );
  const myPageUnload = methodSource(myPage, 'onUnload');
  assert.match(
    myPageUnload,
    /this\._openingService\s*=\s*false/,
    '“我的”页面卸载时必须释放服务入口点击锁',
  );
  assert.match(myPageUnload, /clearTimeout\(this\._openingServiceTimer\)/, '“我的”页面卸载时必须清理延迟解锁定时器');

  process.stdout.write('production regression guards passed\n');
});
