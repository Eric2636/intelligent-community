# 第二批：界面、搜索与意见反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一小程序列表文字规则，使用 RxJS 实现全部小程序热搜索，补齐后台 Enter 操作，并简化“更多服务”和意见反馈。

**Architecture:** 创建一个页面可复用的 RxJS 搜索绑定器，所有小程序搜索页面只提供加载函数；列表通过统一 LESS mixin 保持 1/3 行规则。反馈保存为最小后端实体，提交继续走统一授权弹框；后台仅补键盘触发，不改为热搜索。

**Tech Stack:** 微信小程序、TDesign Miniprogram、RxJS、LESS、Koa、Prisma、Vue 3、Ant Design Vue。

---

## Task 1: 建立 RxJS 热搜索基础设施

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `utils/hotSearch.js`
- Create: `test/hot-search.spec.ts`

- [ ] **Step 1: 安装并构建小程序 npm 依赖**

Run:

```bash
npm install rxjs@^7.8.2
npm install --save-dev tsx@^4.20.0
```

Expected: `package.json` 和锁文件新增 RxJS，devDependencies 新增 tsx。随后在微信开发者工具执行“工具 → 构建 npm”，确认 `miniprogram_npm/rxjs` 可解析；不要手工编辑生成目录。

- [ ] **Step 2: 写失败测试**

Create `test/hot-search.spec.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { Subject } from 'rxjs';
import { createHotSearch } from '../utils/hotSearch.js';

test('hot search trims, debounces and deduplicates', async () => {
  const input$ = new Subject<string>();
  const calls: string[] = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword), 20);
  input$.next(' a ');
  input$.next('a');
  await new Promise((resolve) => setTimeout(resolve, 30));
  input$.next('a');
  await new Promise((resolve) => setTimeout(resolve, 30));
  stop();
  assert.deepEqual(calls, ['a']);
});
```

- [ ] **Step 3: 运行并确认失败**

Run:

```bash
node --import tsx --test test/hot-search.spec.ts
```

Expected: FAIL，`utils/hotSearch.js` 不存在。

- [ ] **Step 4: 实现搜索绑定器**

Create `utils/hotSearch.js`：

```js
import { debounceTime, distinctUntilChanged, map, Subscription } from 'rxjs';

export function createHotSearch(input$, run, wait = 500) {
  const subscription = new Subscription();
  subscription.add(
    input$
      .pipe(
        map((value) => String(value || '').trim()),
        debounceTime(wait),
        distinctUntilChanged(),
      )
      .subscribe((keyword) => run(keyword)),
  );
  return () => subscription.unsubscribe();
}
```

空字符串会调用 `run('')` 以恢复默认列表，但页面加载函数不得把空字符串作为关键词发给后端。

- [ ] **Step 5: 验证**

Run:

```bash
node --import tsx --test test/hot-search.spec.ts
```

Expected: 测试 PASS。小程序全仓 lint 有历史存量，不在本步骤要求退出码 0；统一在 Task 6 生成完整 JSON 并执行基线指纹比较。

## Task 2: 改造任务、论坛和市场热搜索

**Files:**

- Modify: `pages/task/index.{js,wxml,less}`
- Modify: `pages/forum/index.{js,wxml,less}`
- Modify: `pages/mall/index.{js,wxml,less}`

- [ ] **Step 1: 增加失败回归守卫**

在 `test/production-regressions.js` 对三个页面断言：

```js
assert.match(source, /createHotSearch/);
assert.doesNotMatch(wxml, /search.*btn|>搜索<|onSearchConfirm/);
assert.match(source, /onUnload[\\s\\S]*?_stopHotSearch/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node test/production-regressions.js`

Expected: FAIL，现有页面仍有搜索按钮。

- [ ] **Step 3: 页面接入 RxJS**

每个页面使用同一模式：

```js
import { Subject } from 'rxjs';
import { createHotSearch } from '~/utils/hotSearch';

onLoad() {
  this._keyword$ = new Subject();
  this._searchRequestId = 0;
  this._stopHotSearch = createHotSearch(this._keyword$, (keyword) => {
    this.setData({ keyword, page: 1 });
    this.loadList(true, ++this._searchRequestId);
  });
  this.loadList(true, ++this._searchRequestId);
},

onSearchInput(e) {
  const value = e.detail.value || '';
  this.setData({ keyword: value });
  this._keyword$.next(value);
},

onUnload() {
  this._stopHotSearch?.();
  this._keyword$?.complete();
},
```

加载完成前比较 `requestId === this._searchRequestId`，旧请求不得覆盖新结果。清空输入触发默认列表，发送参数使用 `trimmed || undefined`。

- [ ] **Step 4: 删除按钮并保持 TDesign 样式**

WXML 删除按钮和 `bindconfirm` 的主动查询行为；保留搜索图标、clearable 输入框和清空。LESS 删除 `__btn`，输入框占满剩余宽度。

- [ ] **Step 5: 验证三条件**

Manual:

1. 连续输入时 500ms 内无请求；
2. 输入全空格时恢复默认列表，接口无 `keyword`；
3. 连续输入相同有效关键词只请求一次；
4. 快速从“a”改为“ab”，最终只展示“ab”结果。

Run:

```bash
node --import tsx --test test/hot-search.spec.ts
node test/production-regressions.js
```

Expected: 两项测试均 PASS；lint 统一按 Task 6 的历史基线策略验收。

## Task 3: 统一全部小程序列表 1/3 行规则

**Files:**

- Modify: `variable.less`
- Modify: `pages/task/index.less`
- Modify: `pages/forum/index.less`
- Modify: `pages/mall/index.less`
- Modify: `packageTask/my-tasks/index.less`
- Modify: `packageForum/my-posts/index.less`
- Modify: `packageForum/favorites/index.less`
- Modify: `packageMall/my-list/index.less`
- Modify: `packageMall/favorites/index.less`
- Modify: `packageMall/order-list/index.less`
- Modify: 对残留扫描发现的其他列表 `.less`

- [ ] **Step 1: 写失败的样式扫描**

Create `test/list-clamp.spec.ts`，读取所有业务列表 LESS，断言标题使用 1 行、描述使用 3 行。核心断言：

```ts
assert.match(taskLess, /task-card__title[\\s\\S]*?-webkit-line-clamp:\\s*1/);
assert.match(taskLess, /task-card__desc[\\s\\S]*?-webkit-line-clamp:\\s*3/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test test/list-clamp.spec.ts`

Expected: FAIL，现有 task 标题和描述均为 2 行。

- [ ] **Step 3: 添加统一 mixin**

在 `variable.less` 定义：

```less
.line-clamp(@lines) {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: @lines;
  word-break: break-word;
}
```

标题调用 `.line-clamp(1)`，正文/描述调用 `.line-clamp(3)`。容器加 `min-width: 0; max-width: 100%;`，元信息与操作按钮设 `flex-shrink: 0`。

- [ ] **Step 4: 逐页视觉检查**

用微信开发者工具检查 320px、375px、430px 宽度；包含长用户名、身份标签、长价格和无图片场景。详情页不得被 3 行截断。

- [ ] **Step 5: 验证**

Run:

```bash
node --import tsx --test test/list-clamp.spec.ts
```

Expected: 测试 PASS；lint 统一按 Task 6 的历史基线策略验收。

## Task 4: 简化“更多服务”和意见反馈

**Files:**

- Modify: `pages/my/index.js`
- Modify: `packageCommon/feedback/index.{js,wxml,less}`
- Modify: `api/cloud.js`
- Create: `../intelligent-community-admin/src/modules/feedback/feedback.dto.ts`
- Create: `../intelligent-community-admin/src/modules/feedback/feedback.service.ts`
- Create: `../intelligent-community-admin/test/feedback.spec.ts`
- Modify: `../intelligent-community-admin/prisma/schema.prisma`
- Modify: `../intelligent-community-admin/src/routes/index.ts`
- Create: `../intelligent-community-admin/prisma/migrations/20260726120000_simplify_feedback/migration.sql`

- [ ] **Step 1: 写失败测试**

后端测试断言只接受非空 `content`：

```ts
test('feedback payload contains trimmed content only', () => {
  assert.deepEqual(normalizeFeedback({ content: ' 建议 ' }), { content: '建议' });
  assert.throws(() => normalizeFeedback({ content: '   ' }), /请输入反馈内容/);
});
```

小程序回归断言反馈 WXML 不包含 `feedbackType`、`contact`，只包含 textarea 和提交按钮。

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
node test/production-regressions.js
cd ../intelligent-community-admin && node --import tsx --test test/feedback.spec.ts
```

Expected: 现有页面仍有类型和联系方式，后端 feedback 模块不存在。

- [ ] **Step 3: 建立最小反馈模型**

Prisma：

```prisma
model Feedback {
  id        String   @id @default(cuid())
  userId    String
  content   String   @db.Text
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([createdAt])
  @@map("feedbacks")
}
```

POST `/api/feedbacks` 保留 `jwtAuth`，DTO 仅允许 `content`，长度 1–500。服务保存登录用户编号和 trim 后内容。

- [ ] **Step 4: 简化小程序页面**

页面 data 只保留：

```js
data: { content: '', submitting: false }
```

提交前执行 `ensureMutationReady()`；未登录弹框后返回，不自动提交。成功后清空并返回，失败显示 TDesign/微信提示。

- [ ] **Step 5: 精简“更多服务”**

`pages/my/index.js` 的更多服务数组只保留 notice 和 feedback，不保留设置、关于、跑腿等其他项；若设置仍需访问，保留在个人资料的独立设置入口，不放在“更多服务”。

- [ ] **Step 6: 验证**

Run:

```bash
node test/production-regressions.js
cd ../intelligent-community-admin && node --import tsx --test test/feedback.spec.ts && npm run build
```

Manual: 游客提交弹授权框，登录后不自动提交，再点一次保存一条反馈。

## Task 5: 后台所有搜索和登录支持 Enter

**Files:**

- Modify: `../intelligent-community-admin-web/src/views/LoginView.vue`
- Modify: `../intelligent-community-admin-web/src/views/UsersView.vue`
- Modify: `../intelligent-community-admin-web/src/views/AdminsView.vue`
- Modify: `../intelligent-community-admin-web/src/views/ContentView.vue`
- Modify: `../intelligent-community-admin-web/src/views/SystemLogsView.vue`
- Modify: `../intelligent-community-admin-web/src/views/MiniApiErrorLogsView.vue`
- Modify: `../intelligent-community-admin-web/src/views/MallCategoriesView.vue`（若含搜索）
- Create: `../intelligent-community-admin-web/test/enter-actions.spec.mjs`

- [ ] **Step 1: 确认后台测试执行方式**

Run:

```bash
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
```

Expected: 使用 Node 内置 test runner；无需为 `.mjs` 测试额外安装 tsx。首次实现前对应行为测试应 FAIL。

- [ ] **Step 2: 写源码保护测试**

Create `../intelligent-community-admin-web/test/enter-actions.spec.mjs`，读取视图并断言搜索框、筛选和登录表单共用受保护的普通 Enter 提交逻辑，同时覆盖 IME、重复按键、分页重置和 latest-wins。

- [ ] **Step 3: 运行并确认基线**

Run:

```bash
cd ../intelligent-community-admin-web && node --test test/*.spec.mjs
```

Expected: 至少缺少显式 Enter 的视图 FAIL。

- [ ] **Step 4: 统一 Enter 处理**

普通输入框增加：

```vue
@pressEnter="() => { pagination.current = 1; load(); }"
```

`a-input-search` 的 `@search` 已包含点击图标和 Enter，两者统一调用同一 `load`。登录表单保留 `html-type="submit"`，密码和验证码输入均可 Enter；`submit()` 开头加入：

```ts
if (loading.value) return;
```

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
npm run build
```

Expected: PASS，Vue 类型检查和构建成功。

## Task 6: 更新第二批文档并验收

- [ ] **Step 1: 更新功能清单**

修改 `FEATURE_STATUS.md`：

- 搜索改为小程序 RxJS 500ms 热搜索；
- 列表标题 1 行、正文 3 行；
- 意见反馈只保留内容提交；
- 删除错误的“反馈图片上传”已完成描述；
- 后台支持 Enter 查询和登录。

- [ ] **Step 2: 更新自测清单**

在 `docs/发布前自测清单.md` 加入四项热搜索验证、三种屏宽列表验证、游客反馈授权和后台 Enter 操作。

- [ ] **Step 3: 完整验证**

Run:

```bash
node --test test/*.test.js
node --import tsx --test test/*.spec.ts
node test/production-regressions.js
npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file /private/tmp/phase2-eslint-current.json
node -e 'const fs=require("fs");const path=require("path");const base=JSON.parse(fs.readFileSync("docs/superpowers/baselines/2026-07-26-eslint-baseline.json","utf8"));const current=JSON.parse(fs.readFileSync("/private/tmp/phase2-eslint-current.json","utf8"));const key=(file,message)=>[path.relative(process.cwd(),file.filePath),message.ruleId??"",message.line??"",message.column??"",message.message].join("\u001f");const baselineKeys=new Set(base.flatMap(file=>file.messages.map(message=>key(file,message))));const currentMessages=current.flatMap(file=>file.messages.map(message=>({file,message})));const newFingerprints=currentMessages.filter(({file,message})=>!baselineKeys.has(key(file,message)));const count=files=>files.reduce((sum,file)=>({errors:sum.errors+file.errorCount,warnings:sum.warnings+file.warningCount}),{errors:0,warnings:0});console.log(JSON.stringify({baseline:count(base),current:count(current),newFingerprints:newFingerprints.length},null,2));if(newFingerprints.length||count(current).errors>4544)process.exit(2);'
cd ../intelligent-community-admin
node --import tsx --test test/*.spec.ts
npm run lint
npx dotenv -e .env.development -e .env -- prisma validate --schema prisma/schema.prisma
npm run prisma:generate
npm run build
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
npm run build
```

Expected:

- 小程序 JavaScript/TypeScript 测试和生产回归退出码为 0。
- 小程序全仓 ESLint 因已记录的历史存量错误可返回非零，但必须生成完整 JSON；当前错误数不得超过 4544，且相对 `2026-07-26-eslint-baseline.json` 的新增五元组指纹必须为 0。
- API 测试、lint、Prisma validate/generate 和构建退出码为 0。
- 后台 `.mjs` 测试和构建退出码为 0。

- [ ] **Step 4: 提交检查点（仅在明确授权后）**

分别在三个 `dev` 仓库提交：

```bash
git commit -m "feat(mini): add reactive search and simplify feedback"
git commit -m "feat(api): persist simplified user feedback"
git commit -m "feat(admin-web): support enter actions"
```
