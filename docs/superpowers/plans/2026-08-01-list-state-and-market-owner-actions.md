# 小程序列表状态与市场自主管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 列表从详情返回时保留浏览现场，并让发布者安全地编辑、公开/隐藏和软删除自己的市场信息。

**Architecture:** 后端在现有 MallItemService 增加所有权校验后的三个写操作；小程序使用 EventChannel 返回结构化变更，由来源列表原位更新或移除记录。已有刷新标记只作为无法直接回传时的兜底，不再驱动详情返回后的全量刷新。

**Tech Stack:** 微信小程序、TDesign Miniprogram、RxJS、Koa、TypeScript、Prisma、Node test runner。

---

### Task 1: 市场所有者写接口

**Files:**
- Modify: `../intelligent-community-admin/src/modules/mall/mall.dto.ts`
- Modify: `../intelligent-community-admin/src/modules/mall/mall-item.service.ts`
- Modify: `../intelligent-community-admin/src/modules/mall/mall.service.ts`
- Modify: `../intelligent-community-admin/src/routes/mall.routes.ts`
- Modify: `../intelligent-community-admin/src/swagger/openapi.ts`
- Create: `../intelligent-community-admin/test/mall-owner-actions.spec.ts`

- [ ] **Step 1: 写失败测试**

覆盖发布者可编辑、他人 403、隐藏后公共查询不可见、发布者仍可查看、删除写入 `deletedAt`、缓存失效和路由必须使用 JWT 用户身份。

- [ ] **Step 2: 验证测试因缺少实现而失败**

Run: `npm test -- --test-name-pattern="mall owner"`

- [ ] **Step 3: 实现 DTO、服务和路由**

新增 `UpdateMallItemDto`、`PatchMallItemVisibilityDto`，以及：

```ts
updateItem(params: { userId: string; itemId: string; dto: UpdateMallItemDto })
setItemVisibility(params: { userId: string; itemId: string; visibility: 'ONLINE' | 'OFFLINE' })
deleteItem(params: { userId: string; itemId: string })
```

每个方法先查询未删除记录，再比较 `publisherId`，成功后失效列表和详情缓存。

- [ ] **Step 4: 运行专项测试、全量测试、构建和 lint**

Run: `npm test && npm run build && npm run lint`

### Task 2: 通用列表局部变更协议

**Files:**
- Create: `utils/listMutation.js`
- Create: `test/list-detail-return-state.test.js`
- Modify: `utils/listRefresh.js`
- Modify: `pages/task/index.js`
- Modify: `pages/forum/index.js`
- Modify: `pages/mall/index.js`

- [ ] **Step 1: 写失败测试**

验证 `upsert/remove/patch` 对列表的纯函数行为、未知 ID 不破坏列表、无变更不刷新，以及任务和互助 `onShow` 不再无条件加载第一页。

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `node --test test/list-detail-return-state.test.js`

- [ ] **Step 3: 实现纯函数和列表接收器**

```js
export function applyListMutation(list, mutation) {
  if (mutation.type === 'remove') return list.filter((item) => String(item.id || item._id) !== mutation.id);
  // patch/upsert 返回新数组，仅替换目标项
}
```

列表进入详情时注册 EventChannel，收到变更后仅更新当前数组；任务和互助 `onShow` 仅在确有兜底刷新标记时处理，不默认重载。

- [ ] **Step 4: 验证分页追加和筛选状态**

运行现有 `list-pagination-stability.test.js`、新增专项测试，并静态检查搜索词、分类、排序和页码未被返回流程重置。

### Task 3: 小区市场编辑和所有者菜单

**Files:**
- Modify: `api/cloud.js`
- Modify: `utils/mallPaths.js`
- Modify: `packageMall/publish/index.js`
- Modify: `packageMall/publish/index.wxml`
- Modify: `packageMall/publish/index.json`
- Modify: `packageMall/detail/index.js`
- Modify: `packageMall/detail/index.wxml`
- Modify: `packageMall/detail/index.less`
- Modify: `packageMall/detail/index.json`
- Modify: `packageMall/my-list/index.js`
- Modify: `packageMall/my-list/index.wxml`
- Modify: `packageMall/my-list/index.less`
- Create: `test/mall-owner-actions-ui.test.js`

- [ ] **Step 1: 写失败测试**

检查 API 方法、编辑模式回填与提交、仅 `isMine` 显示更多入口、公开/隐藏文案、删除确认和 EventChannel 回传。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/mall-owner-actions-ui.test.js`

- [ ] **Step 3: 接入编辑模式**

发布页通过 `itemId` 判断编辑模式，分类加载与详情加载完成后统一回填；提交时分别调用 `publishItem` 或 `updateItem`，提交失败保留表单。

- [ ] **Step 4: 接入 TDesign 操作菜单**

详情和“我发布的”仅对本人显示更多入口，菜单提供编辑、隐藏/公开、删除。状态切换与删除成功后向来源页发送 `upsert` 或 `remove`，危险操作明确二次确认。

- [ ] **Step 5: 运行专项测试和小程序回归测试**

Run: `node --test test/*.test.js test/*.spec.ts`

### Task 4: 市场公共列表卡片交互

**Files:**
- Modify: `pages/mall/index.wxml`
- Modify: `pages/mall/index.less`
- Modify: `pages/mall/index.js`
- Modify: `test/mall-public-read.test.js`

- [ ] **Step 1: 增加失败测试，要求不存在 `chevron-right`**
- [ ] **Step 2: 移除箭头和对应占位样式，保留整卡点击与按压态**
- [ ] **Step 3: 验证图片预览及子操作不触发卡片跳转**
- [ ] **Step 4: 运行市场、权限、分页和生产回归测试**

Run: `node --test test/mall-*.test.js test/list-*.test.js test/production-regressions.js`

### Task 5: 文档与整体验证

**Files:**
- Modify: `FEATURE_STATUS.md`
- Modify: `FUNCTION_GUIDE.md`
- Modify: `../intelligent-community-admin/README.md`
- Modify: `../intelligent-community-admin/src/swagger/openapi.ts`

- [ ] **Step 1: 更新功能清单、用户操作说明、接口权限和软删除语义**
- [ ] **Step 2: 运行后端全量测试、构建、lint**
- [ ] **Step 3: 运行小程序全部自动化测试和 eslint**
- [ ] **Step 4: 在微信开发者工具验证多页滚动返回、编辑、隐藏、公开、删除和越权失败**

