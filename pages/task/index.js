import { taskAPI } from '~/api/cloud';

Page({
  data: {
    list: [],
    listTotal: 0,
    loading: true,
    keyword: '',
    maxRender: 50, // 长列表仅渲染前 50 条，减少卡顿
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
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
        const list = raw.length > this.data.maxRender ? raw.slice(0, this.data.maxRender) : raw;
        this.setData({ list, listTotal: raw.length, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载任务列表失败', err);
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/packageTask/publish/index' });
  },
});
