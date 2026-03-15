// 云开发迁移说明

## 已完成的配置

### 1. 数据库集合 ✅
- tasks - 任务集合
- posts - 帖子集合
- replies - 回复集合
- items - 商品集合
- users - 用户集合
- notifications - 通知集合

### 2. 云函数 ✅
- task - 任务相关云函数
- forum - 论坛相关云函数
- mall - 商城相关云函数
- user - 用户相关云函数
- common - 通用功能云函数

### 3. 小程序端配置 ✅
- app.js - 已配置云开发初始化
- api/cloud.js - 云开发 API 调用工具

## 需要手动改造的页面

### 优先级1：核心功能页面

#### 1. 任务相关
- `pages/task/index.js` ✅ 已改造
- `packageTask/detail/index.js` - 需改造
- `packageTask/publish/index.js` - 需改造
- `packageTask/my-tasks/index.js` - 需改造

#### 2. 论坛相关
- `pages/forum/index.js` - 需改造
- `packageForum/post/index.js` - 需改造
- `packageForum/publish/index.js` - 需改造
- `packageForum/my-posts/index.js` - 需改造

#### 3. 商城相关
- `pages/mall/index.js` - 需改造
- `packageMall/detail/index.js` - 需改造
- `packageMall/publish/index.js` - 需改造
- `packageMall/my-list/index.js` - 需改造

#### 4. 用户相关
- `pages/my/index.js` - 需改造
- `pages/my/info-edit/index.js` - 需改造
- `packageCommon/notice/index.js` - 需改造
- `packageCommon/feedback/index.js` - 需改造

## 改造模式

所有页面都需要按照以下模式改造：

### 1. 导入云开发 API
```javascript
const app = getApp();
import { taskAPI } from '~/api/cloud';
```

### 2. 条件判断使用不同 API
```javascript
async loadList() {
  this.setData({ loading: true });

  try {
    let res;
    if (app.globalData.useCloudBase) {
      // 使用云开发 API
      res = await taskAPI.getTaskList();
    } else {
      // 使用 Mock 数据
      res = await getTaskList();
    }

    if (res.code === 200) {
      this.setData({ list: res.data || [], loading: false });
    }
  } catch (err) {
    console.error('加载失败', err);
    this.setData({ loading: false });
  }
}
```

### 3. 错误处理
- 添加 try-catch 捕获错误
- 在控制台输出错误信息
- 更新加载状态

## API 对照表

### 任务 API
| Mock API | 云开发 API | 说明 |
|----------|-----------|------|
| getTaskList() | taskAPI.getTaskList() | 获取待领取任务列表 |
| getTaskDetail(id) | taskAPI.getTaskDetail(id) | 获取任务详情 |
| publishTask(data) | taskAPI.publishTask(data) | 发布任务 |
| claimTask(id, name) | taskAPI.claimTask(id, name) | 领取任务 |
| submitComplete(id, text, images) | taskAPI.submitComplete(id, text, images) | 提交完成 |
| confirmComplete(id) | taskAPI.confirmComplete(id) | 确认完成 |
| cancelTask(id) | taskAPI.cancelTask(id) | 取消任务 |
| getMyPublished() | taskAPI.getMyTasks('published') | 获取我发布的 |
| getMyTaken() | taskAPI.getMyTasks('taken') | 获取我领取的 |

### 论坛 API
| Mock API | 云开发 API | 说明 |
|----------|-----------|------|
| getPostList() | forumAPI.getPosts() | 获取帖子列表 |
| getPostDetail(id) | forumAPI.getPostDetail(id) | 获取帖子详情 |
| publishPost(data) | forumAPI.publishPost(data) | 发布帖子 |
| publishReply(id, data) | forumAPI.publishReply(id, data) | 发布回复 |
| getMyPosts() | forumAPI.getMyPosts() | 获取我的帖子 |

### 商城 API
| Mock API | 云开发 API | 说明 |
|----------|-----------|------|
| getItemList(categoryId) | mallAPI.getItems(categoryId) | 获取商品列表 |
| getItemDetail(id) | mallAPI.getItemDetail(id) | 获取商品详情 |
| publishItem(data) | mallAPI.publishItem(data) | 发布商品 |
| getMyItems() | mallAPI.getMyItems() | 获取我的商品 |

### 用户 API
| Mock API | 云开发 API | 说明 |
|----------|-----------|------|
| getPersonalInfo() | userAPI.getUserInfo() | 获取用户信息 |
| updateUserInfo(data) | userAPI.updateUserInfo(data) | 更新用户信息 |

### 通用 API
| Mock API | 云开发 API | 说明 |
|----------|-----------|------|
| - | commonAPI.getNotifications() | 获取通知列表 |
| - | commonAPI.submitFeedback(data) | 提交反馈 |

## 注意事项

### 1. 数据字段差异
云开发返回的数据和 Mock 数据可能有细微差异：
- 时间格式：云开发使用 ISO 8601 格式
- ID 字段：云开发使用 `_id` 而不是 `id`
- 需要根据实际情况调整

### 2. 权限控制
云开发环境下，用户操作会自动带上 openid：
- 发布者 ID 自动设置为当前用户 openid
- 接单人 ID 自动设置为当前用户 openid
- 查询"我的"数据会自动过滤当前用户数据

### 3. 图片上传
当前云函数代码预留了图片上传接口，实际使用时需要：
- 使用 `wx.cloud.uploadFile()` 上传图片
- 将上传后的 fileID 传递给云函数

## 测试步骤

1. 修改 app.js 中的 `USE_CLOUDBASE = true`
2. 重新编译小程序
3. 测试各个功能模块
4. 验证数据是否正确保存到云数据库
5. 测试不同用户的数据隔离

## 回退方案

如果需要回退到 Mock 数据：
1. 修改 app.js 中的 `USE_CLOUDBASE = false`
2. 重新编译小程序
3. 继续使用 Mock 数据

## 后续优化

1. **图片上传**: 实现完整的图片上传功能
2. **数据缓存**: 添加本地缓存机制
3. **错误处理**: 完善错误提示和重试机制
4. **性能优化**: 优化云函数调用频率
5. **安全规则**: 配置数据库安全规则
