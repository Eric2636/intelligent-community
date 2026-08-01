import { mallAPI } from '~/api/cloud';
import { mallDetailUrl, mallPublishUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '~/utils/listMutation';

Page({
  data: {
    itemList: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
    ownerActionVisible: false,
    ownerActionLoading: false,
    actionItem: null,
    ownerActions: [],
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
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.mallMine);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadItems({ silent: true });
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

  async loadItems({ silent = false } = {}) {
    if (redirectIfEntryHidden('mall')) return;
    if (!(await ensureMutationReady(this))) {
      if (!silent) this.setData({ loading: false });
      return;
    }
    if (!silent) this.setData({ loading: true });
    const res = await mallAPI.getMyItems();
    if (res.code === 200) {
      this.setData({ itemList: res.data || [], loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    navigateToWithListMutation(this, mallDetailUrl(id), 'itemList');
  },

  onOpenOwnerActions(e) {
    if (this.data.ownerActionLoading) return;
    const { id } = e.currentTarget.dataset;
    const actionItem = this.data.itemList.find((item) => (item.id || item._id) === id);
    if (!actionItem) return;
    const isOnline = actionItem.visibility === 'ONLINE';
    this.setData({
      actionItem,
      ownerActionVisible: true,
      ownerActions: [
        { label: '编辑', value: 'edit', icon: 'edit-1' },
        { label: isOnline ? '隐藏信息' : '公开信息', value: 'visibility', icon: isOnline ? 'browse-off' : 'browse' },
        { label: '删除', value: 'delete', icon: 'delete-1', color: '#d54941' },
      ],
    });
  },

  onOwnerActionVisibleChange(e) {
    this.setData({ ownerActionVisible: Boolean(e.detail && e.detail.visible) });
  },

  onOwnerActionClose() {
    this.setData({ ownerActionVisible: false });
  },

  replaceActionItem(nextItem) {
    const id = nextItem && (nextItem.id || nextItem._id);
    if (!id) return;
    this.setData({
      itemList: this.data.itemList.map((item) => ((item.id || item._id) === id ? nextItem : item)),
      actionItem: nextItem,
    });
  },

  async onOwnerActionSelected(e) {
    const action = e.detail && e.detail.selected && e.detail.selected.value;
    const item = this.data.actionItem;
    this.setData({ ownerActionVisible: false });
    if (!item) return;
    const id = item.id || item._id;
    if (action === 'edit') {
      wx.navigateTo({
        url: mallPublishUrl(id),
        events: { listMutation: (mutation) => this.replaceActionItem(mutation && mutation.data) },
      });
      return;
    }
    if (action === 'visibility') await this.toggleVisibility(item);
    if (action === 'delete') this.confirmDeleteItem(item);
  },

  async toggleVisibility(item) {
    if (this.data.ownerActionLoading) return;
    const id = item.id || item._id;
    const visibility = item.visibility === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    this.setData({ ownerActionLoading: true });
    try {
      const res = await mallAPI.setItemVisibility(id, visibility);
      if (res.code !== 200) throw new Error(res.message || '操作失败');
      this.replaceActionItem({ ...item, ...(res.data || {}), visibility });
      wx.showToast({ title: visibility === 'ONLINE' ? '已公开' : '已隐藏', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ ownerActionLoading: false });
    }
  },

  confirmDeleteItem(item) {
    if (this.data.ownerActionLoading) return;
    const id = item.id || item._id;
    wx.showModal({
      title: '删除信息',
      content: '删除后无法恢复，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#d54941',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ ownerActionLoading: true });
        try {
          const res = await mallAPI.deleteItem(id);
          if (res.code !== 200) throw new Error(res.message || '删除失败');
          this.setData({ itemList: this.data.itemList.filter((entry) => (entry.id || entry._id) !== id) });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          this.setData({ ownerActionLoading: false });
        }
      },
    });
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
