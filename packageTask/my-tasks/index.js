import { taskAPI } from '~/api/cloud';

const STATUS_TEXT = {
  0: '待领取',
  1: '进行中',
  2: '待确认',
  3: '已完成',
  4: '已取消',
};

Page({
  data: {
    tabs: [
      { label: '我发布的', value: 'published' },
      { label: '我领取的', value: 'taken' },
    ],
    activeTab: 'published',
    publishedList: [],
    takenList: [],
    loading: true,
    STATUS_TEXT,
  },

  onLoad() {
    this.loadTasks();
  },

  onShow() {
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh());
  },

  onTabChange(e) {
    const { value } = e.detail;
    this.setData({ activeTab: value });
    this.loadTasks();
  },

  async loadTasks() {
    const { activeTab } = this.data;
    this.setData({ loading: true });

    if (activeTab === 'published') {
      const res = await taskAPI.getMyPublished();
      if (res.code === 200) {
        this.setData({ publishedList: res.data || [], loading: false });
      }
    } else {
      const res = await taskAPI.getMyTaken();
      if (res.code === 200) {
        this.setData({ takenList: res.data || [], loading: false });
      }
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },
});
