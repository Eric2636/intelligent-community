# 第四批：全接口日志与接口管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为小程序和后台全部接口建立可配置、可筛选、可脱敏、保留 90 天的访问日志，并提供仅超级管理员可用的接口管理和日志页面。

**Architecture:** Koa 最外层中间件统一采集请求结果，路由标准化后查询接口配置；普通日志由开关控制，500 级异常无条件写入独立错误表。接口注册表以 method + routePattern 唯一，新接口默认开启；后台通过专用超级管理员 API 查询、配置和导出。

**Tech Stack:** Koa、TypeScript、Prisma/MySQL、Vue 3、Ant Design Vue、Node test runner。

---

## Task 1: 建立接口注册、访问日志和错误日志模型

**Files:**

- Modify: `../intelligent-community-admin/prisma/schema.prisma`
- Create: `../intelligent-community-admin/prisma/migrations/20260726160000_add_api_access_logging/migration.sql`
- Create: `../intelligent-community-admin/test/api-log-schema.spec.ts`

- [ ] **Step 1: 写失败模型测试**

```ts
test('api logging schema has registry, access and error models', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model ApiEndpoint/);
  assert.match(schema, /@@unique\\(\\[method, routePattern\\]\\)/);
  assert.match(schema, /model ApiAccessLog/);
  assert.match(schema, /model ApiErrorLog/);
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/api-log-schema.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 添加模型**

```prisma
model ApiEndpoint {
  id           String   @id @default(cuid())
  source       String   @db.VarChar(24)
  method       String   @db.VarChar(16)
  routePattern String   @db.VarChar(512)
  description  String?  @db.VarChar(500)
  logEnabled   Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt

  @@unique([method, routePattern])
  @@index([source, logEnabled])
  @@map("api_endpoints")
}

model ApiAccessLog {
  id           BigInt   @id @default(autoincrement())
  endpointId   String?
  source       String   @db.VarChar(24)
  method       String   @db.VarChar(16)
  routePattern String   @db.VarChar(512)
  path         String   @db.VarChar(1024)
  ip           String?  @db.VarChar(64)
  userId       String?
  adminId      String?
  httpStatus   Int
  businessCode Int?
  durationMs   Int
  createdAt    DateTime @default(now())

  @@index([createdAt])
  @@index([ip, createdAt])
  @@index([endpointId, createdAt])
  @@index([httpStatus, createdAt])
  @@index([source, createdAt])
  @@map("api_access_logs")
}

model ApiErrorLog {
  id           BigInt   @id @default(autoincrement())
  endpointId   String?
  source       String   @db.VarChar(24)
  method       String   @db.VarChar(16)
  routePattern String   @db.VarChar(512)
  path         String   @db.VarChar(1024)
  ip           String?  @db.VarChar(64)
  userId       String?
  adminId      String?
  httpStatus   Int
  errorCode    String?  @db.VarChar(96)
  errorSummary String   @db.Text
  durationMs   Int
  createdAt    DateTime @default(now())

  @@index([createdAt])
  @@index([ip, createdAt])
  @@index([endpointId, createdAt])
  @@index([httpStatus, createdAt])
  @@map("api_error_logs")
}
```

- [ ] **Step 4: 验证模型**

Run:

```bash
cd ../intelligent-community-admin
npx prisma format
npx prisma generate
npx tsx --test test/api-log-schema.spec.ts
npm run build
```

Expected: PASS。

## Task 2: 自动注册接口并默认开启

**Files:**

- Create: `../intelligent-community-admin/src/modules/api-log/api-endpoint.service.ts`
- Modify: `../intelligent-community-admin/src/routes/index.ts`
- Create: `../intelligent-community-admin/test/api-endpoint.service.spec.ts`

- [ ] **Step 1: 写失败测试**

测试：

- `GET /api/tasks/:taskId` 多个实际编号只注册一项；
- 新项 `logEnabled === true`；
- 已存在项的管理员 description/logEnabled 不被启动同步覆盖；
- source 按 `/api/admin/` 判定为 `ADMIN`，其他业务接口为 `MINI`。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/api-endpoint.service.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 从 Router stack 同步注册表**

创建路由完成后读取 `router.stack` 的 methods/path，过滤无方法层，执行：

```ts
await prisma.apiEndpoint.upsert({
  where: { method_routePattern: { method, routePattern } },
  create: { method, routePattern, source, logEnabled: true },
  update: { source },
});
```

不得在 update 中写 description 或 logEnabled。

- [ ] **Step 4: 缓存开关**

服务提供 30 秒内存缓存 `Map<method:path, endpoint>`；管理员修改开关后主动失效对应项。数据库不可用时默认开启记录，并把配置读取错误输出到服务器错误通道。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/api-endpoint.service.spec.ts
npm run build
```

Expected: PASS。

## Task 3: 实现统一访问日志中间件和脱敏

**Files:**

- Create: `../intelligent-community-admin/src/middleware/api-access-log.ts`
- Create: `../intelligent-community-admin/src/modules/api-log/api-log-redaction.ts`
- Modify: `../intelligent-community-admin/src/main.ts`
- Modify: `../intelligent-community-admin/src/middleware/jwt-auth.ts`
- Modify: `../intelligent-community-admin/src/middleware/admin-auth.ts`
- Create: `../intelligent-community-admin/test/api-access-log.spec.ts`
- Create: `../intelligent-community-admin/test/api-log-redaction.spec.ts`

- [ ] **Step 1: 写脱敏失败测试**

```ts
assert.equal(redactPath('/api/x?phone=13800138000&token=abc'), '/api/x?phone=138****8000&token=%5BREDACTED%5D');
assert.equal(safeErrorSummary(new Error('password=secret failed')).includes('secret'), false);
```

敏感键至少包括 `password`、`token`、`authorization`、`cookie`、`code`、`phoneCode`、`refreshToken`。

- [ ] **Step 2: 写中间件失败测试**

覆盖 200、400、500、接口开关关闭、日志数据库写入失败五种情况：

- 200/400 且开启：写 ApiAccessLog；
- 200/400 且关闭：不写普通日志；
- 500 且关闭：仍写 ApiErrorLog；
- 日志写入失败：原接口状态和 body 不改变。

- [ ] **Step 3: 运行并确认失败**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/api-log-redaction.spec.ts test/api-access-log.spec.ts
```

Expected: FAIL。

- [ ] **Step 4: 实现最外层中间件**

核心结构：

```ts
export async function apiAccessLog(ctx: Koa.Context, next: Koa.Next) {
  const started = performance.now();
  let thrown: unknown;
  try {
    await next();
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    const durationMs = Math.max(0, Math.round(performance.now() - started));
    await safelyPersistRequestLog(ctx, durationMs, thrown);
  }
}
```

中间件必须位于 error handler 可观察最终响应的位置。若现有 error handler 捕获异常后不再抛出，则从 `ctx.state.handledError` 读取脱敏摘要。

- [ ] **Step 5: 标准路由和身份**

使用 `ctx._matchedRoute` 或 router 提供的 matched path，找不到时使用固定 `UNMATCHED`，不得用正则猜数字替换。`jwtAuth/adminAuth` 成功后分别设置 `ctx.state.user.userId`、`ctx.state.admin.id`，中间件只读取编号。

- [ ] **Step 6: 真实 IP 配置**

只在明确配置 `TRUST_PROXY=true` 时信任代理头；否则使用 socket IP。对 `X-Forwarded-For` 只取可信代理链解析后的客户端项，不直接相信任意首值。

- [ ] **Step 7: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/api-log-redaction.spec.ts test/api-access-log.spec.ts
npm run lint
npm run build
```

Expected: PASS。

## Task 4: 提供超级管理员接口管理和日志查询 API

**Files:**

- Create: `../intelligent-community-admin/src/modules/api-log/api-log.dto.ts`
- Create: `../intelligent-community-admin/src/modules/api-log/api-log.service.ts`
- Create: `../intelligent-community-admin/src/modules/api-log/api-log.routes.ts`
- Modify: `../intelligent-community-admin/src/routes/admin.routes.ts`
- Modify: `../intelligent-community-admin/src/swagger/openapi.ts`
- Create: `../intelligent-community-admin/test/api-log.routes.spec.ts`

- [ ] **Step 1: 写权限和筛选失败测试**

断言普通管理员全部 403；超级管理员支持：

```text
GET   /api/admin/api-endpoints
PATCH /api/admin/api-endpoints/:id
GET   /api/admin/api-access-logs
GET   /api/admin/api-error-logs
GET   /api/admin/api-access-logs/export
```

筛选覆盖 IP、endpointId、method、source、httpStatus、statusClass、startAt、endAt、actorId、minDurationMs、maxDurationMs。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/api-log.routes.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现接口管理**

PATCH DTO：

```ts
{ description?: string; logEnabled?: boolean }
```

更新前后值写入 `AdminSystemLog`，action 分别为 `API_ENDPOINT_DESCRIPTION_UPDATE`、`API_ENDPOINT_LOGGING_UPDATE`。

- [ ] **Step 4: 实现筛选**

时间统一接收 ISO 8601；`statusClass=2xx/4xx/5xx` 转为闭区间；actorId 同时匹配 userId/adminId。所有 page/pageSize 设上限 100。

Prisma `BigInt` 日志编号在 API 层统一转换为十进制字符串，禁止直接交给 JSON 序列化：

```ts
const serializeLog = <T extends { id: bigint }>(row: T) => ({ ...row, id: row.id.toString() });
```

- [ ] **Step 5: 实现 CSV 导出**

导出使用和列表完全相同的筛选构造器，最多 50,000 行，UTF-8 BOM；字段只包含时间、来源、方法、标准路由、脱敏路径、IP、操作者编号、状态、耗时。禁止导出 error stack、Token 或请求体。

- [ ] **Step 6: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/api-log.routes.spec.ts
npm run build
```

Expected: PASS。

## Task 5: 实现后台接口管理和日志页面

**Files:**

- Create: `../intelligent-community-admin-web/src/views/ApiEndpointsView.vue`
- Create: `../intelligent-community-admin-web/src/views/ApiAccessLogsView.vue`
- Create: `../intelligent-community-admin-web/src/views/ApiErrorLogsView.vue`
- Modify: `../intelligent-community-admin-web/src/router/index.ts`
- Modify: `../intelligent-community-admin-web/src/App.vue`
- Modify: `../intelligent-community-admin-web/src/api/admin.ts`
- Modify: `../intelligent-community-admin-web/src/types/api.ts`
- Create: `../intelligent-community-admin-web/test/api-log-pages.spec.ts`

- [ ] **Step 1: 写失败 UI 守卫**

断言三个路由均 `superAdminOnly`，接口页有 description 编辑和 switch，日志页包含 IP、状态、时间范围筛选及 Enter 查询。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin-web && npx tsx --test test/api-log-pages.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 建立接口管理页**

表格列：来源、方法、标准路径、描述、日志开关、更新时间。描述使用 modal 编辑；开关变更二次确认，失败时恢复原值。新接口默认显示开启。

- [ ] **Step 4: 建立访问日志页**

筛选区：IP、接口、方法、来源、状态码/状态类别、调用时间范围、用户/管理员、耗时。输入框支持 Enter；查询时页码回 1。表格默认调用时间倒序，提供“导出当前筛选结果”。

- [ ] **Step 5: 建立错误日志页**

默认仅 5xx；详情 modal 展示脱敏错误摘要、路由、状态和耗时，不展示完整堆栈、请求头或请求体。

- [ ] **Step 6: 权限与菜单**

三个菜单和路由仅超级管理员可见；普通管理员直接访问被 router guard 重定向，后端仍必须返回 403。

- [ ] **Step 7: 验证**

Run:

```bash
cd ../intelligent-community-admin-web
npx tsx --test test/api-log-pages.spec.ts
npm run build
```

Expected: PASS。

## Task 6: 实现 90 天分批清理

**Files:**

- Create: `../intelligent-community-admin/src/modules/api-log/api-log-retention.service.ts`
- Create: `../intelligent-community-admin/scripts/cleanup-api-logs.ts`
- Modify: `../intelligent-community-admin/package.json`
- Create: `../intelligent-community-admin/test/api-log-retention.spec.ts`
- Modify: `docker-project/docker-compose.yml` 或当前部署使用的定时任务配置

- [ ] **Step 1: 写失败的保留测试**

使用固定当前时间，断言只删除 `createdAt < now - 90 days`，边界当天不删；每批最多 5,000 行；ApiEndpoint 和 AdminSystemLog 不删除。

- [ ] **Step 2: 运行并确认失败**

Run: `cd ../intelligent-community-admin && npx tsx --test test/api-log-retention.spec.ts`

Expected: FAIL。

- [ ] **Step 3: 实现分批清理**

先查 5,000 个过期 id，再 `deleteMany({ id: { in: ids } })`，循环到无数据；访问日志和错误日志分别处理。每批提交，避免长事务。

- [ ] **Step 4: 增加脚本**

`package.json`：

```json
"logs:cleanup": "tsx scripts/cleanup-api-logs.ts"
```

脚本成功输出删除数量和耗时；失败退出码非 0。部署定时任务每日低峰期执行一次，并将结果写入运维日志。

- [ ] **Step 5: 验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/api-log-retention.spec.ts
npm run build
```

Expected: PASS。

## Task 7: 性能、故障与安全验收

- [ ] **Step 1: 生成覆盖样本**

在本地/测试环境请求：

- 小程序 GET/POST 成功；
- 小程序 400/401/500；
- 后台 GET/POST 成功；
- 后台 403/500；
- 上传接口；
- 不存在的 404 路径。

- [ ] **Step 2: 验证开关**

关闭一个 GET 接口后，200/400 不再产生普通访问日志；制造 500 后仍产生错误日志。重新开启后普通日志恢复。

- [ ] **Step 3: 验证脱敏**

用测试密码、Token、手机号授权 code 和手机号调用测试接口；数据库、后台详情和 CSV 中不得出现原文。

- [ ] **Step 4: 验证性能**

对日志开启和关闭分别执行同一组 500 次请求，记录 P50/P95。若同步写入导致明显延迟，使用受控异步队列批量写入，但必须在进程退出时 flush，并保留 500 错误同步兜底；不得静默丢日志。

- [ ] **Step 5: 验证故障隔离**

临时让日志表写入失败，业务接口仍返回原结果，服务器输出明确 `[api-log] persist failed` 告警。

## Task 8: 文档与最终验证

- [ ] **Step 1: 更新文档**

新增 `../intelligent-community-admin/docs/接口访问日志说明.md`，包含字段、脱敏、权限、开关、500 兜底、90 天清理、可信代理配置和导出限制。同步更新 OpenAPI、后台说明、功能清单和发布前自测清单。

- [ ] **Step 2: 完整验证**

Run:

```bash
cd ../intelligent-community-admin
npx tsx --test test/*.spec.ts
npm run lint
npm run build
cd ../intelligent-community-admin-web
npx tsx --test test/api-log-pages.spec.ts
npm run build
```

Expected: 全部退出码为 0。

- [ ] **Step 3: 迁移与清理演练**

在本地/测试专用数据库运行迁移，插入 89/90/91 天样本，执行 `npm run logs:cleanup`。Expected: 只删除超过 90 天记录。

- [ ] **Step 4: 提交检查点（仅在明确授权后）**

```bash
git commit -m "feat(api): add configurable access logging"
git commit -m "feat(admin-web): add endpoint and API log management"
```
