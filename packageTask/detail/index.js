import { getTaskDetail, claimTask, submitComplete, confirmComplete, cancelTask } from '~/mock/task/api';
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
    id: '',
    task: null,
    loading: true,
    STATUS_TEXT,
    proofText: '',
    isPublisher: false,
    isTaker: false,
  },

  onLoad(options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await getTaskDetail(id);
    if (res.code !== 200 || !res.data) {
      this.setData({ loading: false });
      return;
    }
    const task = res.data;
    const app = getApp();
    const uid = (app.globalData && app.globalData.userId) || 'user1';
    const isPublisher = task.publisherId === uid;
    const isTaker = task.takerId === uid;
    this.setData({ task, loading: false, isPublisher, isTaker });
  },

  onClaim() {
    const { id } = this.data;
    wx.showModal({
      title: '确认领取',
      content: '领取后将由您完成该任务，确定领取吗？',
      success: (res) => {
        if (!res.confirm) return;
        claimTask(id, '我').then((r) => {
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
    submitComplete(id, text, []).then((r) => {
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
        confirmComplete(id).then((r) => {
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
        cancelTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已取消' });
            wx.navigateBack();
          }
        });
      },
    });
  },
});
