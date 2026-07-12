import { taskAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';

Page({
  data: {
    list: [],
    listTotal: 0,
    loading: true,
    refreshing: false,
    loadingMore: false,
    showNoMore: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
  },

  onLoad() {
    if (redirectIfEntryHidden('task')) return;
    this._skipNextShowRefresh = true;
    this.loadList();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('task')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    consumeListRefresh(LIST_REFRESH_KEYS.task);
    this.loadList(true);
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    try {
      await this.loadList(true);
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async onLoadMore() {
    await this.loadMore();
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore) {
      this.showNoMoreTip();
      return;
    }
    this.setData({ page: this.data.page + 1, loadingMore: true });
    await this.loadList(false);
  },

  showNoMoreTip() {
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
    this.setData({ showNoMore: true });
    this._noMoreTimer = setTimeout(() => {
      this.setData({ showNoMore: false });
      this._noMoreTimer = null;
    }, 2000);
  },

  onSearchInput(e) {
    const nextKeyword = e.detail.value || '';
    const wasSearching = Boolean((this.data.keyword || '').trim());
    this.setData({ keyword: nextKeyword });
    if (wasSearching && !String(nextKeyword).trim()) {
      this.loadList(true);
    }
  },

  onSearchClear() {
    this.setData({ keyword: '' });
    this.loadList(true);
  },

  onSearchConfirm() {
    this.loadList(true);
  },

  async loadList(refresh = true) {
    const nextPage = refresh ? 1 : this.data.page;
    this.setData({
      page: nextPage,
      hasMore: refresh ? true : this.data.hasMore,
      showNoMore: refresh ? false : this.data.showNoMore,
      loading: refresh,
      loadingMore: !refresh,
    });
    try {
      const res = await taskAPI.getTaskList({
        keyword: (this.data.keyword || '').trim() || undefined,
        page: nextPage,
        pageSize: this.data.pageSize,
      });
      if (res.code === 200) {
        const raw = res.data || [];
        const normalized = raw.map((t) => ({
          ...t,
          id: t._id || t.id,
          images: Array.isArray(t.images) ? t.images : [],
          videos: Array.isArray(t.videos) ? t.videos : [],
        }));
        const list = refresh ? normalized : [...this.data.list, ...normalized];
        if (!refresh && normalized.length === 0) this.showNoMoreTip();
        this.setData({
          list,
          listTotal: list.length,
          hasMore: normalized.length >= this.data.pageSize,
        });
      } else {
        wx.showToast({ title: res.message || '获取任务失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载任务列表失败', err);
      if (!refresh) this.setData({ page: Math.max(1, nextPage - 1) });
      wx.showToast({ title: err.errMsg || '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onPreviewListImages(e) {
    const { cardIndex, current } = e.currentTarget.dataset;
    const { list } = this.data;
    const item = list[Number(cardIndex)];
    if (!item || !item.images || !item.images.length) return;
    wx.previewImage({
      current: current || item.images[0],
      urls: item.images,
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/packageTask/publish/index' });
  },
});
