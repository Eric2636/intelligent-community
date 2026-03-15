import { forumAPI } from '~/api/cloud';

Page({
  data: {
    pinned: [],
    list: [],
    loading: true,
    refreshing: false,
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
    this.loadPosts();
  },

  onShow() {
    this.loadPosts();
  },

  // 下拉刷新
  async onRefresh() {
    this.setData({
      refreshing: true,
      page: 1,
      hasMore: true
    });
    await this.loadPosts();
    this.setData({
      refreshing: false
    });
  },

  // 上拉加载更多
  async onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({
      page: this.data.page + 1
    });
    await this.loadPosts(false);
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
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

  onPullDownRefresh() {
    this.onRefresh().then(() => wx.stopPullDownRefresh());
  },

  async loadPosts(refresh = true) {
    this.setData({ loading: true });

    const app = getApp();
    if (!app.globalData.useCloudBase) {
      console.error('云开发未启用');
      wx.showToast({
        title: '云开发未启用',
        icon: 'none'
      });
      this.setData({ loading: false });
      return;
    }

    try {
      const res = await forumAPI.getPostList({
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword?.trim() || undefined,
        orderBy: this.data.orderBy
      });

      if (res.code === 200 && res.data) {
        const { pinned, list } = res.data;
        const fullList = refresh ? (list || []) : [...this.data.list, ...(list || [])];
        const useVirtual = fullList.length > this.data.VIRTUAL_WINDOW;
        const displayList = useVirtual ? fullList.slice(0, this.data.VIRTUAL_WINDOW) : fullList;
        const listTotalHeight = fullList.length * this.data.ITEM_HEIGHT_RPX;

        if (refresh) {
          this.setData({
            pinned: pinned || [],
            list: fullList,
            hasMore: (list || []).length >= this.data.pageSize,
            useVirtual,
            displayList,
            virtualStart: 0,
            listTotalHeight,
          });
        } else {
          this.setData({
            pinned: pinned && pinned.length > 0 ? pinned : this.data.pinned,
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

  goPost(e) {
    const id = e.currentTarget.dataset.id;
    const postId = id != null ? String(id) : '';

    if (!postId) {
      wx.showToast({ title: '帖子信息异常', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/packageForum/post/index?postId=${encodeURIComponent(postId)}`,
    });
  },

  goPublish() {
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
