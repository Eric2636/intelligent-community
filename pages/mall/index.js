import { getCategories, getItemList } from '~/mock/mall/api';

Page({
  data: {
    categories: [],
    currentCategory: 'all',
    list: [],
    loading: true,
  },

  onLoad() {
    this.loadCategories();
    this.loadList();
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadList()]).then(() => wx.stopPullDownRefresh());
  },

  async loadCategories() {
    const res = await getCategories();
    if (res.code === 200) this.setData({ categories: res.data || [] });
  },

  async loadList() {
    const { currentCategory } = this.data;
    this.setData({ loading: true });
    const res = await getItemList(currentCategory);
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ currentCategory: id });
    this.setData({ loading: true });
    getItemList(id).then((res) => {
      if (res.code === 200) this.setData({ list: res.data || [], loading: false });
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageMall/detail/index?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/packageMall/publish/index' });
  },
});
