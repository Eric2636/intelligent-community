import { taskAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';

Page({
  data: {
    list: [],
    listTotal: 0,
    loading: true,
    keyword: '',
    maxRender: 50, // 长列表仅渲染前 50 条，减少卡顿
  },

  onLoad() {
    if (redirectIfEntryHidden('task')) return;
    this.loadList();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('task')) return;
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await taskAPI.getTaskList({ keyword: this.data.keyword?.trim() || undefined });
      if (res.code === 200) {
        const raw = res.data || [];
        const normalized = raw.map((t) => ({
          ...t,
          id: t._id || t.id,
          images: Array.isArray(t.images) ? t.images : [],
          videos: Array.isArray(t.videos) ? t.videos : [],
        }));
        const list = normalized.length > this.data.maxRender ? normalized.slice(0, this.data.maxRender) : normalized;
        this.setData({ list, listTotal: raw.length, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载任务列表失败', err);
      this.setData({ loading: false });
    }
  },

  onPreviewListImages(e) {
    const { cardIndex, current } = e.currentTarget.dataset;
    const list = this.data.list;
    const item = list[Number(cardIndex)];
    if (!item || !item.images || !item.images.length) return;
    wx.previewImage({
      current: current || item.images[0],
      urls: item.images,
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/packageTask/publish/index' });
  },
});
