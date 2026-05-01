// 自建后端 HTTP API 调用工具
import { request as httpRequest } from '~/api/http';
import { cacheGet, cacheSet } from '~/utils/persistCache';

/** 401 不应回退到离线缓存，否则界面仍像「已登录可用」，只有上传等接口会暴露失败 */
function shouldUseOfflineCache(err) {
  return !(err && err.statusCode === 401);
}

/** 带缓存的 HTTP 请求，TTL 秒内命中缓存则直接返回 */
function cachedRequest(path, query, ttlSeconds = 60, options = {}) {
  const cacheKey = `http_cache:${path}:${JSON.stringify(query || {})}`;
  return httpRequest({ method: 'GET', path, query, auth: true, ...options })
    .then((res) => {
      if (res && res.code === 200) cacheSet(cacheKey, res, ttlSeconds);
      return res;
    })
    .catch((err) => {
      if (!shouldUseOfflineCache(err)) throw err;
      const cached = cacheGet(cacheKey);
      if (cached) return cached;
      throw err;
    });
}

/**
 * 任务相关 API
 */
export const taskAPI = {
  // 获取待领取的任务列表（keyword 可选，仅标题模糊匹配）
  getTaskList(params = {}) {
    const keyword = params && params.keyword ? String(params.keyword).trim() : '';
    const cacheKey = `offline_cache_task_list:${keyword || '_'}`;

    return httpRequest({
      method: 'POST',
      path: 'api/tasks/list',
      data: { keyword: keyword || undefined },
      auth: true,
    })
      .then((res) => {
        if (res && res.code === 200) cacheSet(cacheKey, res, 3600);
        return res;
      })
      .catch((err) => {
        if (!shouldUseOfflineCache(err)) throw err;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;
        throw err;
      });
  },

  // 获取任务详情
  getTaskDetail(taskId) {
    return httpRequest({
      method: 'GET',
      path: `api/tasks/${taskId}`,
      auth: true,
    });
  },

  // 发布任务
  publishTask(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks',
      data,
      auth: true,
    });
  },

  // 保存草稿（新建/更新）
  saveDraftTask(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks/draft',
      data,
      auth: true,
    });
  },

  // 发布草稿
  publishDraft(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/publish`,
      auth: true,
    });
  },

  // 领取任务（不可领自己发布的；接单人昵称未传时用当前用户信息）
  claimTask(taskId, takerName) {
    const app = getApp();
    const name = takerName != null && String(takerName).trim()
      ? String(takerName).trim()
      : ((app.globalData.userInfo && app.globalData.userInfo.nickName) || '邻居');
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/claim`,
      data: { takerName: name },
      auth: true,
    });
  },

  // 提交完成
  submitComplete(taskId, proofText, proofImages) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/submit-complete`,
      data: { proofText, proofImages },
      auth: true,
    });
  },

  // 创建任务赏金支付单（返回 payment 用于 wx.requestPayment）
  // 自建后端需自行实现微信支付，建议暂时禁用
  createTaskPayment(taskId, envId) {
    return Promise.reject(new Error('自建后端请自行实现微信支付功能'));
  },

  // 确认完成（未开通支付时可继续使用，表示线下已付）
  confirmComplete(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/confirm-complete`,
      auth: true,
    });
  },

  // 取消任务
  cancelTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/revoke`,
      auth: true,
    });
  },

  // 发布者重新发布（恢复到待领取）
  republishTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/republish`,
      auth: true,
    });
  },

  // 删除已撤销的任务
  deleteTask(taskId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/tasks/${taskId}`,
      auth: true,
    });
  },

  // 接单人放弃任务
  abandonTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/abandon`,
      auth: true,
    });
  },

  // 获取我的任务
  getMyTasks(type) {
    return httpRequest({
      method: 'GET',
      path: 'api/tasks/my',
      query: { type },
      auth: true,
    });
  },

  // 提交评价
  submitRating(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks/ratings',
      data,
      auth: true,
    });
  },

  // 获取收到的评价
  getMyRatings() {
    return httpRequest({
      method: 'GET',
      path: 'api/tasks/my-ratings',
      auth: true,
    });
  },
};

/**
 * 论坛相关 API
 */
export const forumAPI = {
  // 获取帖子列表（keyword 仅匹配标题模糊，orderBy: time|hot，60s 缓存）
  getPosts(params = {}) {
    const { page = 1, pageSize = 10, keyword, orderBy } = params;
    return cachedRequest('api/posts', { page, pageSize, keyword, orderBy }, 60);
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
    return httpRequest({
      method: 'GET',
      path: `api/posts/${postId}`,
      auth: true,
    });
  },

  // 发布帖子
  publishPost(data) {
    const app = getApp();
    const authorName = (app.globalData.userInfo && app.globalData.userInfo.nickName) || '匿名用户';

    return httpRequest({
      method: 'POST',
      path: 'api/posts',
      data: { authorName, ...data },
      auth: true,
    });
  },

  // 发布回复（可选 parentReplyId 楼中楼）
  publishReply(postId, data) {
    const app = getApp();
    const authorName = (app.globalData.userInfo && app.globalData.userInfo.nickName) || '匿名用户';

    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies`,
      data: { authorName, ...data },
      auth: true,
    });
  },

  likeReply(postId, replyId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/like`,
      auth: true,
    });
  },

  unlikeReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}/like`,
      auth: true,
    });
  },

  favoriteReply(postId, replyId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/favorite`,
      auth: true,
    });
  },

  unfavoriteReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}/favorite`,
      auth: true,
    });
  },

  /** emoji 传空字符串表示取消；再次点同一表情为取消 */
  setReplyReaction(postId, replyId, emoji) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/reaction`,
      data: { emoji: emoji == null ? '' : String(emoji) },
      auth: true,
    });
  },

  // 删除自己的帖子（级联删除回复、赞、收藏）
  deletePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}`,
      auth: true,
    });
  },

  // 删除自己的回复
  deleteReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}`,
      auth: true,
    });
  },

  // 获取我的帖子
  getMyPosts() {
    return httpRequest({
      method: 'GET',
      path: 'api/posts/my',
      auth: true,
    });
  },

  // 点赞帖子
  likePost(postId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/like`,
      auth: true,
    });
  },

  // 取消点赞
  unlikePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/like`,
      auth: true,
    });
  },

  // 收藏帖子
  favoritePost(postId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/favorite`,
      auth: true,
    });
  },

  // 取消收藏
  unfavoritePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/favorite`,
      auth: true,
    });
  },

  // 获取我的收藏帖子
  getMyFavoritePosts() {
    return httpRequest({
      method: 'GET',
      path: 'api/posts/my-favorites',
      auth: true,
    });
  },
};

/**
 * 商城相关 API
 */
export const mallAPI = {
  // 获取商品列表（可传 categoryId 或 { categoryId, keyword, orderBy }，60s 缓存）
  getItems(categoryIdOrParams = {}) {
    const params = typeof categoryIdOrParams === 'string' ? { categoryId: categoryIdOrParams } : categoryIdOrParams;
    return cachedRequest('api/items', {
      categoryId: params.categoryId,
      keyword: params.keyword,
      orderBy: params.orderBy,
    }, 60);
  },

  // 获取商品列表（别名，保持兼容性）
  getItemList(categoryId) {
    return this.getItems(categoryId);
  },

  // 获取商品详情
  getItemDetail(itemId) {
    return httpRequest({
      method: 'GET',
      path: `api/items/${itemId}`,
      auth: true,
    });
  },

  // 获取商品评论列表
  getItemComments(itemId) {
    return httpRequest({
      method: 'GET',
      path: `api/items/${itemId}/comments`,
      auth: true,
    });
  },

  // 发布商品评论（content 可为空字符串；支持 parentCommentId、images）
  createItemComment(itemId, payload) {
    const data = typeof payload === 'string' ? { content: payload } : payload;
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/comments`,
      data,
      auth: true,
    });
  },

  // 删除商品评论（仅本人）
  deleteItemComment(itemId, commentId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/comments/${commentId}`,
      auth: true,
    });
  },

  likeItemComment(itemId, commentId) {
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/comments/${commentId}/like`,
      auth: true,
    });
  },

  unlikeItemComment(itemId, commentId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/comments/${commentId}/like`,
      auth: true,
    });
  },

  // 发布商品
  publishItem(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/items',
      data,
      auth: true,
    });
  },

  // 获取我的商品
  getMyItems() {
    return httpRequest({
      method: 'GET',
      path: 'api/items/my',
      auth: true,
    });
  },

  // 收藏商品
  favoriteItem(itemId) {
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/favorite`,
      auth: true,
    });
  },

  // 取消收藏商品
  unfavoriteItem(itemId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/favorite`,
      auth: true,
    });
  },

  // 获取我的收藏商品
  getMyFavoriteItems() {
    return httpRequest({
      method: 'GET',
      path: 'api/items/my-favorites',
      auth: true,
    });
  },

  // 创建订单（购买）
  createOrder(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/orders',
      data,
      auth: true,
    });
  },

  // 获取我的订单
  getMyOrders() {
    return httpRequest({
      method: 'GET',
      path: 'api/orders/my',
      auth: true,
    });
  },

  // 获取订单详情
  getOrderDetail(orderId) {
    return httpRequest({
      method: 'GET',
      path: `api/orders/${orderId}`,
      auth: true,
    });
  },

  // 更新订单状态（completed/cancelled）
  updateOrderStatus(orderId, status) {
    return httpRequest({
      method: 'PATCH',
      path: `api/orders/${orderId}`,
      data: { status },
      auth: true,
    });
  },

  // 获取分类列表
  getCategories() {
    return httpRequest({
      method: 'GET',
      path: 'api/categories',
      auth: true,
    });
  },
};

/**
 * 跑腿相关 API（独立模块，不复用 forum/task）
 */
export const errandAPI = {
  // 获取跑腿列表（keyword, orderBy: time|hot, page, pageSize，30s 缓存）
  getErrandList(params = {}) {
    const { page = 1, pageSize = 10, keyword, orderBy } = params;
    return cachedRequest('api/errands', { page, pageSize, keyword, orderBy }, 30);
  },

  // 获取跑腿详情
  getErrandDetail(errandId) {
    return httpRequest({
      method: 'GET',
      path: `api/errands/${errandId}`,
      auth: true,
    });
  },

  // 发布跑腿
  publishErrand(data) {
    const app = getApp();
    const authorName = (app.globalData.userInfo && app.globalData.userInfo.nickName) || '匿名用户';

    return httpRequest({
      method: 'POST',
      path: 'api/errands',
      data: { authorName, ...data },
      auth: true,
    });
  },

  // 领取跑腿（不可领取自己发布的）
  claimErrand(errandId) {
    const app = getApp();
    const claimerName = (app.globalData.userInfo && app.globalData.userInfo.nickName) || '邻居';
    return httpRequest({
      method: 'POST',
      path: `api/errands/${errandId}/claim`,
      data: { claimerName },
      auth: true,
    });
  },

  // 发布者确认跑腿已完成（线下佣金自行结算）
  completeErrand(errandId) {
    return httpRequest({
      method: 'POST',
      path: `api/errands/${errandId}/complete`,
      auth: true,
    });
  },

  // 发布跑腿回复
  publishErrandReply(errandId, data) {
    const app = getApp();
    const authorName = (app.globalData.userInfo && app.globalData.userInfo.nickName) || '匿名用户';

    return httpRequest({
      method: 'POST',
      path: `api/errands/${errandId}/replies`,
      data: { authorName, ...data },
      auth: true,
    });
  },

  // 点赞跑腿
  likeErrand(errandId) {
    return httpRequest({
      method: 'POST',
      path: `api/errands/${errandId}/like`,
      auth: true,
    });
  },

  // 取消点赞跑腿
  unlikeErrand(errandId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/errands/${errandId}/like`,
      auth: true,
    });
  },

  // 收藏跑腿
  favoriteErrand(errandId) {
    return httpRequest({
      method: 'POST',
      path: `api/errands/${errandId}/favorite`,
      auth: true,
    });
  },

  // 取消收藏跑腿
  unfavoriteErrand(errandId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/errands/${errandId}/favorite`,
      auth: true,
    });
  },

  // 获取我的跑腿（role: published | claimed）
  getMyErrands(params = {}) {
    return httpRequest({
      method: 'GET',
      path: 'api/errands/my',
      query: params,
      auth: true,
    });
  },
};

/**
 * 用户相关 API
 */
export const userAPI = {
  // 获取用户信息（登录已在 app.js 完成，此接口获取最新用户信息）
  getUserInfo() {
    return httpRequest({
      method: 'GET',
      path: 'api/users/me',
      auth: true,
    });
  },

  // 更新用户信息
  updateUserInfo(data) {
    return httpRequest({
      method: 'PATCH',
      path: 'api/users/me',
      data,
      auth: true,
    });
  },
};

/**
 * 通用功能 API
 */
export const commonAPI = {
  // 底部 Tab 入口配置
  getModuleEntryTabs() {
    return httpRequest({
      method: 'GET',
      path: 'api/app-settings/module-entry-tabs',
      auth: true,
    });
  },

  // 获取通知列表
  getNotifications() {
    return httpRequest({
      method: 'GET',
      path: 'api/notifications',
      auth: true,
    });
  },

  // 提交反馈
  submitFeedback(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/feedbacks',
      data,
      auth: true,
    });
  },

  // 发送订阅消息（自建后端需自行实现）
  sendSubscribeMessage(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/subscribe-messages',
      data,
      auth: true,
    });
  },
};

export default {
  task: taskAPI,
  errand: errandAPI,
  forum: forumAPI,
  mall: mallAPI,
  user: userAPI,
  common: commonAPI,
};
