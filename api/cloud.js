// 自建后端 HTTP API 调用工具
import { getToken, request as httpRequest } from '~/api/http';
import { cacheGet, cacheSet, invalidateHttpCachePrefix } from '~/utils/persistCache';
import { formatDateTimeFields } from '~/utils/date';
import { getCurrentUserId } from '~/utils/getOpenid';
import { createMallOrderWithIdempotency } from '~/utils/mallOrderIntent';
import {
  LIST_REFRESH_KEYS,
  markForumLists,
  markListRefresh,
  markMallLists,
  markTaskLists,
} from '~/utils/listRefresh';

/** HTTP 响应错误必须原样暴露；只有 wx.request 的断网、超时等传输失败才允许回退缓存。 */
function shouldUseOfflineCache(err) {
  if (!err || err.statusCode == null || err.statusCode === '') return true;
  const statusCode = Number(err.statusCode);
  return !Number.isFinite(statusCode) || statusCode <= 0;
}

function getBackendCacheScope() {
  try {
    const app = getApp();
    const apiBaseUrl = String((app && app.globalData && app.globalData.apiBaseUrl) || '')
      .trim()
      .replace(/\/+$/, '');
    return encodeURIComponent(apiBaseUrl || 'unknown');
  } catch (e) {
    return 'unknown';
  }
}

function markOfflineCacheResponse(value) {
  const formatted = formatDateTimeFields(value);
  if (!formatted || typeof formatted !== 'object' || Array.isArray(formatted)) return formatted;
  return { ...formatted, __fromOfflineCache: true };
}

/** 带离线兜底的 HTTP 请求：正常始终请求后端，失败时才读本地缓存 */
function cachedRequest(path, query, ttlSeconds = 60, options = {}) {
  const { cacheScope, cacheKeyPrefix = 'http_cache', ...requestOptions } = options;
  let scope = '';
  if (cacheScope === 'identity') {
    const token = getToken();
    const userId = String(getCurrentUserId() || '').trim();
    if (!token) scope = 'guest';
    else if (userId) scope = `user:${encodeURIComponent(userId)}`;
    else scope = null;
  }
  const cacheKey =
    scope === null
      ? ''
      : `${cacheKeyPrefix}:${path}:backend:${getBackendCacheScope()}:${
          scope ? `scope:${scope}:` : ''
        }${JSON.stringify(query || {})}`;
  return httpRequest({ method: 'GET', path, query, auth: true, ...requestOptions })
    .then((res) => {
      if (cacheKey && res && res.code === 200) cacheSet(cacheKey, res, ttlSeconds);
      return formatDateTimeFields(res);
    })
    .catch((err) => {
      if (!shouldUseOfflineCache(err)) throw err;
      const cached = cacheKey ? cacheGet(cacheKey) : null;
      if (cached) return markOfflineCacheResponse(cached);
      throw err;
    });
}

function clearTaskListCache() {
  invalidateHttpCachePrefix('offline_cache_task_list:');
}

function clearPostListCache() {
  invalidateHttpCachePrefix('http_cache:api/posts:');
}

function clearItemListCache() {
  invalidateHttpCachePrefix('http_cache:api/items:');
}

function refreshAfterSuccess(res, refresh) {
  if (res && res.code === 200) refresh();
  return res;
}

/**
 * 任务相关 API
 */
export const taskAPI = {
  // 获取待领取的任务列表（keyword 可选，仅标题模糊匹配）
  getTaskList(params = {}) {
    const keyword = params && params.keyword ? String(params.keyword).trim() : '';
    const page = params && params.page ? Number(params.page) : 1;
    const pageSize = params && params.pageSize ? Number(params.pageSize) : 50;
    const data = { keyword: keyword || undefined, page, pageSize };
    return cachedRequest('api/tasks/list', data, 3600, {
      method: 'POST',
      query: undefined,
      data,
      auth: false,
      cacheKeyPrefix: 'offline_cache_task_list',
    });
  },

  // 获取任务详情
  getTaskDetail(taskId) {
    return httpRequest({
      method: 'GET',
      path: `api/tasks/${encodeURIComponent(taskId)}`,
      auth: false,
    }).then(formatDateTimeFields);
  },

  // 发布任务
  publishTask(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks',
      data,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearTaskListCache();
      return refreshAfterSuccess(res, markTaskLists);
    });
  },

  // 保存草稿（新建/更新）
  saveDraftTask(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks/draft',
      data,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 发布草稿
  publishDraft(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/publish`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearTaskListCache();
      return refreshAfterSuccess(res, markTaskLists);
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
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 提交完成
  submitComplete(taskId, proofText, proofImages) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/submit-complete`,
      data: { proofText, proofImages },
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
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
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 发布者驳回完成提交（保留上次凭证，任务退回进行中）
  rejectComplete(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/reject-complete`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 取消任务
  cancelTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/revoke`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 发布者重新发布（恢复到待领取）
  republishTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/republish`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearTaskListCache();
      return refreshAfterSuccess(res, markTaskLists);
    });
  },

  // 删除已撤销的任务
  deleteTask(taskId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/tasks/${taskId}`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 接单人放弃任务
  abandonTask(taskId) {
    return httpRequest({
      method: 'POST',
      path: `api/tasks/${taskId}/abandon`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markTaskLists));
  },

  // 获取我的任务
  getMyTasks(type) {
    return httpRequest({
      method: 'GET',
      path: 'api/tasks/my',
      query: { type },
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 提交评价
  submitRating(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/tasks/ratings',
      data,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, () => markListRefresh(LIST_REFRESH_KEYS.taskMine)));
  },

  // 获取收到的评价
  getMyRatings() {
    return httpRequest({
      method: 'GET',
      path: 'api/tasks/my-ratings',
      auth: true,
    }).then(formatDateTimeFields);
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

  // 获取有效公告（展示在小区留言顶部，短缓存避免过期公告停留太久）
  getAnnouncements(params = {}) {
    const limit = params && params.limit ? Number(params.limit) : 5;
    return cachedRequest('api/posts/announcements', { limit }, 30);
  },

  // 获取帖子详情
  getPostDetail(postId) {
    if (!postId) {
      return Promise.reject(new Error('postId 不能为空'));
    }
    return httpRequest({
      method: 'GET',
      path: `api/posts/${encodeURIComponent(postId)}`,
      auth: true,
    }).then(formatDateTimeFields);
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
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
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
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  likeReply(postId, replyId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/like`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  unlikeReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}/like`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  favoriteReply(postId, replyId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/favorite`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  unfavoriteReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}/favorite`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  /** emoji 传空字符串表示取消；再次点同一表情为取消 */
  setReplyReaction(postId, replyId, emoji) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/replies/${replyId}/reaction`,
      data: { emoji: emoji == null ? '' : String(emoji) },
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  // 删除自己的帖子（级联删除回复、赞、收藏）
  deletePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  // 删除自己的回复
  deleteReply(postId, replyId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/replies/${replyId}`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  // 获取我的帖子
  getMyPosts() {
    return httpRequest({
      method: 'GET',
      path: 'api/posts/my',
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 点赞帖子
  likePost(postId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/like`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  // 取消点赞
  unlikePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/like`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  // 收藏帖子
  favoritePost(postId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/favorite`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  // 取消收藏
  unfavoritePost(postId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/posts/${postId}/favorite`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markForumLists));
  },

  // 记录帖子分享次数（微信分享回调需同步返回，调用方通常 fire-and-forget）
  recordPostShare(postId) {
    return httpRequest({
      method: 'POST',
      path: `api/posts/${postId}/share`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearPostListCache();
      return refreshAfterSuccess(res, markForumLists);
    });
  },

  // 获取我的收藏帖子
  getMyFavoritePosts() {
    return httpRequest({
      method: 'GET',
      path: 'api/posts/my-favorites',
      auth: true,
    }).then(formatDateTimeFields);
  },
};

/**
 * 商城相关 API
 */
export const mallAPI = {
  // 获取商品列表（可传 categoryId 或 { categoryId, keyword, orderBy }，60s 缓存）
  getItems(categoryIdOrParams = {}) {
    const params = typeof categoryIdOrParams === 'string' ? { categoryId: categoryIdOrParams } : categoryIdOrParams;
    return cachedRequest(
      'api/items',
      {
        categoryId: params.categoryId,
        keyword: params.keyword,
        orderBy: params.orderBy,
      },
      60,
      { auth: 'optional', cacheScope: 'identity' },
    );
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
      auth: 'optional',
    }).then(formatDateTimeFields);
  },

  // 获取商品评论列表
  getItemComments(itemId) {
    return httpRequest({
      method: 'GET',
      path: `api/items/${itemId}/comments`,
      auth: 'optional',
    }).then(formatDateTimeFields);
  },

  // 发布商品评论（content 可为空字符串；支持 parentCommentId、images）
  createItemComment(itemId, payload) {
    const data = typeof payload === 'string' ? { content: payload } : payload;
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/comments`,
      data,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markMallLists));
  },

  // 删除商品评论（仅本人）
  deleteItemComment(itemId, commentId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/comments/${commentId}`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markMallLists));
  },

  likeItemComment(itemId, commentId) {
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/comments/${commentId}/like`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markMallLists));
  },

  unlikeItemComment(itemId, commentId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/comments/${commentId}/like`,
      auth: true,
    }).then((res) => refreshAfterSuccess(res, markMallLists));
  },

  // 发布商品
  publishItem(data) {
    return httpRequest({
      method: 'POST',
      path: 'api/items',
      data,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearItemListCache();
      return refreshAfterSuccess(res, markMallLists);
    });
  },

  // 获取我的商品
  getMyItems() {
    return httpRequest({
      method: 'GET',
      path: 'api/items/my',
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 收藏商品
  favoriteItem(itemId) {
    return httpRequest({
      method: 'POST',
      path: `api/items/${itemId}/favorite`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearItemListCache();
      return refreshAfterSuccess(res, markMallLists);
    });
  },

  // 取消收藏商品
  unfavoriteItem(itemId) {
    return httpRequest({
      method: 'DELETE',
      path: `api/items/${itemId}/favorite`,
      auth: true,
    }).then((res) => {
      if (res && res.code === 200) clearItemListCache();
      return refreshAfterSuccess(res, markMallLists);
    });
  },

  // 获取我的收藏商品
  getMyFavoriteItems() {
    return httpRequest({
      method: 'GET',
      path: 'api/items/my-favorites',
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 创建订单（购买）
  createOrder(data) {
    return createMallOrderWithIdempotency(data, (payload) =>
      httpRequest({
        method: 'POST',
        path: 'api/orders',
        data: payload,
        auth: true,
      }),
    ).then((res) =>
      refreshAfterSuccess(res, () => {
        markMallLists();
        markListRefresh(LIST_REFRESH_KEYS.mallOrders);
      }),
    );
  },

  // 获取我的订单
  getMyOrders() {
    return httpRequest({
      method: 'GET',
      path: 'api/orders/my',
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 获取订单详情
  getOrderDetail(orderId) {
    return httpRequest({
      method: 'GET',
      path: `api/orders/${encodeURIComponent(orderId)}`,
      auth: true,
    }).then(formatDateTimeFields);
  },

  // 更新订单状态（completed/cancelled）
  updateOrderStatus(orderId, status) {
    return httpRequest({
      method: 'PATCH',
      path: `api/orders/${orderId}`,
      data: { status },
      auth: true,
    }).then((res) => refreshAfterSuccess(res, () => {
      markMallLists();
      markListRefresh(LIST_REFRESH_KEYS.mallOrders);
    }));
  },

  // 获取分类列表
  getCategories() {
    return httpRequest({
      method: 'GET',
      path: 'api/categories',
      auth: 'optional',
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
      path: 'api/user/me',
      auth: true,
    }).then((res) => (res && res.code === 200 ? res : { code: 200, data: res }));
  },

  // 更新用户信息
  updateUserInfo(data) {
    return httpRequest({
      method: 'PATCH',
      path: 'api/user/me',
      data,
      auth: true,
    }).then((res) => refreshAfterSuccess(res && res.code === 200 ? res : { code: 200, data: res }, () => markListRefresh(LIST_REFRESH_KEYS.user)));
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
      auth: false,
    });
  },

  // 获取通知列表（服务端按创建时间倒序分页）
  getNotifications(params = {}) {
    const page = params && params.page ? Number(params.page) : 1;
    const pageSize = params && params.pageSize ? Number(params.pageSize) : 20;
    return httpRequest({
      method: 'GET',
      path: 'api/notifications',
      query: { page, pageSize },
      auth: true,
    }).then(formatDateTimeFields);
  },

  getNotificationUnreadCount() {
    return httpRequest({
      method: 'GET',
      path: 'api/notifications/unread-count',
      auth: true,
    });
  },

  markNotificationRead(id) {
    return httpRequest({
      method: 'PATCH',
      path: `api/notifications/${encodeURIComponent(id)}/read`,
      auth: true,
    });
  },

  markAllNotificationsRead() {
    return httpRequest({
      method: 'PATCH',
      path: 'api/notifications/read-all',
      auth: true,
    });
  },

  deleteNotification(id) {
    return httpRequest({
      method: 'DELETE',
      path: `api/notifications/${encodeURIComponent(id)}`,
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
  forum: forumAPI,
  mall: mallAPI,
  user: userAPI,
  common: commonAPI,
};
