import { errandAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

function normalizeItem(item) {
  if (!item) return item;
  const status = item.status || 'pending_take';
  const statusText =
    item.statusText ||
    (status === 'pending_take' ? '待领取' : status === 'in_progress' ? '进行中' : status === 'completed' ? '已完成' : '待领取');
  return {
    ...item,
    status,
    statusText,
  };
}

Page({
  data: {
    postList: [],
    loading: true,
    activeRole: 'published',
    emptyText: '暂无发布的跑腿',
    loadingProps: { size: '40rpx' },
  },

  onLoad() {
    if (redirectIfEntryHidden('errand')) return;
    this.loadPosts();
  },

  onShow() {
    if (redirectIfEntryHidden('errand')) return;
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  onRoleTab(e) {
    const role = e.currentTarget.dataset.role;
    if (!role || role === this.data.activeRole) return;
    const emptyText = role === 'claimed' ? '暂无领取的跑腿' : '暂无发布的跑腿';
    this.setData({ activeRole: role, emptyText, postList: [] }, () => this.loadPosts());
  },

  async loadPosts() {
    if (redirectIfEntryHidden('errand')) return;
    this.setData({ loading: true });
    try {
      const res = await errandAPI.getMyErrands({ role: this.data.activeRole });
      if (res.code === 200) {
        const list = (res.data || []).map(normalizeItem);
        this.setData({ postList: list, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载我的跑腿失败', err);
      this.setData({ loading: false });
    }
  },

  goPost(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/packageErrand/detail/index?id=${id}` });
  },
});
