# 第三批：消息通知中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立论坛、业主互助、小区市场和系统通知的可靠站内消息闭环，支持未读、跳转、全部已读和 iOS 微信风格左滑软删除。

**Architecture:** 通知记录按接收人存储，通过唯一 `dedupeKey` 去重；业务状态与通知在同一 Prisma 事务中写入。小程序消息页只消费统一通知 API，业务跳转由 `bizType/bizId` 映射；系统通知由超级管理员发布并为启用用户生成接收记录。

**Tech Stack:** Prisma/MySQL、Koa/TypeScript、微信小程序、TDesign SwipeCell、Vue 3/Ant Design Vue。

---

## Task 1: 建立通知数据模型和领域服务

**Files:**

- Modify: `../intelligent-community-admin/prisma/schema.prisma`
- Create: `../intelligent-community-admin/prisma/migrations/20260726130000_add_notification_center/migration.sql`
- Create: `../intelligent-community-admin/src/modules/notification/notification.dto.ts`
- Create: `../intelligent-community-admin/src/modules/notification/notification.service.ts`
- Create: `../intelligent-community-admin/test/notification.service.spec.ts`

- [ ] **Step 1: 写失败的通知模型测试**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('notification schema supports dedupe, unread and soft delete', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model Notification/);
  assert.match(schema, /dedupeKey\\s+String\\s+@unique/);
  assert.match(schema, /readAt\\s+DateTime\\?/);
  assert.match(schema, /deletedAt\\s+DateTime\\?/);
});
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/notification.service.spec.ts
```

Expected: FAIL，`Notification` 模型不存在。

- [ ] **Step 3: 增加 Prisma 模型和迁移**

```prisma
model Notification {
  id          String    @id @default(cuid())
  recipientId String
  actorId     String?
  type        String    @db.VarChar(48)
  bizType     String    @db.VarChar(32)
  bizId       String?   @db.VarChar(191)
  title       String    @db.VarChar(191)
  content     String    @db.Text
  dedupeKey   String    @unique @db.VarChar(255)
  readAt      DateTime?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([recipientId, deletedAt, createdAt])
  @@index([recipientId, readAt, deletedAt])
  @@index([bizType, bizId])
  @@map("notifications")
}
```

- [ ] **Step 4: 实现事务友好的领域服务**

服务接收 `Prisma.TransactionClient`，禁止内部重新打开事务：

```ts
export type NotifyInput = {
  recipientId: string;
  actorId?: string;
  type: string;
  bizType: 'forum' | 'task' | 'mall' | 'system';
  bizId?: string;
  title: string;
  content: string;
  dedupeKey: string;
};

export async function notify(tx: Prisma.TransactionClient, input: NotifyInput) {
  if (input.actorId && input.actorId === input.recipientId) return null;
  return tx.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: input,
    update: {},
  });
}
```

列表服务只查询 `deletedAt: null`；未读数同时要求 `readAt: null`、`deletedAt: null`。

- [ ] **Step 5: 添加行为测试**

测试覆盖：

- actor 和 recipient 相同时不写入；
- 相同 dedupeKey 只得到一条；
- markRead 幂等；
- markAllRead 只更新当前用户；
- softDelete 只更新当前用户自己的通知；
- 未读数不包含已删除记录。

- [ ] **Step 6: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx prisma format
npx prisma generate
npx tsx --test test/notification.service.spec.ts
npm run build
```

Expected: PASS，构建成功。

## Task 2: 提供用户通知 API

**Files:**

- Create: `../intelligent-community-admin/src/modules/notification/notification.routes.ts`
- Modify: `../intelligent-community-admin/src/routes/index.ts`
- Modify: `../intelligent-community-admin/src/swagger/openapi.ts`
- Create: `../intelligent-community-admin/test/notification.routes.spec.ts`

- [ ] **Step 1: 写失败路由测试**

断言以下路由全部使用 `jwtAuth`：

```ts
const expected = [
  "router.get('/api/notifications'",
  "router.get('/api/notifications/unread-count'",
  "router.patch('/api/notifications/:id/read'",
  "router.patch('/api/notifications/read-all'",
  "router.delete('/api/notifications/:id'",
];
for (const route of expected) assert.match(source, new RegExp(route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/notification.routes.spec.ts`

Expected: FAIL，通知 API 尚未注册。

- [ ] **Step 3: 实现路由**

响应约定：

```ts
GET /api/notifications?page=1&pageSize=20
// { code: 200, data: { list, total, page, pageSize } }

GET /api/notifications/unread-count
// { code: 200, data: { count } }

PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
DELETE /api/notifications/:id
// { code: 200, data: {} }
```

单条读取和删除使用 `where: { id, recipientId: userId }`；找不到返回 404，不允许操作他人通知。

- [ ] **Step 4: 文档化通知类型**

OpenAPI 明确 `type`、`bizType`、`bizId`、`readAt`、`createdAt`，并列出 `forum/task/mall/system` 跳转类型。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/notification.routes.spec.ts test/notification.service.spec.ts
npm run lint
npm run build
```

Expected: PASS。

## Task 3: 接入论坛通知

**Files:**

- Modify: `../intelligent-community-admin/src/modules/forum/forum.service.ts`
- Create: `../intelligent-community-admin/test/forum-notification.spec.ts`

- [ ] **Step 1: 写失败测试**

测试场景：

1. B 回复 A 的帖子，A 收到 `FORUM_POST_REPLY`；
2. C 回复 B 的评论，B 收到 `FORUM_REPLY_REPLY`；
3. A 回复自己的帖子，不生成通知；
4. 同一次 replyId 重试不重复。

去重键固定为：

```ts
`forum:reply:${reply.id}:recipient:${recipientId}`
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/forum-notification.spec.ts`

Expected: FAIL，没有通知写入。

- [ ] **Step 3: 将回复和通知放入同一事务**

创建回复后：

- 有 `parentReplyId` 时接收人是父回复作者；
- 否则接收人是帖子作者；
- actorId 是当前回复用户；
- bizType 为 `forum`，bizId 为 postId；
- 内容摘要截取 trim 后前 80 字，不复制图片或视频。

- [ ] **Step 4: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/forum-notification.spec.ts
npm run build
```

Expected: PASS。

## Task 4: 接入业主互助状态通知

**Files:**

- Modify: `../intelligent-community-admin/src/modules/task/task.service.ts`
- Modify: `../intelligent-community-admin/src/routes/index.ts`
- Modify: `../intelligent-community-admin/src/swagger/openapi.ts`
- Modify: `api/cloud.js`
- Modify: `packageTask/detail/index.{js,wxml,less}`
- Create: `../intelligent-community-admin/test/task-notification.spec.ts`

- [ ] **Step 1: 写状态矩阵测试**

| 操作 | 接收人 | 类型 |
|---|---|---|
| 领取 | 发布者 | `TASK_CLAIMED` |
| 放弃 | 发布者 | `TASK_ABANDONED` |
| 提交完成 | 发布者 | `TASK_SUBMITTED` |
| 确认完成 | 领取者 | `TASK_CONFIRMED` |
| 驳回 | 领取者 | `TASK_REJECTED` |
| 发布者取消 | 领取者（存在时） | `TASK_CANCELLED` |

每个测试同时断言业务状态和通知都成功；模拟通知写入失败时两者都回滚。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/task-notification.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 重构为事务内通知**

每个状态方法使用同一个 `prisma.$transaction(async tx => ...)`。去重键格式：

```ts
`task:${taskId}:${eventType}:${statusVersionOrTimestamp}:recipient:${recipientId}`
```

在本批通知迁移中为 `Task` 增加 `version Int @default(0)` 并在每次状态变化递增；禁止仅用状态名造成同一任务二次领取后通知被错误去重。

- [ ] **Step 4: 补齐驳回完成操作**

增加：

```text
POST /api/tasks/:taskId/reject-complete
```

仅发布者可在 `PENDING_CONFIRM` 状态操作；状态回到 `IN_PROGRESS`，保留上次凭证供双方查看，领取者可修改后重新提交。小程序待确认区使用 TDesign 次要危险按钮“驳回”，点击确认弹框后调用接口；成功后刷新详情。该事务生成 `TASK_REJECTED` 通知给领取者。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/task-notification.spec.ts test/task-reward.spec.ts
npm run build
```

Expected: PASS。

## Task 5: 接入小区市场订单通知

**Files:**

- Modify: `../intelligent-community-admin/src/modules/mall/mall-order.service.ts`
- Create: `../intelligent-community-admin/test/mall-notification.spec.ts`

- [ ] **Step 1: 写失败测试**

覆盖：

- 买家下单通知卖家；
- 买家取消通知卖家；
- 卖家改变订单状态通知买家；
- 操作人不收到自己的通知；
- 相同订单版本不重复通知。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/mall-notification.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 在订单事务中创建通知**

通知 bizType 为 `mall`，bizId 为 orderId；标题使用商品标题，内容只描述状态变化。为 `MallOrder` 增加 `version Int @default(0)`，去重键包含 version。

- [ ] **Step 4: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/mall-notification.spec.ts
npm run build
```

Expected: PASS。

## Task 6: 增加超级管理员系统通知发布

**Files:**

- Create: `../intelligent-community-admin/src/modules/notification/admin-notification.routes.ts`
- Modify: `../intelligent-community-admin/src/routes/admin.routes.ts`
- Create: `../intelligent-community-admin/test/admin-notification.spec.ts`
- Create: `../intelligent-community-admin-web/src/views/SystemNoticesView.vue`
- Modify: `../intelligent-community-admin-web/src/router/index.ts`
- Modify: `../intelligent-community-admin-web/src/App.vue`
- Modify: `../intelligent-community-admin-web/src/api/admin.ts`
- Modify: `../intelligent-community-admin-web/src/types/api.ts`

- [ ] **Step 1: 写权限失败测试**

断言普通管理员 POST `/api/admin/system-notices` 返回 403，超级管理员可发布，空标题或空内容返回 400。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/admin-notification.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现发布**

DTO：

```ts
{ title: string; content: string }
```

服务分批读取启用用户，每批 500 人，用 `createMany({ skipDuplicates: true })` 生成 `SYSTEM_NOTICE`。dedupeKey 包含一次发布生成的 noticeId 和 recipientId。接口返回 `{ noticeId, recipientCount }`，后台操作日志记录发布者、标题和接收数量。

- [ ] **Step 4: 建立后台页面**

仅超级管理员菜单显示“系统通知”。页面使用 Ant Design Vue 表单输入标题、内容，展示预计接收范围，提交时二次确认并防重复提交。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin && npx tsx --test test/admin-notification.spec.ts && npm run build
cd ../intelligent-community-admin-web && npm run build
```

Expected: PASS。

## Task 7: 完成小程序消息中心和未读角标

**Files:**

- Modify: `api/cloud.js`
- Modify: `packageCommon/notice/index.{js,json,wxml,less}`
- Modify: `pages/my/index.{js,wxml}`
- Modify: `custom-tab-bar/index.js`
- Create: `utils/notificationRoute.js`
- Create: `test/notification-ui.spec.ts`

- [ ] **Step 1: 写失败的 UI 守卫**

断言通知页注册 `t-swipe-cell`，存在 `markAllRead`、`deleteNotification`、`getUnreadCount`，并使用 `deletedAt` 软删除 API。

- [ ] **Step 2: 运行并确认失败**

Run: `npx tsx --test test/notification-ui.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 扩展 API**

`commonAPI` 增加：

```js
getNotifications({ page, pageSize })
getNotificationUnreadCount()
markNotificationRead(id)
markAllNotificationsRead()
deleteNotification(id)
```

- [ ] **Step 4: 实现业务跳转映射**

`notificationRoute.js`：

```js
export function notificationUrl(row) {
  if (row.bizType === 'forum' && row.bizId) return `/packageForum/post/index?id=${encodeURIComponent(row.bizId)}`;
  if (row.bizType === 'task' && row.bizId) return `/packageTask/detail/index?id=${encodeURIComponent(row.bizId)}`;
  if (row.bizType === 'mall' && row.bizId) return `/packageMall/order-detail/index?id=${encodeURIComponent(row.bizId)}`;
  return '';
}
```

无 URL 或目标 404 时提示“内容已不存在”，不删除通知。

- [ ] **Step 5: 实现 TDesign SwipeCell**

每行左滑显示红色删除按钮；删除成功后从本地列表移除并刷新未读数。点击消息先幂等标记已读，再跳转。顶部提供“一键全部已读”。

- [ ] **Step 6: 同步角标**

“我的”页 `onShow` 和应用回前台时请求未读数；读取、全部已读、删除后通过 eventBus 通知“我的”和自定义 tab bar 更新。所有计算使用服务端 count，不在多个页面自行累加。

- [ ] **Step 7: 验证**

Manual:

1. 新通知显示未读；
2. 点击后角标减少且跳转正确；
3. 目标已删除时提示；
4. 一键全部已读清零；
5. 左滑显示红色删除；
6. 删除未读消息后角标同步减少；
7. 重复读取/删除不出现负数。

Run:

```bash
node --import tsx --test test/notification-ui.spec.ts
node test/production-regressions.js
# 全仓 ESLint 按历史基线做结构化指纹比较，要求新增指纹为 0；
# 命令与结果记录在 docs/superpowers/baselines/2026-07-26-phase-3-acceptance.md
```

Expected: PASS。

## Task 8: 文档、全量验证与检查点

- [ ] **Step 1: 更新文档**

更新 `FEATURE_STATUS.md`、`docs/发布前自测清单.md`、后端 OpenAPI 和后台说明；新增 `docs/消息通知事件清单.md`，逐项列出事件、接收人、去重键和跳转目标。

- [ ] **Step 2: 完整验证**

Run:

```bash
node --test test/*.test.js
node --import tsx --test test/*.spec.ts
node test/production-regressions.js
cd ../intelligent-community-admin
node --import tsx --test test/*.spec.ts
npm run lint
npm run build
tmpdir=$(mktemp -d)
cp prisma/schema.prisma "$tmpdir/schema.prisma"
npx prisma format --schema "$tmpdir/schema.prisma"
cmp -s prisma/schema.prisma "$tmpdir/schema.prisma"
npx prisma validate
npx prisma generate
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
npm run build
```

Expected: 测试、API lint/build/Prisma 检查和后台构建全部退出码为 0；小程序全仓 ESLint 允许历史存量，但结构化基线比较必须新增指纹为 0。

- [ ] **Step 3: 迁移演练**

本任务不执行数据库迁移。先使用 from-empty 静态迁移演练确认迁移链可生成，再由获授权人员在已备份的专用开发/测试数据库运行 `npx prisma migrate deploy`，验证通知索引、唯一键和任务/订单 version 字段。

- [ ] **Step 4: 提交检查点（仅在明确授权后）**

```bash
git commit -m "feat(mini): activate notification center"
git commit -m "feat(api): add transactional business notifications"
git commit -m "feat(admin-web): add system notice publishing"
```
