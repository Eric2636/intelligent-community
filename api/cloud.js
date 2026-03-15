// 云开发 API 调用工具
import apiCache from '~/utils/apiCache';

const app = getApp();

/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {object} data - 传递给云函数的数据
 * @returns {Promise}
 */
function callCloudFunction(name, data) {
  console.log(`调用云函数 [${name}]，参数:`, data);

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        console.log(`云函数 [${name}] 调用成功，返回:`, res.result);
        resolve(res.result);
      },
      fail: (err) => {
        console.error(`云函数 [${name}] 调用失败:`, err);
        console.error('错误详情:', JSON.stringify(err));
        reject(err);
      },
    });
  });
}

/** 带缓存的云函数调用，TTL 秒内命中缓存则直接返回 */
function callCloudFunctionCached(name, data, ttlSeconds = 60) {
  const cached = apiCache.get(name, data);
  if (cached != null) return Promise.resolve(cached);
  return callCloudFunction(name, data).then((res) => {
    apiCache.set(name, data, res, ttlSeconds);
    return res;
  });
}

/**
 * 任务相关 API
 */
export const taskAPI = {
  // 获取待领取的任务列表（keyword 可选，60s 缓存）
  getTaskList(params = {}) {
    return callCloudFunctionCached('task', { action: 'getPendingTasks', ...params }, 60);
  },

  // 获取任务详情
  getTaskDetail(taskId) {
    return callCloudFunction('task', {
      action: 'getTaskDetail',
      taskId
    });
  },

  // 发布任务
  publishTask(data) {
    return callCloudFunction('task', {
      action: 'publishTask',
      ...data
    });
  },

  // 领取任务
  claimTask(taskId, takerName) {
    return callCloudFunction('task', {
      action: 'claimTask',
      taskId,
      takerName
    });
  },

  // 提交完成
  submitComplete(taskId, proofText, proofImages) {
    return callCloudFunction('task', {
      action: 'submitComplete',
      taskId,
      proofText,
      proofImages
    });
  },

  // 确认完成
  confirmComplete(taskId) {
    return callCloudFunction('task', {
      action: 'confirmComplete',
      taskId
    });
  },

  // 取消任务
  cancelTask(taskId) {
    return callCloudFunction('task', {
      action: 'cancelTask',
      taskId
    });
  },

  // 获取我的任务
  getMyTasks(type) {
    return callCloudFunction('task', {
      action: 'getMyTasks',
      type
    });
  },

  submitRating(data) {
    return callCloudFunction('task', { action: 'submitRating', ...data });
  },
  getMyRatings() {
    return callCloudFunction('task', { action: 'getMyRatings' });
  },
};

/**
 * 论坛相关 API
 */
export const forumAPI = {
  // 获取帖子列表（keyword, orderBy: time|hot, page, pageSize，60s 缓存）
  getPosts(params = {}) {
    return callCloudFunctionCached('forum', { action: 'getPosts', ...params }, 60);
  },

  // 获取帖子列表（别名，保持兼容性）
  getPostList(params = {}) {
    return this.getPosts(params);
  },

  // 获取帖子详情
  getPostDetail(postId) {
    if (!postId) {
      return Promise.reject(new Error('postId 不能为空'));
    }
    return callCloudFunction('forum', {
      action: 'getPostDetail',
      postId
    });
  },

  // 发布帖子
  publishPost(data) {
    const app = getApp();
    const authorName = app.globalData.userInfo?.nickName || '匿名用户';

    return callCloudFunction('forum', {
      action: 'publishPost',
      authorName,
      ...data
    });
  },

  // 发布回复
  publishReply(postId, data) {
    const app = getApp();
    const authorName = app.globalData.userInfo?.nickName || '匿名用户';

    return callCloudFunction('forum', {
      action: 'publishReply',
      postId,
      authorName,
      ...data
    });
  },

  // 获取我的帖子
  getMyPosts() {
    return callCloudFunction('forum', {
      action: 'getMyPosts'
    });
  },

  likePost(postId) {
    return callCloudFunction('forum', { action: 'likePost', postId });
  },
  unlikePost(postId) {
    return callCloudFunction('forum', { action: 'unlikePost', postId });
  },
  favoritePost(postId) {
    return callCloudFunction('forum', { action: 'favoritePost', postId });
  },
  unfavoritePost(postId) {
    return callCloudFunction('forum', { action: 'unfavoritePost', postId });
  },
  getMyFavoritePosts() {
    return callCloudFunction('forum', { action: 'getMyFavoritePosts' });
  },
};

/**
 * 商城相关 API
 */
export const mallAPI = {
  // 获取商品列表（可传 categoryId 或 { categoryId, keyword, orderBy }，60s 缓存）
  getItems(categoryIdOrParams = {}) {
    const params = typeof categoryIdOrParams === 'string' ? { categoryId: categoryIdOrParams } : categoryIdOrParams;
    return callCloudFunctionCached('mall', {
      action: 'getItems',
      categoryId: params.categoryId,
      keyword: params.keyword,
      orderBy: params.orderBy
    }, 60);
  },

  // 获取商品列表（别名，保持兼容性）
  getItemList(categoryId) {
    return this.getItems(categoryId);
  },

  // 获取商品详情
  getItemDetail(itemId) {
    return callCloudFunction('mall', {
      action: 'getItemDetail',
      itemId
    });
  },

  // 发布商品
  publishItem(data) {
    return callCloudFunction('mall', {
      action: 'publishItem',
      ...data
    });
  },

  // 获取我的商品
  getMyItems() {
    return callCloudFunction('mall', {
      action: 'getMyItems'
    });
  },

  favoriteItem(itemId) {
    return callCloudFunction('mall', { action: 'favoriteItem', itemId });
  },
  unfavoriteItem(itemId) {
    return callCloudFunction('mall', { action: 'unfavoriteItem', itemId });
  },
  getMyFavoriteItems() {
    return callCloudFunction('mall', { action: 'getMyFavoriteItems' });
  },

  // 创建订单（购买）
  createOrder(data) {
    return callCloudFunction('mall', {
      action: 'createOrder',
      ...data
    });
  },

  // 获取我的订单
  getMyOrders() {
    return callCloudFunction('mall', {
      action: 'getMyOrders'
    });
  },

  // 获取订单详情
  getOrderDetail(orderId) {
    return callCloudFunction('mall', {
      action: 'getOrderDetail',
      orderId
    });
  },

  // 更新订单状态（completed/cancelled）
  updateOrderStatus(orderId, status) {
    return callCloudFunction('mall', {
      action: 'updateOrderStatus',
      orderId,
      status
    });
  },

  // 获取分类列表
  getCategories() {
    // 返回硬编码的分类列表
    return Promise.resolve({
      code: 200,
      data: [
        { id: 'all', name: '全部' },
        { id: 'digital', name: '数码产品' },
        { id: 'books', name: '书籍资料' },
        { id: 'furniture', name: '家具家电' },
        { id: 'clothing', name: '衣物鞋帽' },
        { id: 'daily', name: '日用品' },
        { id: 'sports', name: '运动器材' },
        { id: 'other', name: '其他' },
      ]
    });
  },
};

/**
 * 用户相关 API
 */
export const userAPI = {
  // 登录
  login() {
    return callCloudFunction('user', {
      action: 'login'
    });
  },

  // 获取用户信息
  getUserInfo() {
    return callCloudFunction('user', {
      action: 'getUserInfo'
    });
  },

  // 更新用户信息
  updateUserInfo(data) {
    return callCloudFunction('user', {
      action: 'updateUserInfo',
      ...data
    });
  },
};

/**
 * 通用功能 API
 */
export const commonAPI = {
  // 获取通知列表
  getNotifications() {
    return callCloudFunction('common', {
      action: 'getNotifications'
    });
  },

  // 提交反馈
  submitFeedback(data) {
    return callCloudFunction('common', {
      action: 'submitFeedback',
      ...data
    });
  },

  // 发送订阅消息（供业务云函数或后台调用，需配置模板 ID）
  sendSubscribeMessage(data) {
    return callCloudFunction('common', {
      action: 'sendSubscribeMessage',
      ...data
    });
  },
};

export default {
  task: taskAPI,
  forum: forumAPI,
  mall: mallAPI,
  user: userAPI,
  common: commonAPI,
};
