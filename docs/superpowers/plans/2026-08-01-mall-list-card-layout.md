# 小区市场紧凑列表卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小区市场公共列表卡片调整为紧凑、对齐稳定的 TDesign 横向信息卡。

**Architecture:** 保持现有 WXML 数据与点击行为不变，只通过页面 LESS 建立固定主图和等高正文区，并用顶部标题、底部元信息形成两层布局。使用静态样式契约测试防止尺寸、行数和对齐规则回退。

**Tech Stack:** 微信小程序 WXML/LESS、TDesign MiniProgram、Node.js `node:test`

---

### Task 1: 锁定并实现卡片布局

**Files:**
- Modify: `test/mall-owner-actions-ui.test.js`
- Modify: `pages/mall/index.less`
- Modify: `docs/superpowers/specs/2026-08-01-list-state-and-market-owner-actions-design.md`

- [x] **Step 1: Write the failing test**

在现有市场 UI 测试中断言：主图为 `152rpx`、正文与主图等高且为纵向弹性布局、标题最多两行、元信息位于底部。

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/mall-owner-actions-ui.test.js`
Expected: FAIL，缺少紧凑卡片布局规则。

- [x] **Step 3: Write minimal implementation**

只修改 `pages/mall/index.less`：统一图片尺寸、正文高度和布局，标题使用两行截断，价格与时间在底部同行对齐。

- [x] **Step 4: Run verification**

Run: `node --test test/mall-owner-actions-ui.test.js`
Expected: PASS。

Run: `npx eslint pages/mall/index.js test/mall-owner-actions-ui.test.js --no-eslintrc -c ./.eslintrc.js`
Expected: 0 errors。

- [x] **Step 5: Inspect the diff**

Run: `git diff --check && git diff -- pages/mall/index.less test/mall-owner-actions-ui.test.js docs/superpowers/specs/2026-08-01-list-state-and-market-owner-actions-design.md`
Expected: 无空白错误，且没有新增字段或业务逻辑。
