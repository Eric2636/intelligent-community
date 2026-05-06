import { taskAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

const STATUS_TEXT = {
  pending_take: '待领取',
  in_progress: '进行中',
  pending_confirm: '待确认',
  completed: '已完成',
  cancelled: '已取消',
};

function normalizeTaskRow(item) {
  if (!item) return item;
  const id = item.id != null ? String(item.id) : (item._id != null ? String(item._id) : '');
  const status = item.status || 'pending_take';
  return {
    ...item,
    id,
    status,
    statusLabel: STATUS_TEXT[status] || status,
    images: Array.isArray(item.images) ? item.images : [],
    videos: Array.isArray(item.videos) ? item.videos : [],
    desc: item.desc || '',
    location: item.location || '',
  };
}

Page({
  data: {
    activeTab: 'published',
    publishedList: [],
    takenList: [],
    loading: true,
    loadingProps: { size: '40rpx' },
  },

  onLoad() {
    if (redirectIfEntryHidden('task')) return;
    this.loadTasks();
  },

  onShow() {
    if (redirectIfEntryHidden('task')) return;
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh());
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.loadTasks());
  },

  async loadTasks() {
    if (redirectIfEntryHidden('task')) return;
    const { activeTab } = this.data;
    this.setData({ loading: true });
    try {
      const type = activeTab === 'taken' ? 'taken' : 'published';
      const res = await taskAPI.getMyTasks(type);
      if (res.code === 200) {
        const raw = res.data || [];
        const list = raw.map(normalizeTaskRow);
        if (activeTab === 'published') {
          this.setData({ publishedList: list, loading: false });
        } else {
          this.setData({ takenList: list, loading: false });
        }
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载我的任务失败', err);
      this.setData({ loading: false });
    }
  },

  onPreviewListImages(e) {
    const { kind, cardIndex, current } = e.currentTarget.dataset;
    const list = kind === 'taken' ? this.data.takenList : this.data.publishedList;
    const item = list[Number(cardIndex)];
    if (!item || !item.images || !item.images.length) return;
    wx.previewImage({
      current: current || item.images[0],
      urls: item.images,
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },
});
