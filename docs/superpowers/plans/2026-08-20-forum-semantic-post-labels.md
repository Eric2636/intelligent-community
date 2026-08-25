# 社区帖子语义标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在社区首页、我的帖子、我的收藏和帖子详情中，显示独立的置顶状态和互斥的社区公告/活动报名类型标签。

**Architecture:** 公告是特殊帖子；`postType` 表示普通帖子/公告，`featureType` 的业务名称是“活动类型”，当前为内容/活动报名，未来仅扩展 `featureType`。现有 WXML 标题容器按字段条件渲染标签。

**Tech Stack:** 微信小程序 WXML、LESS、TDesign Mini Program、Node 内置测试。

---

### Task 1: 更新语义标签的静态契约测试

**Files:**
- Modify: `test/forum-functional-posts.spec.mjs`

- [ ] **Step 1: 将“仅显示置顶”的断言改为失败测试**

替换现有 `my posts shows only the pinned tag beside the title` 测试为：

```js
test('forum post titles use ordered semantic labels with distinct styles', () => {
  const myPosts = read('packageForum/my-posts/index.wxml');
  const detail = read('packageForum/post/index.wxml');
  const forum = read('pages/forum/index.wxml');
  const styles = [
    read('packageForum/my-posts/index.less'),
    read('packageForum/post/index.less'),
    read('pages/forum/index.less'),
  ].join('\n');
  for (const view of [myPosts, detail, forum]) {
    assert.match(view, /pinned/);
    assert.match(view, /postType === 'ANNOUNCEMENT'|item\.postType === 'ANNOUNCEMENT'/);
    assert.match(view, /featureType === 'REGISTRATION'|item\.featureType === 'REGISTRATION'/);
  }
  assert.match(styles, /post-label--pinned/);
  assert.match(styles, /post-label--announcement/);
  assert.match(styles, /post-label--registration/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/forum-functional-posts.spec.mjs`

Expected: 新测试因首页、详情页或标签样式尚未实现而失败。

### Task 2: 在“我的帖子”和“我的收藏”显示标签

**Files:**
- Modify: `packageForum/my-posts/index.wxml`
- Modify: `packageForum/my-posts/index.less`
- Modify: `packageForum/favorites/index.wxml`
- Modify: `packageForum/favorites/index.less`

- [ ] **Step 1: 在标题后按固定顺序加入标签**

在每个标题文字后的同一弹性容器中依次加入：

```xml
<text wx:if="{{item.pinned}}" class="post-label post-label--pinned">置顶</text>
<text wx:if="{{item.postType === 'ANNOUNCEMENT'}}" class="post-label post-label--announcement">社区公告</text>
<text wx:if="{{item.featureType === 'REGISTRATION'}}" class="post-label post-label--registration">活动报名</text>
```

- [ ] **Step 2: 添加标签样式**

在两个 LESS 文件中加入可复用的页面内样式，确保标签尺寸相同：

```less
.post-label { flex-shrink: 0; padding: 0 10rpx; border-radius: 4rpx; font-size: 20rpx; line-height: 32rpx; }
.post-label--pinned { color: #c53a25; background: #fff0ec; }
.post-label--announcement { color: #6d4fb3; background: #f1edff; }
.post-label--registration { color: #246fe5; background: #eaf2ff; }
```

将标题包装器设置为 `display:flex`、`flex-wrap:wrap`、`align-items:center` 和适当 `gap`，长标题仍可截断。

- [ ] **Step 3: 运行契约测试确认仍只因其他页面失败**

Run: `node --test test/forum-functional-posts.spec.mjs`

Expected: 我的帖子与收藏页面的标签结构通过；若仍失败，失败点仅为首页或详情页缺失的标签。

### Task 3: 在社区首页的置顶与最新列表显示标签

**Files:**
- Modify: `pages/forum/index.wxml`
- Modify: `pages/forum/index.less`

- [ ] **Step 1: 将三处帖子标题替换为可包含标签的容器**

对置顶列表、虚拟列表、普通列表中的每个标题，将单个 `text.post-item__title` 替换为：

```xml
<view class="post-item__title-row">
  <text class="post-item__title">{{item.title}}</text>
  <text wx:if="{{item.pinned}}" class="post-label post-label--pinned">置顶</text>
  <text wx:if="{{item.postType === 'ANNOUNCEMENT'}}" class="post-label post-label--announcement">社区公告</text>
  <text wx:if="{{item.featureType === 'REGISTRATION'}}" class="post-label post-label--registration">活动报名</text>
</view>
```

- [ ] **Step 2: 加入首页标签和标题行样式**

在 `pages/forum/index.less` 增加与 Task 2 同色值的 `.post-label` 三种修饰类；增加：

```less
.post-item__title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; margin-bottom: 10rpx; }
.post-item__title-row .post-item__title { margin-bottom: 0; min-width: 0; }
```

- [ ] **Step 3: 运行契约测试确认首页标签通过**

Run: `node --test test/forum-functional-posts.spec.mjs`

Expected: 首页相关断言通过；若失败，失败点仅为详情页缺失的标签。

### Task 4: 在帖子详情标题显示标签

**Files:**
- Modify: `packageForum/post/index.wxml`
- Modify: `packageForum/post/index.less`

- [ ] **Step 1: 把标题改为标题行并输出三个标签**

使用 `post-card__title-row` 包裹标题和标签：

```xml
<view class="post-card__title-row">
  <text class="post-card__title">{{post.title}}</text>
  <text wx:if="{{post.pinned}}" class="post-label post-label--pinned">置顶</text>
  <text wx:if="{{post.postType === 'ANNOUNCEMENT'}}" class="post-label post-label--announcement">社区公告</text>
  <text wx:if="{{post.featureType === 'REGISTRATION'}}" class="post-label post-label--registration">活动报名</text>
</view>
```

- [ ] **Step 2: 添加详情标题行与标签样式**

增加可换行 `.post-card__title-row`，保留原 `.post-card__title` 的字号、字重和行高，并将原来的底部间距移至标题行。添加与前两项任务一致的 `.post-label` 和三种颜色修饰类。

- [ ] **Step 3: 运行测试确认通过**

Run: `node --test test/forum-functional-posts.spec.mjs`

Expected: PASS，所有功能贴静态契约通过。

### Task 5: 回归验证和视觉检查

**Files:**
- Verify only: `packageForum/my-posts/*`, `packageForum/favorites/*`, `packageForum/post/*`, `pages/forum/*`, `test/forum-functional-posts.spec.mjs`

- [ ] **Step 1: 运行完整小程序相关回归**

Run: `node --test test/forum-functional-posts.spec.mjs test/mall-owner-actions-ui.test.js test/auth-login-dialog.test.js && npx eslint packageForum/post/index.js packageForum/my-posts/index.js && git diff --check`

Expected: 所有测试通过，ESLint 与 diff 检查退出码为 0。

- [ ] **Step 2: 在微信开发者工具中检查四个状态**

验证普通内容帖子不显示类型标签；置顶活动帖显示“置顶、活动报名”；公告显示“社区公告”；置顶公告显示“置顶、社区公告”。系统不得产生或展示“公告活动报名”组合。

- [ ] **Step 3: 保留为本地 dev 分支改动**

不提交、不推送、不上传小程序版本；向用户报告修改文件与验证结果。
