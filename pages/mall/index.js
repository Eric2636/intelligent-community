import { mallAPI } from '~/api/cloud';
import { mallDetailUrl, mallPublishUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';

Page({
  data: {
    categories: [],
    currentCategory: 'flea',
    fullList: [],
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
    orderBy: 'time', // time | price_asc | price_desc
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadCategories();
    this.loadList();
  },

  onShow() {
    syncCustomTabBar(this);
    redirectIfEntryHidden('mall');
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    try {
      await Promise.all([this.loadCategories(), this.loadList(true)]);
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async onLoadMore() {
    this.loadMore();
  },

  async loadCategories() {
    const res = await mallAPI.getCategories();
    if (res.code === 200) {
      const categories = res.data || [];
      const currentCategory = categories.some((item) => item.id === this.data.currentCategory)
        ? this.data.currentCategory
        : (categories[0] && categories[0].id) || 'flea';
      this.setData({ categories, currentCategory });
    }
  },

  async loadList(refresh = true) {
    const { currentCategory, keyword, orderBy, pageSize } = this.data;
    this.setData({
      page: refresh ? 1 : this.data.page,
      hasMore: refresh ? true : this.data.hasMore,
      showNoMore: refresh ? false : this.data.showNoMore,
      loading: refresh,
      loadingMore: !refresh,
    });
    try {
      const res = await mallAPI.getItems({ categoryId: currentCategory, keyword: (keyword || '').trim() || undefined, orderBy });
      if (res.code === 200) {
        const raw = res.data || [];
        const list = raw.slice(0, pageSize);
        this.setData({
          fullList: raw,
          list,
          listTotal: raw.length,
          hasMore: raw.length > list.length,
        });
      } else {
        wx.showToast({ title: res.message || '获取商品失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载商品列表失败', err);
      wx.showToast({ title: err.errMsg || '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore) {
      this.showNoMoreTip();
      return;
    }
    const nextPage = this.data.page + 1;
    const nextEnd = nextPage * this.data.pageSize;
    const list = this.data.fullList.slice(0, nextEnd);
    if (list.length === this.data.list.length) {
      this.showNoMoreTip();
      this.setData({ hasMore: false });
      return;
    }
    this.setData({
      page: nextPage,
      list,
      hasMore: this.data.fullList.length > list.length,
    });
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

  onOrderChange(e) {
    const orderBy = e.currentTarget.dataset.order;
    this.setData({ orderBy });
    this.loadList(true);
  },

  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({ currentCategory: id });
    this.loadList(true);
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: mallDetailUrl(id) });
  },

  goPublish() {
    wx.navigateTo({ url: mallPublishUrl() });
  },
});
