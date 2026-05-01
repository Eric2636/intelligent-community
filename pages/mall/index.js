import { mallAPI } from '~/api/cloud';
import { mallDetailUrl, mallPublishUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';

Page({
  data: {
    categories: [],
    currentCategory: 'all',
    list: [],
    listTotal: 0,
    loading: true,
    keyword: '',
    orderBy: 'time', // time | price_asc | price_desc
    maxRender: 50, // 长列表仅渲染前 50 条
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadCategories();
    this.loadList();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('mall')) return;
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadList()]).then(() => wx.stopPullDownRefresh());
  },

  async loadCategories() {
    const res = await mallAPI.getCategories();
    if (res.code === 200) this.setData({ categories: res.data || [] });
  },

  async loadList() {
    const { currentCategory, keyword, orderBy, maxRender } = this.data;
    this.setData({ loading: true });
    const res = await mallAPI.getItems({ categoryId: currentCategory, keyword: keyword?.trim() || undefined, orderBy });
    if (res.code === 200) {
      const raw = res.data || [];
      const list = raw.length > maxRender ? raw.slice(0, maxRender) : raw;
      this.setData({ list, listTotal: raw.length, loading: false });
    } else this.setData({ loading: false });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadList();
  },

  onOrderChange(e) {
    const orderBy = e.currentTarget.dataset.order;
    this.setData({ orderBy });
    this.loadList();
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ currentCategory: id });
    this.loadList();
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: mallDetailUrl(id) });
  },

  goPublish() {
    wx.navigateTo({ url: mallPublishUrl() });
  },
});
