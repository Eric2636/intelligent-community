import { mallAPI } from '~/api/cloud';

Page({
  data: {
    itemList: [],
    loading: true,
  },

  onLoad() {
    this.loadItems();
  },

  onShow() {
    this.loadItems();
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh());
  },

  async loadItems() {
    this.setData({ loading: true });
    const res = await mallAPI.getMyItems();
    if (res.code === 200) {
      this.setData({ itemList: res.data || [], loading: false });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageMall/detail/index?id=${id}` });
  },
});
