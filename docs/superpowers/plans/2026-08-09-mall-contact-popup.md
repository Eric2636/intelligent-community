# 小区市场联系方式弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小区市场商品详情的联系入口改成点击复制联系方式的底部弹窗。

**Architecture:** 商品详情页维护一个仅用于展示的 `contactPopupVisible` 状态。点击联系按钮只校验现有 `item.contact` 后打开弹窗；WXML 使用 TDesign popup 渲染展示层，复制按钮调用系统剪贴板能力。

**Tech Stack:** 微信小程序、JavaScript、WXML、Less、TDesign Mini Program、Node.js 内置测试。

---

### Task 1: 写出商品联系方式弹窗的失败测试

**Files:**
- Create: `test/mall-contact-popup.test.js`
- Modify: `packageMall/detail/index.wxml`
- Modify: `packageMall/detail/index.json`
- Modify: `packageMall/detail/index.js`

- [ ] **Step 1: 写失败测试**

```js
test('商品详情通过底部弹窗展示可手动复制的联系方式', () => {
  assert.match(wxml, /<t-popup[^>]*placement="bottom"/);
  assert.match(wxml, /bindtap="onCopyContact">复制联系方式<\/t-button>/);
  assert.doesNotMatch(wxml, /detail-card__contact/);
  assert.match(wxml, /<view class="detail-bar__row">\s*<t-button[^>]*bindtap="onContact"/);
  assert.match(js, /contactPopupVisible:\s*false/);
  assert.match(js, /contactPopupVisible:\s*true/);
  assert.match(js, /wx\.setClipboardData/);
  assert.doesNotMatch(js, /wx\.makePhoneCall/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/mall-contact-popup.test.js`

Expected: FAIL，因为弹窗、可选择文本和状态尚未实现，旧实现仍调用自动复制或拨号。

- [ ] **Step 3: 最小实现**

```js
onContact() {
  const contact = String((this.data.item && this.data.item.contact) || '').trim();
  if (!contact || contact === '保密') {
    wx.showToast({ title: '暂无商家联系方式', icon: 'none' });
    return;
  }
  this.setData({ contactPopupVisible: true });
}
```

在 `index.wxml` 添加 `t-popup`，以 `contactPopupVisible` 控制显示，展示 `item.contact` 并提供“复制联系方式”按钮；在 `index.json` 注册 popup 组件。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/mall-contact-popup.test.js`

Expected: PASS。

### Task 2: 验证页面改动不破坏现有市场详情页

**Files:**
- Test: `test/mall-contact-popup.test.js`
- Test: `test/mall-owner-actions-ui.test.js`
- Test: `test/default-avatar-ui.test.js`

- [ ] **Step 1: 执行相关回归测试**

Run: `node --test test/mall-contact-popup.test.js test/mall-owner-actions-ui.test.js test/default-avatar-ui.test.js`

Expected: PASS，确认联系人弹窗、商品管理底部操作和市场评论默认头像均正常。

- [ ] **Step 2: 检查工作区差异与格式**

Run: `git diff --check && git diff -- packageMall/detail/index.js packageMall/detail/index.wxml packageMall/detail/index.less packageMall/detail/index.json test/mall-contact-popup.test.js`

Expected: 无空白错误，且只包含小程序详情页、测试与本次设计文档。

### 2026-08-09 需求扩展：结构化多联系方式

**范围：** 后端 `MallItem` 新增 `wechatContact`、`phoneContact` 两个可空字段并保留旧 `contact` 兼容；小程序发布、编辑与详情页改为两项联系方式；后台管理系统同步改为两项输入和展示。

**实施顺序：**

1. 在 `intelligent-community-admin/test/mall-contacts.spec.ts` 写 DTO、序列化与历史兼容的失败测试。
2. 修改 `intelligent-community-admin` 的 Prisma schema、迁移、DTO、商品路由、服务和序列化，并执行后端测试与构建。
3. 修改 `intelligent-community` 的市场发布页与详情弹窗，并执行市场页回归测试。
4. 修改 `intelligent-community-admin-web/src/views/ContentView.vue` 与类型定义，执行后台管理系统构建。
5. 执行三个项目的格式检查与相关回归测试；本地数据库按迁移更新，不提交、不合并、不部署。
# 补充：手机号也是微信号

增加 `phoneIsWechat` 字段、迁移、发布与后台勾选项，以及详情单条展示与复制验证。
