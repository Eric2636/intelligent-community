import { mallAPI } from '~/api/cloud';
import { mallDetailUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '~/utils/listMutation';

Page({
  data: {
    list: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this._skipNextShowRefresh = true;
    this.loadList();
  },

  onShow() {
    if (redirectIfEntryHidden('mall')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.mallFavorites);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadList({ silent: true });
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  onAuthorized() {
    this.setData({ authReady: true, showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadList();
  },

  async loadList({ silent = false } = {}) {
    if (redirectIfEntryHidden('mall')) return;
    if (!(await ensureMutationReady(this))) {
      if (!silent) this.setData({ loading: false });
      return;
    }
    if (!silent) this.setData({ loading: true });
    const res = await mallAPI.getMyFavoriteItems();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
    else this.setData({ loading: false });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    navigateToWithListMutation(
      this,
      mallDetailUrl(id),
      'list',
      undefined,
      (mutation) => mutation && mutation.data && mutation.data.isFavorited === false
        ? { type: 'remove', id: mutation.id }
        : mutation,
    );
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
