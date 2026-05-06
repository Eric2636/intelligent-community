import { mallAPI } from '~/api/cloud';
import { mallDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

Page({
  data: {
    itemList: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadItems();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadItems();
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh());
  },

  async loadItems() {
    if (redirectIfEntryHidden('mall')) return;
    this.setData({ loading: true });
    const res = await mallAPI.getMyItems();
    if (res.code === 200) {
      this.setData({ itemList: res.data || [], loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: mallDetailUrl(id) });
  },
});
