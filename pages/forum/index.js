import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { normalizeForumListPost, forumListPostHasMedia } from '~/utils/forumPostList';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';

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
    refreshing: false,
    showNoMore: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
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
    consumeListRefresh(LIST_REFRESH_KEYS.forum);
    this.setData({ page: 1, hasMore: true });
    Promise.all([this.loadAnnouncements(), this.loadPosts(true)]);
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
    this.setData({
      refreshing: false
    });
  },

  // 上拉加载更多
  async onLoadMore() {
    if (this.data.loading) return;
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
    const nextKeyword = e.detail.value || '';
    const wasSearching = Boolean((this.data.keyword || '').trim());
    this.setData({ keyword: nextKeyword });
    if (wasSearching && !String(nextKeyword).trim()) {
      this.setData({ page: 1, hasMore: true });
      this.loadPosts(true);
    }
  },

  onSearchClear() {
    this.setData({ keyword: '', page: 1, hasMore: true });
    this.loadPosts(true);
  },

  onSearchConfirm() {
    this.setData({ page: 1, hasMore: true });
    this.loadPosts(true);
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

  async loadPosts(refresh = true) {
    this.setData({
      loading: true,
      showNoMore: refresh ? false : this.data.showNoMore,
    });

    try {
      const res = await forumAPI.getPostList({
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: (this.data.keyword && String(this.data.keyword).trim()) || undefined,
        orderBy: this.data.orderBy
      });

      if (res.code === 200 && res.data) {
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
            hasMore: (list || []).length >= this.data.pageSize,
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
        this.setData({
          pinned: [],
          list: [],
          loading: false,
        });
        wx.showToast({
          title: res.message || '获取帖子失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('加载帖子失败:', err);
      this.setData({
        pinned: [],
        list: [],
        loading: false,
      });
      wx.showToast({
        title: err.errMsg || '网络错误，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadAnnouncements() {
    try {
      const res = await forumAPI.getAnnouncements({ limit: 5 });
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
      console.error('加载公告失败:', err);
      this.setData({ announcements: [] });
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
    if (!(await ensureMutationReady())) return;
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

    wx.navigateTo({
      url: `/packageForum/post/index?postId=${encodeURIComponent(postId)}`,
    });
  },

  goPostComments(e) {
    const postId = getPostIdFromEvent(e);
    if (!postId) {
      wx.showToast({ title: '帖子信息异常', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${encodeURIComponent(postId)}&anchor=comments`,
    });
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
    if (!(await ensureMutationReady())) return;
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
});
