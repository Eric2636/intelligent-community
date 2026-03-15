import { mallAPI } from '~/api/cloud';

Page({
  data: {
    tab: 'buy', // buy | sell
    buyList: [],
    sellList: [],
    loading: true,
  },

  onLoad() {
    this.loadOrders();
  },

  onShow() {
    this.loadOrders();
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
  },

  async loadOrders() {
    this.setData({ loading: true });
    const res = await mallAPI.getMyOrders();
    if (res.code === 200 && res.data) {
      this.setData({
        buyList: res.data.buy || [],
        sellList: res.data.sell || [],
        loading: false,
      });
    } else {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageMall/order-detail/index?id=${id}` });
  },
});
