import { mallAPI } from '~/api/cloud';
import { mallDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';

Page({
  data: {
    itemList: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this._skipNextShowRefresh = true;
    this.loadItems();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    if (consumeListRefresh(LIST_REFRESH_KEYS.mallMine)) this.loadItems();
  },

  onPullDownRefresh() {
    this.loadItems().then(() => wx.stopPullDownRefresh());
  },

  onAuthorized() {
    this.setData({ authReady: true, showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadItems();
  },

  async loadItems() {
    if (redirectIfEntryHidden('mall')) return;
    if (!(await ensureMutationReady(this))) {
      this.setData({ loading: false });
      return;
    }
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

  onUnload() {
    this._authPageAlive = false;
  },
});
