import { mallAPI } from '~/api/cloud';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    const res = await mallAPI.getMyFavoriteItems();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
    else this.setData({ loading: false });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageMall/detail/index?id=${id}` });
  },
});
