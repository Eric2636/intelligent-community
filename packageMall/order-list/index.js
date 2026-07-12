import { mallAPI } from '~/api/cloud';
import { mallOrderDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';

Page({
  data: {
    tab: 'buy', // buy | sell
    buyList: [],
    sellList: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this._skipNextShowRefresh = true;
    this.loadOrders();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    if (consumeListRefresh(LIST_REFRESH_KEYS.mallOrders)) this.loadOrders();
  },

  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
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
