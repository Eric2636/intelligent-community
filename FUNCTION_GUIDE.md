# 智能社区小程序功能说明

## 项目概述
智能社区小程序是一个基于 TDesign 组件库开发的社区生活服务平台，为居民提供任务发布、论坛交流、二手商城等综合服务。

## 技术栈
- **UI 框架**: TDesign 小程序组件库
- **开发语言**: JavaScript + WXML + WXSS
- **数据管理**: Mock 数据模拟
- **最小基础库版本**: 2.6.5

## 功能模块

### 1. 任务中心
#### 主页面 (`pages/task/index`)
- 展示待领取的任务列表
- 支持下拉刷新
- 悬浮按钮发布新任务

#### 任务详情 (`packageTask/detail/index`)
- 查看任务完整信息
- 领取任务（非发布者）
- 提交完成证明（接单人）
- 确认任务完成（发布者）
- 取消任务（发布者）

#### 发布任务 (`packageTask/publish/index`)
- 输入任务标题（必填）
- 填写任务说明
- 设置佣金金额（必填）
- 指定任务地点

#### 我的任务 (`packageTask/my-tasks/index`)
- Tab 切换查看：我发布的 / 我领取的
- 查看不同状态的任务
- 点击跳转到详情页操作

### 2. 社区论坛
#### 主页面 (`pages/forum/index`)
- 置顶帖子展示
- 最新帖子列表
- 支持下拉刷新
- 悬浮按钮发帖

#### 帖子详情 (`packageForum/post/index`)
- 查看帖子内容和回复
- 发表回复评论
- 实时显示回复数量

#### 发布帖子 (`packageForum/publish/index`)
- 输入帖子标题（必填）
- 填写帖子内容（必填）

#### 我的帖子 (`packageForum/my-posts/index`)
- 查看个人发布的所有帖子
- 支持下拉刷新
- 点击跳转到详情页

### 3. 二手商城
#### 主页面 (`pages/mall/index`)
- 分类标签筛选（全部/日用品/二手闲置/求购）
- 商品列表展示
- 悬浮按钮发布商品

#### 商品详情 (`packageMall/detail/index`)
- 查看商品完整信息
- 联系发布者功能

#### 发布商品 (`packageMall/publish/index`)
- 选择商品分类
- 输入商品标题（必填）
- 设置价格和单位
- 填写商品描述
- 留下联系方式

#### 我的商品 (`packageMall/my-list/index`)
- 网格展示个人发布的商品
- 支持下拉刷新
- 点击跳转到详情页

### 4. 个人中心
#### 主页面 (`pages/my/index`)
- 用户头像和信息展示
- 未登录状态显示登录入口
- 功能菜单入口
- 所有功能统一入口

#### 个人信息编辑 (`pages/my/info-edit/index`)
- 编辑用户名
- 选择性别
- 设置生日
- 选择地址
- 填写个人简介
- 上传相片墙

#### 登录页面 (`pages/login/login`)
- 微信授权登录
- 用户协议确认

#### 设置中心 (`pages/setting/index`)
- 通用设置（占位）
- 通知设置（占位）
- 深色模式（占位）
- 字体大小（占位）
- 播放设置（占位）
- 账号安全（占位）
- 隐私设置（占位）

### 5. 公共功能
#### 消息通知 (`packageCommon/notice/index`)
- 系统通知
- 任务通知
- 商城通知
- 按类型分类显示

#### 意见反馈 (`packageCommon/feedback/index`)
- 选择反馈类型（功能建议/问题反馈/其他）
- 填写反馈内容（必填）
- 留下联系方式（必填）

#### 关于我们 (`packageCommon/about/index`)
- 应用信息展示
- 版本号显示
- 核心功能介绍
- 联系方式（电话/邮箱）

## 页面路由结构

### 主包页面
- `pages/task/index` - 任务中心首页
- `pages/forum/index` - 论坛首页
- `pages/mall/index` - 商城首页
- `pages/my/index` - 个人中心首页

### 分包页面
#### 登录相关
- `pages/login/login` - 微信授权登录

#### 其他页面
- `pages/my/info-edit/index` - 个人信息编辑
- `pages/setting/index` - 设置中心

#### 任务分包
- `packageTask/detail/index` - 任务详情
- `packageTask/publish/index` - 发布任务
- `packageTask/my-tasks/index` - 我的任务

#### 论坛分包
- `packageForum/post/index` - 帖子详情
- `packageForum/publish/index` - 发布帖子
- `packageForum/my-posts/index` - 我的帖子

#### 商城分包
- `packageMall/detail/index` - 商品详情
- `packageMall/publish/index` - 发布商品
- `packageMall/my-list/index` - 我的商品

#### 公共分包
- `packageCommon/notice/index` - 消息通知
- `packageCommon/feedback/index` - 意见反馈
- `packageCommon/about/index` - 关于我们

## Mock 数据说明

### 用户身份
- 当前 Mock 用户 ID: `user1`
- 登录后存储 token 到本地 `access_token`

### 任务状态
- `pending_take` - 待领取
- `in_progress` - 进行中
- `pending_confirm` - 待确认
- `completed` - 已完成
- `cancelled` - 已取消

### 商城分类
- `all` - 全部
- `daily` - 日用品
- `second` - 二手闲置
- `wanted` - 求购

## 开发注意事项

1. **文件操作**
   - 禁止修改 `project.config.json`
   - 禁止修改编译参数
   - 禁止修改 appid

2. **代码规范**
   - 默认使用 JavaScript 编写逻辑
   - 使用 WXML 模板引擎
   - 保持代码风格一致

3. **数据管理**
   - 使用 Mock 数据模拟后端
   - 不直接访问后端接口
   - 使用本地存储进行数据持久化

4. **UI 组件**
   - 使用 TDesign 组件库
   - 自定义 TabBar 在 `custom-tab-bar` 目录
   - 遵循 TDesign 设计规范

## 使用说明

### 安装依赖
```bash
npm install
```

### 开发预览
1. 打开微信开发者工具
2. 导入项目根目录
3. 构建 npm 包
4. 预览效果

### 编译检查
- 确保所有页面都正确配置在 `app.json` 中
- 检查分包配置是否正确
- 确保组件引用路径正确

## 功能特点

1. **完整的任务流程**
   - 发布 → 领取 → 完成 → 确认
   - 状态流转清晰
   - 权限控制完善

2. **活跃的社区论坛**
   - 置顶公告
   - 实时回复
   - 我的帖子管理

3. **便民的二手商城**
   - 分类筛选
   - 发布闲置
   - 联系便捷

4. **完善的用户体系**
   - 多种登录方式
   - 个人信息管理
   - 消息通知

5. **友好的交互体验**
   - 下拉刷新
   - 加载状态
   - 操作反馈

## 后续优化建议

1. **功能优化**
   - 添加图片上传功能
   - 实现搜索功能
   - 添加收藏功能
   - 实现消息推送

2. **性能优化**
   - 图片懒加载
   - 列表分页加载
   - 缓存优化

3. **用户体验**
   - 添加引导页
   - 完善空状态
   - 优化加载动画

4. **数据持久化**
   - 接入真实后端 API
   - 使用云数据库
   - 实现数据同步
