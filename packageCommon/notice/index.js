import { commonAPI } from '~/api/cloud';

Page({
  data: {
    noticeList: [],
    loading: true,
  },

  onLoad() {
    this.loadNotices();
  },

  async loadNotices() {
    this.setData({ loading: true });
    try {
      const res = await commonAPI.getNotifications();
      if (res.code === 200) {
        this.setData({ noticeList: res.data || [], loading: false });
      } else {
        this.setData({ noticeList: [], loading: false });
      }
    } catch (err) {
      console.error('加载通知失败', err);
      this.setData({ noticeList: [], loading: false });
    }
  },

  onNoticeTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({
      title: '查看详情',
      icon: 'none',
    });
  },

  onPullDownRefresh() {
    this.loadNotices().then(() => wx.stopPullDownRefresh());
  },
});
