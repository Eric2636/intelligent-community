import { mallAPI } from '~/api/cloud';
import { mallDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadList();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    if (redirectIfEntryHidden('mall')) return;
    this.setData({ loading: true });
    const res = await mallAPI.getMyFavoriteItems();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
    else this.setData({ loading: false });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: mallDetailUrl(id) });
  },
});
