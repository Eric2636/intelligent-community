import { taskAPI } from '~/api/cloud';

const STATUS_TEXT = {
  pending_take: '待领取',
  in_progress: '进行中',
  pending_confirm: '待确认',
  completed: '已完成',
  cancelled: '已取消',
};

Page({
  data: {
    id: '',
    task: null,
    loading: true,
    STATUS_TEXT,
    proofText: '',
    isPublisher: false,
    isTaker: false,
    otherPartyId: '',
    otherPartyName: '',
    showRating: false,
    ratingScore: 5,
    ratingComment: '',
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await taskAPI.getTaskDetail(id);
    if (res.code !== 200 || !res.data) {
      this.setData({ loading: false });
      return;
    }
    const task = res.data;
    const app = getApp();
    const openid = (app.globalData && app.globalData.openid) || '';
    const isPublisher = (task.publisherId || task.publisherOpenid) === openid;
    const isTaker = (task.takerId || task.takerOpenid) === openid;
    const otherPartyId = isPublisher ? task.takerId : task.publisherId;
    const otherPartyName = isPublisher ? task.takerName : task.publisherName;
    this.setData({ task, loading: false, isPublisher, isTaker, otherPartyId, otherPartyName });
  },

  onClaim() {
    const { id } = this.data;
    wx.showModal({
      title: '确认领取',
      content: '领取后将由您完成该任务，确定领取吗？',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.claimTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '领取成功' });
            this.loadDetail();
          }
        });
      },
    });
  },

  onProofInput(e) {
    this.setData({ proofText: e.detail.value });
  },

  onSubmitComplete() {
    const { id, proofText } = this.data;
    const text = (proofText || '').trim();
    if (!text) {
      wx.showToast({ title: '请填写完成说明', icon: 'none' });
      return;
    }
    taskAPI.submitComplete(id, text).then((r) => {
      if (r.code === 200) {
        wx.showToast({ title: '已提交' });
        this.loadDetail();
      }
    });
  },

  onConfirmComplete() {
    const { id } = this.data;
    wx.showModal({
      title: '确认完成',
      content: '确认后任务完成，请线下支付佣金给接单人。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.confirmComplete(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已确认完成' });
            this.loadDetail();
          }
        });
      },
    });
  },

  onCancel() {
    const { id } = this.data;
    wx.showModal({
      title: '取消任务',
      content: '确定要取消该任务吗？',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.cancelTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已取消' });
            wx.navigateBack();
          }
        });
      },
    });
  },

  onOpenRating() {
    this.setData({ showRating: true });
  },

  onCloseRating() {
    this.setData({ showRating: false });
  },

  onRatingStar(e) {
    const score = Number(e.currentTarget.dataset.score) || 5;
    this.setData({ ratingScore: score });
  },

  onRatingComment(e) {
    this.setData({ ratingComment: e.detail.value });
  },

  async onSubmitRating() {
    const { id, task, otherPartyId, ratingScore, ratingComment } = this.data;
    if (!otherPartyId) return wx.showToast({ title: '无法评价', icon: 'none' });
    const res = await taskAPI.submitRating({
      taskId: id,
      toUserId: otherPartyId,
      rating: ratingScore,
      comment: ratingComment,
    });
    if (res.code === 200) {
      wx.showToast({ title: '评价成功' });
      this.setData({ showRating: false, ratingScore: 5, ratingComment: '' });
      this.loadDetail();
    } else {
      wx.showToast({ title: res.message || '评价失败', icon: 'none' });
    }
  },
});
