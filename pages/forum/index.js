import { Subject } from 'rxjs';

import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { normalizeForumListPost, forumListPostHasMedia } from '~/utils/forumPostList';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { createHotSearch } from '~/utils/hotSearch';
import { applyListMutation } from '../../utils/listMutation.js';

function getPostIdFromEvent(e) {
  const { id } = e.currentTarget.dataset;
  return id != null ? String(id) : '';
}

Page({
  data: {
    announcements: [],
    announcementCurrent: 0,
    pinned: [],
    list: [],
    loading: true,
    loadingMore: false,
    refreshing: false,
    showNoMore: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
    queryKeyword: '',
    orderBy: 'time', // time | hot
    // 虚拟列表：仅渲染可见窗口，减少长列表卡顿
    virtualStart: 0,
    displayList: [],
    listTotalHeight: 0,
    useVirtual: false,
    ITEM_HEIGHT_RPX: 140,
    VIRTUAL_WINDOW: 20,
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this._pageAlive = true;
    this._keyword$ = new Subject();
    this._searchRequestId = 0;
    this._committedRequestInvalidated = false;
    this._activeSearchKeyword = '';
    this._announcementRequestId = 0;
    this._stopHotSearch = createHotSearch(this._keyword$, (keyword) => {
      if (!this._pageAlive) return;
      if (keyword === this._activeSearchKeyword) {
        if (this._committedRequestInvalidated) {
          this.setData({ page: 1, hasMore: true });
          this.loadPosts(true);
        }
        return;
      }
      this._activeSearchKeyword = keyword;
      this._committedRequestInvalidated = false;
      this.setData({ queryKeyword: keyword, page: 1, hasMore: true });
      this.loadPosts(true);
    });
    this._skipNextShowRefresh = true;
    this.loadAnnouncements();
    this.loadPosts();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('forum')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.forum);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadPosts(true, { silent: true });
  },

  // 下拉刷新
  async onRefresh() {
    this.setData({
      refreshing: true,
      showNoMore: false,
      page: 1,
      hasMore: true
    });
    await Promise.all([this.loadAnnouncements(), this.loadPosts()]);
  },

  // 上拉加载更多
  async onLoadMore() {
    if (this.data.loading || this.data.loadingMore || this.data.refreshing) return;
    if (!this.data.hasMore) {
      this.showNoMoreTip();
      return;
    }
    this.setData({
      page: this.data.page + 1
    });
    await this.loadPosts(false);
  },

  onSearchInput(e) {
    if (!this._pageAlive) return;
    const nextKeyword = e.detail.value || '';
    const normalizedKeyword = String(nextKeyword).trim();
    if (normalizedKeyword !== this._activeSearchKeyword) {
      const hasInFlightRequest = this._activeListRequestId === this._searchRequestId;
      this._searchRequestId += 1;
      this._committedRequestInvalidated =
        this._committedRequestInvalidated || hasInFlightRequest;
    }
    this.setData({ keyword: nextKeyword });
    this._keyword$.next(nextKeyword);
  },

  onSearchClear() {
    if (!this._pageAlive) return;
    this.onSearchInput({ detail: { value: '' } });
  },

  onOrderChange(e) {
    const orderBy = e.currentTarget.dataset.order;
    this.setData({ orderBy, page: 1, hasMore: true });
    this.loadPosts(true);
  },

  showNoMoreTip() {
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
    this.setData({ showNoMore: true });
    this._noMoreTimer = setTimeout(() => {
      this.setData({ showNoMore: false });
      this._noMoreTimer = null;
    }, 2000);
  },

  async loadPosts(refresh = true, { silent = false } = {}) {
    this._searchRequestId += 1;
    const requestId = this._searchRequestId;
    this._activeListRequestId = requestId;
    this._committedRequestInvalidated = false;
    const { queryKeyword, orderBy } = this.data;
    const requestPageSize = silent
      ? Math.max(this.data.pageSize, this.data.list.length)
      : this.data.pageSize;
    const page = refresh ? 1 : this.data.page;
    const keyword = String(queryKeyword || '').trim();
    this.setData({
      page: silent ? this.data.page : page,
      loading: silent ? this.data.loading : refresh,
      loadingMore: silent ? this.data.loadingMore : !refresh,
      showNoMore: refresh ? false : this.data.showNoMore,
    });

    try {
      const res = await forumAPI.getPostList({
        page,
        pageSize: requestPageSize,
        keyword: keyword || undefined,
        orderBy
      });
      if (!this._pageAlive || requestId !== this._searchRequestId) return;

      if (res.code === 200 && res.data) {
        if (res.__fromOfflineCache) {
          wx.showToast({ title: '网络不可用，当前展示缓存数据', icon: 'none' });
        }
        const { pinned, list } = res.data;
        const pinnedNorm = (pinned || []).map(normalizeForumListPost);
        const chunk = (list || []).map(normalizeForumListPost);
        const fullList = refresh ? chunk : [...this.data.list, ...chunk];
        let nextPinned = this.data.pinned;
        if (refresh) {
          nextPinned = pinnedNorm;
        } else if (pinnedNorm && pinnedNorm.length > 0) {
          nextPinned = pinnedNorm;
        }
        const useVirtual =
          fullList.length > this.data.VIRTUAL_WINDOW &&
          !fullList.some(forumListPostHasMedia) &&
          !(nextPinned || []).some(forumListPostHasMedia);
        const displayList = useVirtual ? fullList.slice(0, this.data.VIRTUAL_WINDOW) : fullList;
        const listTotalHeight = fullList.length * this.data.ITEM_HEIGHT_RPX;
        if (!refresh && chunk.length === 0) this.showNoMoreTip();

        if (refresh) {
          this.setData({
            pinned: pinnedNorm,
            list: fullList,
            hasMore: (list || []).length >= requestPageSize,
            useVirtual,
            displayList,
            virtualStart: 0,
            listTotalHeight,
          });
        } else {
          this.setData({
            pinned: pinnedNorm && pinnedNorm.length > 0 ? pinnedNorm : this.data.pinned,
            list: fullList,
            hasMore: (list || []).length >= this.data.pageSize,
            useVirtual,
            displayList: useVirtual ? fullList.slice(this.data.virtualStart, this.data.virtualStart + this.data.VIRTUAL_WINDOW) : fullList,
            listTotalHeight,
          });
        }
      } else {
        const message = String(res.message || '获取帖子失败');
        wx.showToast({
          title: message.includes('重试') ? message : `${message}，请重试`,
          icon: 'none'
        });
      }
    } catch (err) {
      if (!this._pageAlive || requestId !== this._searchRequestId) return;
      console.error('加载帖子失败:', err);
      const message = String(err.errMsg || err.message || '网络错误');
      wx.showToast({
        title: message.includes('重试') ? message : `${message}，请重试`,
        icon: 'none'
      });
    } finally {
      if (this._pageAlive && requestId === this._searchRequestId) {
        this._activeListRequestId = 0;
        this.setData({ loading: false, loadingMore: false, refreshing: false });
      }
    }
  },

  async loadAnnouncements() {
    this._announcementRequestId = (this._announcementRequestId || 0) + 1;
    const requestId = this._announcementRequestId;
    try {
      const res = await forumAPI.getAnnouncements({ limit: 5 });
      if (!this._pageAlive || requestId !== this._announcementRequestId) return;
      if (res.code === 200 && Array.isArray(res.data)) {
        const announcements = res.data.map((item) => {
          const normalized = normalizeForumListPost(item);
          const summary = String(normalized.content || '').replace(/\s+/g, ' ').trim();
          return {
            ...normalized,
            summary,
          };
        });
        this.setData({
          announcements,
          announcementCurrent: 0,
        });
      }
    } catch (err) {
      if (!this._pageAlive || requestId !== this._announcementRequestId) return;
      console.error('加载公告失败:', err);
    }
  },

  onAnnouncementChange(e) {
    const current = Number(e.detail.current || 0);
    if (current === this.data.announcementCurrent) return;
    this.setData({ announcementCurrent: current });
  },

  onForumListPreviewImage(e) {
    const postId = String(e.currentTarget.dataset.postId || '');
    const current = e.currentTarget.dataset.src;
    const merged = [...this.data.pinned, ...this.data.list];
    const post = merged.find((p) => String(p.id || p._id) === postId);
    if (!post || !post.images || !post.images.length) return;
    wx.previewImage({
      current: current || post.images[0],
      urls: post.images,
    });
  },

  noop() {},

  findListPost(postId) {
    const merged = [...this.data.pinned, ...this.data.list];
    return merged.find((p) => String(p.id || p._id) === String(postId));
  },

  patchListPost(postId, patch) {
    const updateOne = (item) => {
      if (String(item.id || item._id) !== String(postId)) return item;
      return { ...item, ...patch };
    };
    const pinned = this.data.pinned.map(updateOne);
    const list = this.data.list.map(updateOne);
    const displayList = this.data.displayList.map(updateOne);
    this.setData({ pinned, list, displayList });
  },

  recordPostShare(postId, post) {
    if (!postId || !post) return;
    const currentShareCount = Number(post.shareCount || post.forwardCount || 0);
    this.patchListPost(postId, {
      shareCount: currentShareCount + 1,
      forwardCount: currentShareCount + 1,
    });
    forumAPI.recordPostShare(postId)
      .then((res) => {
        if (res && res.code === 200 && res.data && res.data.shareCount != null) {
          this.patchListPost(postId, {
            shareCount: res.data.shareCount,
            forwardCount: res.data.shareCount,
          });
        }
      })
      .catch((err) => {
        console.error('记录帖子分享失败', err);
      });
  },

  async onListLike(e) {
    if (!(await ensureMutationReady(this))) return;
    const postId = getPostIdFromEvent(e);
    const post = this.findListPost(postId);
    if (!postId || !post) return;
    const isLiked = Boolean(post.isLiked);
    const nextLikeCount = Math.max(0, (post.likeCount || 0) + (isLiked ? -1 : 1));
    this.patchListPost(postId, { isLiked: !isLiked, likeCount: nextLikeCount });
    try {
      const api = isLiked ? forumAPI.unlikePost : forumAPI.likePost;
      const res = await api(postId);
      if (res.code !== 200) {
        this.patchListPost(postId, { isLiked, likeCount: post.likeCount || 0 });
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      if (res.data && res.data.likeCount != null) {
        this.patchListPost(postId, { likeCount: res.data.likeCount });
      }
    } catch (err) {
      this.patchListPost(postId, { isLiked, likeCount: post.likeCount || 0 });
      wx.showToast({ title: (err && (err.message || err.errMsg)) || '操作失败', icon: 'none' });
    }
  },

  goPost(e) {
    const postId = getPostIdFromEvent(e);

    if (!postId) {
      wx.showToast({ title: '帖子信息异常', icon: 'none' });
      return;
    }

    this._listMutationHandled = false;
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${encodeURIComponent(postId)}`,
      events: { listMutation: (mutation) => this.onDetailListMutation(mutation) },
    });
  },

  goPostComments(e) {
    const postId = getPostIdFromEvent(e);
    if (!postId) {
      wx.showToast({ title: '帖子信息异常', icon: 'none' });
      return;
    }
    this._listMutationHandled = false;
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${encodeURIComponent(postId)}&anchor=comments`,
      events: { listMutation: (mutation) => this.onDetailListMutation(mutation) },
    });
  },

  onDetailListMutation(mutation) {
    this._listMutationHandled = true;
    const normalized = mutation && mutation.data
      ? { ...mutation, data: normalizeForumListPost(mutation.data) }
      : mutation;
    const list = applyListMutation(this.data.list, normalized);
    const pinned = applyListMutation(this.data.pinned, normalized);
    const updates = {};
    if (list !== this.data.list) {
      updates.list = list;
      updates.displayList = this.data.useVirtual
        ? list.slice(this.data.virtualStart, this.data.virtualStart + this.data.VIRTUAL_WINDOW)
        : list;
    }
    if (pinned !== this.data.pinned) updates.pinned = pinned;
    if (Object.keys(updates).length) this.setData(updates);
  },

  onShareAppMessage(options = {}) {
    const postId = options.target && options.target.dataset ? String(options.target.dataset.id || '') : '';
    const post = postId ? this.findListPost(postId) : null;
    if (postId && post) this.recordPostShare(postId, post);
    return {
      title: post && post.title ? post.title : '小区留言',
      path: postId
        ? `/packageForum/post/index?postId=${encodeURIComponent(postId)}`
        : '/pages/forum/index',
      imageUrl: post && post.images && post.images[0] ? post.images[0] : undefined,
    };
  },

  async goPublish() {
    if (!(await ensureMutationReady(this))) return;
    wx.navigateTo({
      url: '/packageForum/publish/index',
    });
  },

  onListScroll(e) {
    if (!this.data.useVirtual || !this.data.list.length) return;
    const scrollTop = e.detail.scrollTop || 0;
    const PINNED_ESTIMATE_PX = 80;
    const ITEM_HEIGHT_PX = 70;
    const listScrollTop = Math.max(0, scrollTop - PINNED_ESTIMATE_PX);
    const newStart = Math.min(
      Math.max(0, this.data.list.length - this.data.VIRTUAL_WINDOW),
      Math.floor(listScrollTop / ITEM_HEIGHT_PX)
    );
    if (newStart === this.data.virtualStart) return;
    const displayList = this.data.list.slice(newStart, newStart + this.data.VIRTUAL_WINDOW);
    this.setData({ virtualStart: newStart, displayList });
  },

  onUnload() {
    this._pageAlive = false;
    this._authPageAlive = false;
    this._announcementRequestId = (this._announcementRequestId || 0) + 1;
    if (this._stopHotSearch) this._stopHotSearch();
    if (this._keyword$) this._keyword$.complete();
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
  },
});
