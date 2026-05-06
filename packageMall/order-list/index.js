import { mallAPI } from '~/api/cloud';
import { mallOrderDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

Page({
  data: {
    tab: 'buy', // buy | sell
    buyList: [],
    sellList: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadOrders();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadOrders();
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
  },

  async loadOrders() {
    if (redirectIfEntryHidden('mall')) return;
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
    wx.navigateTo({ url: mallOrderDetailUrl(id) });
  },
});
