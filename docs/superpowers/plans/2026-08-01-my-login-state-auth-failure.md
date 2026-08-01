# “我的”页面登录状态失效修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 防止失效 Token 和缓存用户资料让未登录用户显示为已登录。

**Architecture:** 保留页面现有的服务端资料刷新流程，但让资料请求把鉴权错误交给调用方处理。调用方只在 401/403 时清理完整登录状态，其他请求失败继续使用缓存资料。

**Tech Stack:** 微信小程序 JavaScript、Node.js `node:test`

---

### Task 1: 增加鉴权失效回归测试

**Files:**
- Modify: `test/my-profile-sync.test.js`

- [ ] 增加 401 场景，断言页面显示游客状态、Token 和授权标记被删除、全局用户资料清空。
- [ ] 运行 `node --test test/my-profile-sync.test.js`，确认新测试因现有错误处理逻辑而失败。

### Task 2: 最小修复登录状态判定

**Files:**
- Modify: `pages/my/index.js`

- [ ] 让 `getPersonalInfo()` 将请求错误交给 `refreshPersonalInfo()` 区分处理。
- [ ] 仅对 401/403 清理登录凭据、全局用户资料与未读状态，并切换为游客视图。
- [ ] 对非鉴权错误继续使用缓存资料。
- [ ] 运行 `node --test test/my-profile-sync.test.js`，确认回归测试通过。

### Task 3: 完整验证与发布分支合并

**Files:**
- Verify: `pages/my/index.js`
- Verify: `test/my-profile-sync.test.js`

- [ ] 运行全部 JavaScript 和 TypeScript 测试。
- [ ] 运行 `git diff --check`。
- [ ] 提交并推送 `dev`，合并到 `master`。
- [ ] 在 `master` 上重新运行完整测试并推送。
