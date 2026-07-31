# 小区市场新增权限与统一授权弹框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 为小区市场新增商品入口补齐公共授权弹框挂载，并将公共授权组件恢复为原有的居中 TDesign 风格卡片。

**Architecture:** 小区市场页面复用既有 ensureMutationReady(this)，并挂载全局 auth-login-dialog；不新增页面级登录状态。公共 auth-login-dialog 继续负责手机号授权及授权事件，恢复居中卡片与纵向按钮；已有页面无需改挂载代码即可同步生效。

**Tech Stack:** 微信小程序原生组件、TDesign Miniprogram、Less、Node.js assert/VM 回归测试。

---

### Task 1: 为小区市场新增入口写失败测试

**Files:**
- Modify: test/auth-login-dialog.test.js
- Modify: pages/mall/index.js lines 1-12 and 291-293

- [x] **Step 1: 写入失败用例**

~~~js
const mallPageSource = await source('pages/mall/index.js');
assert.match(
  mallPageSource,
  /async goPublish\(\)\s*\{\s*if \(!\(await ensureMutationReady\(this\)\)\) return;/,
  '小区市场新增商品入口必须在导航前进行统一权限校验',
);
~~~

- [x] **Step 2: 运行测试确认失败**

Run: node test/auth-login-dialog.test.js

Expected: FAIL，提示小区市场新增商品入口必须在导航前进行统一权限校验。

- [x] **Step 3: 最小实现**

~~~js
import { ensureMutationReady } from '~/utils/authIdentity';

async goPublish() {
  if (!(await ensureMutationReady(this))) return;
  wx.navigateTo({ url: mallPublishUrl() });
},
~~~

- [x] **Step 4: 运行测试确认通过**

Run: node test/auth-login-dialog.test.js

Expected: PASS，且游客点击只触发公共授权流程；登录完成后再次点击才进入发布页。

- [x] **Step 5: 不提交**

保留本地改动；当前用户未授权 commit、push、merge 或部署。

### Task 2: 为统一居中授权卡片写失败测试

**Files:**
- Modify: test/auth-login-dialog.test.js
- Modify: components/auth-login-dialog/index.wxml
- Modify: components/auth-login-dialog/index.less

- [x] **Step 1: 写入失败用例**

~~~js
assert.match(dialogTemplate, /<t-popup\b[^>]*placement="center"/, '授权弹框必须居中显示');
assert.doesNotMatch(dialogTemplate, /class="auth-dialog__header"/, '授权弹框不应保留底部面板标题栏');
assert.match(dialogStyles, /\.auth-dialog\s*\{[\s\S]*?width:\s*620rpx/, '授权弹框必须恢复居中卡片宽度');
assert.match(dialogStyles, /\.auth-dialog__authorize\s*\{[\s\S]*?#0052d9/, '授权按钮必须使用 TDesign 蓝色');
assert.match(dialogStyles, /\.auth-dialog__cancel\s*\{[\s\S]*?margin-top:\s*20rpx/, '取消按钮必须纵向排列');
~~~

- [x] **Step 2: 运行测试确认失败**

Run: node test/auth-login-dialog.test.js

Expected: FAIL，提示当前 `placement="bottom"` 不符合居中卡片约定。

- [x] **Step 3: 最小实现**

~~~xml
<t-popup visible="{{visible}}" placement="center" close-on-overlay-click="{{false}}">
  <view class="auth-dialog" aria-role="dialog" aria-label="授权登录对话框" aria-labelledby="auth-login-dialog-title">
    <view id="auth-login-dialog-title" class="auth-dialog__title">授权登录</view>
    <view class="auth-dialog__desc">授权手机号后即可使用完整社区功能</view>
    <button class="auth-dialog__authorize" open-type="getPhoneNumber" bindgetphonenumber="onGetPhoneNumber" loading="{{submitting}}" disabled="{{submitting}}">授权登录</button>
    <button class="auth-dialog__cancel" bindtap="onCancel" disabled="{{submitting}}">取消</button>
  </view>
</t-popup>
~~~

在 Less 中恢复居中卡片宽度、纵向按钮与 #0052d9 授权按钮；保留 getPhoneNumber、提交禁用及无障碍属性。

- [x] **Step 4: 运行测试确认通过**

Run: node test/auth-login-dialog.test.js

Expected: PASS，现有取消、单飞、授权失败重试、授权成功不重放操作和组件卸载测试仍全部通过。

- [x] **Step 5: 不提交**

保留本地改动；当前用户未授权 commit、push、merge 或部署。

### Task 3: 补齐市场公共弹框并回归验证

**Files:**
- Test: test/auth-login-dialog.test.js
- Test: test/production-regressions.js

- [x] **Step 1: 运行针对性测试**

Run: node test/auth-login-dialog.test.js

Expected: 输出 auth login dialog guards passed。

- [x] **Step 2: 运行回归守卫**

Run: node test/production-regressions.js

Expected: 输出 production regression guards passed。

- [x] **Step 3: 检查 lint 与空白**

Run: npx eslint pages/mall/index.js components/auth-login-dialog/index.js test/auth-login-dialog.test.js --no-eslintrc -c ./.eslintrc.js

Run: git diff --check

Expected: 两条命令退出码均为 0。

- [ ] **Step 4: 人工验收**

在微信开发者工具验证：游客点击市场新增与其他受限操作一致地弹出居中授权卡片；取消不跳转；授权成功后仍停留当前页；再次点击新增才进入发布页；授权按钮为 TDesign 蓝色，两个按钮纵向排列。

- [x] **Step 5: 不提交**

报告修改文件和验证结果，等待用户明确要求后才 commit、push、merge 或部署。
