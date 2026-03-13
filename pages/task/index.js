import { getTaskList } from '~/mock/task/api';

Page({
  data: {
    list: [],
    loading: true,
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

  async loadList() {
    this.setData({ loading: true });
    const res = await getTaskList();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },

  goPublish() {
    wx.navigateTo({ url: '/packageTask/publish/index' });
  },
});
