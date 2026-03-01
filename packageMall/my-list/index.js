import { getMyItems } from '~/mock/mall/api';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {},
  onShow() {
    this.loadList();
  },
  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    const res = await getMyItems();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageMall/detail/index?id=${id}` });
  },
});
