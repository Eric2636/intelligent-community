import { getMyPublished, getMyTaken } from '~/mock/task/api';
import { STATUS } from '~/mock/task/api';

const STATUS_TEXT = {
  [STATUS.PENDING_TAKE]: '待领取',
  [STATUS.IN_PROGRESS]: '进行中',
  [STATUS.PENDING_CONFIRM]: '待确认',
  [STATUS.COMPLETED]: '已完成',
  [STATUS.CANCELLED]: '已取消',
};

Page({
  data: {
    tab: 'published', // published | taken
    publishedList: [],
    takenList: [],
    loading: true,
    STATUS_TEXT,
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  async loadAll() {
    this.setData({ loading: true });
    const [pub, taken] = await Promise.all([getMyPublished(), getMyTaken()]);
    this.setData({
      publishedList: (pub.code === 200 ? pub.data : []) || [],
      takenList: (taken.code === 200 ? taken.data : []) || [],
      loading: false,
    });
  },

  onTabChange(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageTask/detail/index?id=${id}` });
  },
});
