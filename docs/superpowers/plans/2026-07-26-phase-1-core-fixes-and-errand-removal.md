# 第一批：核心修复与跑腿下线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复全历史用户展示信息、默认头像、授权弹框、市场游客查询和“我的任务”返回问题，并安全删除小区跑腿全栈代码及数据表。

**Architecture:** 用户表仍是资料真实来源，内容表保留展示快照并在资料更新事务中统一同步；小程序用一个 TDesign 授权组件集中处理受保护操作；公开市场接口使用可选鉴权。跑腿删除使用独立 Prisma 迁移，并在三个仓库分别清理专属依赖。

**Tech Stack:** 微信小程序原生框架、TDesign Miniprogram、Koa、TypeScript、Prisma、MySQL、Node test runner。

---

## 开工前文件边界

小程序：

- Create: `components/auth-login-dialog/index.{js,json,wxml,less}`
- Create: `utils/defaultAvatar.js`
- Modify: `utils/authIdentity.js`
- Modify: `app.json`
- Modify: `pages/task/index.{js,wxml,less}`
- Modify: `packageTask/detail/index.{js,wxml,less}`
- Modify: `packageTask/my-tasks/index.js`
- Modify: `pages/my/index.js`
- Modify: `api/cloud.js`
- Modify: `utils/moduleEntryGuard.js`
- Modify: `utils/listRefresh.js`
- Modify: `utils/cloudMedia.js`
- Modify: `custom-tab-bar/index.{js,wxml}`
- Delete: `pages/errand/**`
- Delete: `packageErrand/**`

后端：

- Create: `test/user-profile-snapshots.spec.ts`
- Create: `test/mall-public-read.spec.ts`
- Create: `test/errand-removal.spec.ts`
- Create: `prisma/migrations/20260726090000_add_author_avatar_snapshots/migration.sql`
- Create: `prisma/migrations/20260726100000_remove_errand_module/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/modules/user/user.service.ts`
- Modify: `src/modules/task/task.service.ts`
- Modify: `src/modules/forum/forum.service.ts`
- Modify: `src/modules/mall/mall-item.service.ts`
- Modify: `src/modules/mall/mall-comment.service.ts`
- Modify: `src/modules/mall/mall-order.service.ts`
- Modify: `src/modules/mall/mall.serialize.ts`
- Modify: `src/routes/index.ts`
- Modify: `src/routes/mall.routes.ts`
- Modify: `src/middleware/jwt-auth.ts`
- Modify: `src/modules/admin/admin.service.ts`
- Modify: `src/routes/admin.routes.ts`
- Modify: `src/modules/upload/upload.{dto,service}.ts`
- Modify: `src/modules/settings/settings.service.ts`
- Modify: `src/lib/redis-cache.ts`
- Modify: `src/swagger/openapi.ts`
- Delete: `src/modules/errand/errand.dto.ts`
- Delete: `src/modules/errand/errand.service.ts`

后台：

- Modify: `src/router/index.ts`
- Modify: `src/views/ContentView.vue`
- Modify: `src/api/admin.ts`
- Modify: `src/types/api.ts`

## Task 1: 建立三个仓库的安全开发基线

- [ ] **Step 1: 检查三个仓库状态**

Run:

```bash
git -C ../intelligent-community status --short --branch
git -C ../intelligent-community-admin status --short --branch
git -C ../intelligent-community-admin-web status --short --branch
```

Expected: 明确列出三个仓库分支和既有改动；不得覆盖用户改动。

- [ ] **Step 2: 将后端和后台安全切到 `dev`**

Run:

```bash
git -C ../intelligent-community-admin switch dev
git -C ../intelligent-community-admin-web switch dev
```

Expected: 两个仓库均显示 `Switched to branch 'dev'`。小程序仓库已经在 `dev`。

- [ ] **Step 3: 记录基线验证**

Run:

```bash
node test/production-regressions.js
npm run lint
npm --prefix ../intelligent-community-admin run build
npm --prefix ../intelligent-community-admin-web run build
```

Expected: 回归守卫输出 `production regression guards passed`；其余命令退出码为 0。若现有基线失败，先记录原始失败，不得把它误报为本批引入。

## Task 2: 增加作者快照字段和统一默认头像

- [ ] **Step 1: 写失败的后端快照测试**

Create `../intelligent-community-admin/test/user-profile-snapshots.spec.ts`，至少断言：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('profile snapshot schema covers all retained content modules', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /publisherAvatar\s+String\?/);
  assert.match(schema, /takerAvatar\s+String\?/);
  assert.match(schema, /authorAvatar\s+String\?/);
  assert.match(schema, /sellerAvatar\s+String\?/);
  assert.match(schema, /buyerAvatar\s+String\?/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd ../intelligent-community-admin && npx tsx --test test/user-profile-snapshots.spec.ts
```

Expected: FAIL，指出 `publisherAvatar` 等字段尚不存在。

- [ ] **Step 3: 修改 Prisma 模型并生成迁移**

在 `Task` 增加 `publisherAvatar`、`takerAvatar`；在 `ForumReply` 增加 `authorAvatar`、`replyToUserId`；在 `MallItem` 增加 `publisherName`、`publisherAvatar`；在 `MallItemComment` 增加 `authorName`、`authorAvatar`、`replyToUserId`；在 `MallOrder` 增加 `sellerName`、`sellerAvatar`、`buyerName`、`buyerAvatar`。

迁移使用可空字段，避免现有本地数据升级失败：

```sql
ALTER TABLE `Task` ADD COLUMN `publisherAvatar` VARCHAR(191) NULL;
ALTER TABLE `Task` ADD COLUMN `takerAvatar` VARCHAR(191) NULL;
ALTER TABLE `forum_replies` ADD COLUMN `authorAvatar` VARCHAR(191) NULL;
ALTER TABLE `forum_replies` ADD COLUMN `replyToUserId` VARCHAR(191) NULL;
ALTER TABLE `mall_items` ADD COLUMN `publisherName` VARCHAR(191) NULL;
ALTER TABLE `mall_items` ADD COLUMN `publisherAvatar` VARCHAR(191) NULL;
ALTER TABLE `mall_item_comments` ADD COLUMN `authorName` VARCHAR(191) NULL;
ALTER TABLE `mall_item_comments` ADD COLUMN `authorAvatar` VARCHAR(191) NULL;
ALTER TABLE `mall_item_comments` ADD COLUMN `replyToUserId` VARCHAR(191) NULL;
ALTER TABLE `mall_orders` ADD COLUMN `sellerName` VARCHAR(191) NULL;
ALTER TABLE `mall_orders` ADD COLUMN `sellerAvatar` VARCHAR(191) NULL;
ALTER TABLE `mall_orders` ADD COLUMN `buyerName` VARCHAR(191) NULL;
ALTER TABLE `mall_orders` ADD COLUMN `buyerAvatar` VARCHAR(191) NULL;
```

实际表名以 Prisma 生成 SQL 为准；运行前用 `prisma migrate diff` 校验，不手写猜测后的表名直接部署。

- [ ] **Step 4: 建立默认头像常量**

Create `utils/defaultAvatar.js`：

```js
export const DEFAULT_AVATAR = '/static/avatar1.png';

export function withDefaultAvatar(value) {
  return String(value || '').trim() || DEFAULT_AVATAR;
}
```

后端新建同职责常量（建议 `src/modules/user/default-avatar.ts`）：

```ts
export const DEFAULT_AVATAR_URL = '/static/avatar1.png';
export const avatarOrDefault = (value: unknown) => String(value || '').trim() || DEFAULT_AVATAR_URL;
```

部署前确认后端返回的默认值是小程序可访问的绝对媒体 URL；若本地静态路径不能由 API 域名访问，则将默认头像上传到正式媒体域并在环境配置中设置 `DEFAULT_AVATAR_URL`。

- [ ] **Step 5: 运行 Prisma 和快照测试**

Run:

```bash
cd ../intelligent-community-admin
npx prisma format
npx prisma generate
npx tsx --test test/user-profile-snapshots.spec.ts
npm run build
```

Expected: 测试 PASS，Prisma 生成和 TypeScript 构建退出码为 0。

## Task 3: 在资料更新事务中同步所有历史展示信息

- [ ] **Step 1: 扩展失败测试**

在 `test/user-profile-snapshots.spec.ts` 增加源码级保护，确保同步覆盖 retained modules：

```ts
test('updateMe updates every retained author snapshot', async () => {
  const source = await readFile(new URL('../src/modules/user/user.service.ts', import.meta.url), 'utf8');
  for (const model of ['task', 'forumPost', 'forumReply', 'mallItem', 'mallItemComment', 'mallOrder']) {
    assert.match(source, new RegExp(`tx\\.${model}\\.(updateMany|findMany)`));
  }
});
```

- [ ] **Step 2: 运行并确认测试失败**

Run:

```bash
cd ../intelligent-community-admin && npx tsx --test test/user-profile-snapshots.spec.ts
```

Expected: FAIL，指出 task/mall/order 等同步分支缺失。

- [ ] **Step 3: 完成事务内同步**

在 `UserService.updateMe()` 中生成统一更新值：

```ts
const displayName = updated.name ?? '';
const displayAvatar = updated.avatar ?? '';
```

在同一个 `prisma.$transaction()` 内：

- `Task.publisherId` 匹配时更新 `publisherName/publisherAvatar/publisherIdentity`；
- `Task.takerId` 匹配时更新 `takerName/takerAvatar`；
- `ForumPost.authorId` 更新 `authorName/authorAvatar/authorIdentity`；
- `ForumReply.authorId` 更新 `authorName/authorAvatar/authorIdentity`；
- `ForumReply.replyToAuthorName` 和 `MallItemComment.replyToAuthorName` 通过本批新增的 `replyToUserId` 精确更新，禁止按旧昵称全文替换；
- `MallItem.publisherId` 更新 `publisherName/publisherAvatar`；
- `MallItemComment.userId` 更新 `authorName/authorAvatar`；
- `MallOrder.sellerId` 和 `buyerId` 分别更新卖家、买家快照。

内容身份标签字段和 `adminLabel` 不进入名称/头像更新对象。

- [ ] **Step 4: 发布和序列化时写入快照并兜底**

修改 task/forum/mall 创建逻辑，从用户表读取名称、头像、身份并写入快照。所有列表和详情序列化通过 `avatarOrDefault()` 返回头像。禁止让前端提交的 `authorName` 覆盖服务端用户资料。

- [ ] **Step 5: 清理缓存并运行测试**

资料更新成功后清理任务、论坛和市场相关列表/详情缓存。Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/user-profile-snapshots.spec.ts test/user-identity.spec.ts
npm run lint
npm run build
```

Expected: 全部测试 PASS，lint/build 退出码为 0。

- [ ] **Step 6: 提交检查点（仅在用户明确授权提交后）**

```bash
git add prisma src test
git commit -m "fix(profile): sync names and avatars across historical content"
```

## Task 4: 在业主互助展示头像并建立前端兜底

- [ ] **Step 1: 增加失败的生产回归守卫**

在 `test/production-regressions.js` 读取 `pages/task/index.wxml`、`packageTask/detail/index.wxml` 和 `utils/defaultAvatar.js`，断言：

```js
assert.match(taskListWxml, /publisherAvatar/);
assert.match(taskDetailWxml, /publisherAvatar/);
assert.match(defaultAvatarSource, /static\\/avatar1\\.png/);
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
node test/production-regressions.js
```

Expected: FAIL，业主互助 WXML 尚无头像绑定。

- [ ] **Step 3: 规范化任务数据**

`pages/task/index.js` 和 `packageTask/detail/index.js` 使用：

```js
import { withDefaultAvatar } from '~/utils/defaultAvatar';

publisherAvatar: withDefaultAvatar(task.publisherAvatar),
```

列表发布者区用 TDesign avatar 或现有 `<image>` 样式展示；详情页同样展示。头像、用户名、身份标签必须在窄屏下保持可收缩，感谢金不被挤出。

- [ ] **Step 4: 运行回归和 lint**

Run:

```bash
node test/production-regressions.js
npm run lint
```

Expected: 回归守卫 PASS，lint 退出码为 0。

## Task 5: 用统一 TDesign 授权弹框替代跳转“我的”

- [ ] **Step 1: 写失败的权限回归守卫**

在 `test/production-regressions.js` 增加：

```js
assert.doesNotMatch(authIdentity, /wx\\.switchTab\\(\\{ url: '\\/pages\\/my\\/index' \\}\\)/);
assert.match(authIdentity, /requestAuthorizedLogin/);
assert.match(authDialogWxml, /open-type="getPhoneNumber"/);
assert.match(authDialogWxml, /取消/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node test/production-regressions.js`

Expected: FAIL，现有 `ensureLoggedIn()` 仍跳转“我的”。

- [ ] **Step 3: 创建授权组件**

组件对外只暴露 `open()`，并触发 `authorized`、`cancel`：

```js
Component({
  data: { visible: false, submitting: false },
  methods: {
    open() {
      if (!this.data.visible) this.setData({ visible: true });
    },
    close() {
      this.setData({ visible: false, submitting: false });
    },
    onCancel() {
      this.close();
      this.triggerEvent('cancel');
    },
  },
});
```

WXML 使用 TDesign dialog 外观；手机号授权必须由真实 `<button open-type="getPhoneNumber">` 触发，不能用 `wx.showModal` 冒充授权按钮。

- [ ] **Step 4: 改造 `authIdentity.js`**

将登录缺失从页面跳转改为请求当前页面组件：

```js
export async function ensureLoggedIn(page = getCurrentPages().at(-1)) {
  if (hasLoginToken() && hasPhoneAuthorizedLogin() && (await ensureServerUser())) return true;
  clearStaleLogin();
  page?.selectComponent?.('#auth-login-dialog')?.open();
  return false;
}
```

所有调用 `ensureMutationReady()` 的页面传入或可定位该组件。授权成功只刷新登录态并关闭弹框，不保存原操作回调，不自动继续业务动作。

- [ ] **Step 5: 在受保护页面挂载统一组件**

在任务、论坛、市场、意见反馈、个人操作等页面根节点挂载：

```xml
<auth-login-dialog id="auth-login-dialog" bind:authorized="onAuthorized" />
```

在相应 `.json` 注册组件。页面 `onAuthorized` 只刷新用户状态，不调用原操作函数。

- [ ] **Step 6: 验证**

Run:

```bash
node test/production-regressions.js
npm run lint
```

Manual:

1. 游客点击“领取任务”出现弹框；
2. 取消后停留原页；
3. 授权成功后任务仍未领取；
4. 再点一次才领取；
5. 连续点击只出现一个弹框。

## Task 6: 允许小区市场游客公开查询

- [ ] **Step 1: 写失败的路由测试**

Create `../intelligent-community-admin/test/mall-public-read.spec.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('mall public reads do not use mandatory jwtAuth', async () => {
  const source = await readFile(new URL('../src/routes/mall.routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /router\\.get\\('\\/api\\/items'\\s*,\\s*jwtAuth/);
  assert.doesNotMatch(source, /router\\.get\\('\\/api\\/items\\/:itemId'\\s*,\\s*jwtAuth/);
  assert.doesNotMatch(source, /router\\.get\\('\\/api\\/items\\/:itemId\\/comments'\\s*,\\s*jwtAuth/);
});
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
cd ../intelligent-community-admin && npx tsx --test test/mall-public-read.spec.ts
```

Expected: 至少详情或评论公开读取仍依赖 `jwtAuth`，测试 FAIL。

- [ ] **Step 3: 提取可选鉴权**

在 `jwt-auth.ts` 增加不返回 401 的解析函数：

```ts
export function optionalUserFromBearer(ctx: Koa.Context): AuthedUser | undefined {
  // 无头、过期、签名无效均返回 undefined；不得写响应。
}
```

列表、分类、详情、评论 GET 路由使用可选用户。服务签名改为 `userId?: string`；只有 `userId` 存在时查询收藏、点赞等个性化状态。

- [ ] **Step 4: 保持私有接口强制鉴权**

发布、收藏、评论、下单、个人商品、个人收藏、个人订单继续使用 `jwtAuth`。添加源码断言保护这些路由。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/mall-public-read.spec.ts test/mall-publish.spec.ts
npm run build
```

Manual: 无 Token、空 Token、失效 Token 分别查询分类、列表、详情和评论，均返回公开数据。

## Task 7: 修复“我的任务”页面栈

- [ ] **Step 1: 写失败的页面栈守卫**

在 `test/production-regressions.js` 断言 `onTabTap` 只调用 `setData/loadTasks`，且“我的”入口具备点击锁：

```js
assert.doesNotMatch(myTasksSource, /onTabTap[\\s\\S]*?wx\\.(navigateTo|redirectTo|reLaunch)/);
assert.match(myPageSource, /_openingService/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node test/production-regressions.js`

Expected: 点击锁断言 FAIL。

- [ ] **Step 3: 防止入口重复压栈**

`pages/my/index.js` 的服务跳转加同步锁：

```js
if (this._openingService) return;
this._openingService = true;
wx.navigateTo({
  url,
  complete: () => {
    setTimeout(() => { this._openingService = false; }, 300);
  },
});
```

保留 `packageTask/my-tasks/index.js` 的页签本地切换；禁止为 tab 切换调用任何导航 API。

- [ ] **Step 4: 验证**

Manual: 从“我的”进入“我的任务”，来回切换各页签至少 10 次，系统返回一次必须回到“我的”。

Run: `node test/production-regressions.js`

Expected: PASS。

## Task 8: 全栈删除小区跑腿

- [ ] **Step 1: 写失败的残留扫描测试**

Create `../intelligent-community-admin/test/errand-removal.spec.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('api and schema contain no errand module', async () => {
  const [schema, routes] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(schema, /model Errand|enum ErrandStatus/);
  assert.doesNotMatch(routes, /api\\/errands|ErrandService/);
});
```

小程序 `test/production-regressions.js` 增加 `app.json`、`api/cloud.js`、tab 配置无 `errand/packageErrand/pages/errand` 的断言。

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
node test/production-regressions.js
cd ../intelligent-community-admin && npx tsx --test test/errand-removal.spec.ts
```

Expected: 两组测试均 FAIL。

- [ ] **Step 3: 删除小程序跑腿**

删除 `pages/errand/**`、`packageErrand/**`；从 `app.json`、`api/cloud.js`、`moduleEntryGuard.js`、`listRefresh.js`、`cloudMedia.js`、底栏和“我的”服务列表移除跑腿。

- [ ] **Step 4: 删除后端跑腿**

删除专用模块和路由；从 admin service、admin routes、上传模块、设置默认 tab、Redis cache 和 OpenAPI 中移除跑腿分支。用户统计不再返回 `errands`。

- [ ] **Step 5: 删除后台跑腿类型**

从 `ContentType`、上传模块联合类型、内容编辑表单和路由守卫中移除 `errands`。不保留不可达的跑腿编辑模板。

- [ ] **Step 6: 创建删除表迁移**

迁移按外键顺序执行：

```sql
DROP TABLE `ErrandFavorite`;
DROP TABLE `ErrandLike`;
DROP TABLE `ErrandReply`;
DROP TABLE `Errand`;
```

实际表名以 `prisma migrate diff` 输出为准。迁移只删除跑腿专用表，不触碰用户、上传、通知或任务表。

- [ ] **Step 7: 全量残留扫描和构建**

Run:

```bash
rg -n "errand|跑腿|packageErrand|pages/errand" . -g '!node_modules/**' -g '!docs/superpowers/**'
rg -n "errand|跑腿" ../intelligent-community-admin/src ../intelligent-community-admin/prisma
rg -n "errand|跑腿" ../intelligent-community-admin-web/src
node test/production-regressions.js
cd ../intelligent-community-admin && npx tsx --test test/errand-removal.spec.ts && npm run build
cd ../intelligent-community-admin-web && npm run build
```

Expected: 三次残留扫描无业务代码匹配；测试和构建全部通过。

- [ ] **Step 8: 提交检查点（仅在明确授权后）**

三个仓库分别提交，禁止跨仓库混用：

```bash
git commit -m "refactor(mini): remove errand module"
git commit -m "refactor(api): remove errand module and tables"
git commit -m "refactor(admin-web): remove errand management remnants"
```

## Task 9: 更新文档并完成第一批验收

- [ ] **Step 1: 更新文档**

修改：

- `FEATURE_STATUS.md`
- `docs/发布前自测清单.md`
- `docs/后台管理.md`
- 后端 `README.md` 与 `src/swagger/openapi.ts`

明确头像同步、游客市场权限、统一授权弹框、一次返回和跑腿下线；从功能清单删除跑腿并纠正统计。

- [ ] **Step 2: 完整验证**

Run:

```bash
node test/production-regressions.js
npm run lint
cd ../intelligent-community-admin && npx tsx --test test/*.spec.ts && npm run lint && npm run build
cd ../intelligent-community-admin-web && npm run build
```

Expected: 所有命令退出码为 0。

- [ ] **Step 3: 数据库迁移演练**

在本地/测试专用数据库执行：

```bash
cd ../intelligent-community-admin
npx prisma migrate status
npx prisma migrate deploy
```

Expected: 两个新迁移成功应用，应用可启动，除跑腿表外其他表完整。

- [ ] **Step 4: 输出验收记录**

记录三个仓库分支、修改文件、测试结果、迁移结果和仍待用户授权的提交/合并/部署动作。不得从 `dev` 直接部署测试环境。
