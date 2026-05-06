import { taskAPI } from '~/api/cloud';
import { config } from '~/config';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';

const STATUS_TEXT = {
  draft: '草稿',
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
    if (redirectIfEntryHidden('task')) return;
    this.setData({ id: options.id });
    this.loadDetail();
  },

  onShow() {
    if (redirectIfEntryHidden('task')) return;
    // 返回该页面时可能登录态/任务状态变化，刷新一次
    this.loadDetail();
  },

  onPreviewTaskImages(e) {
    const { current } = e.currentTarget.dataset;
    const urls = (this.data.task && this.data.task.images) || [];
    if (!urls.length) return;
    wx.previewImage({ current, urls });
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await taskAPI.getTaskDetail(id);
    if (res.code !== 200 || !res.data) {
      this.setData({ loading: false });
      return;
    }
    const raw = res.data;
    const task = {
      ...raw,
      images: Array.isArray(raw.images) ? raw.images : [],
      videos: Array.isArray(raw.videos) ? raw.videos : [],
    };
    const app = getApp();
    const me = (app.globalData && app.globalData.userInfo) || null;
    const myUserId = me && me.id ? String(me.id) : '';
    const myOpenid = me && me.openid ? String(me.openid) : '';
    // 自建后端优先用 userId（JWT sub），兼容历史云开发 openid 字段
    const isPublisher =
      (myUserId && String(task.publisherId || '') === myUserId) ||
      (myOpenid && String(task.publisherOpenid || '') === myOpenid);
    const isTaker =
      (myUserId && String(task.takerId || '') === myUserId) ||
      (myOpenid && String(task.takerOpenid || '') === myOpenid);
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
          } else {
            wx.showToast({ title: r.message || '领取失败', icon: 'none' });
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
    const { id, task } = this.data;
    const reward = (task && task.reward) ? String(task.reward) : '0';
    const usePayment = config.enableTaskPayment;
    wx.showModal({
      title: '确认完成',
      content: usePayment
        ? `需支付赏金 ¥${reward} 元给接单人。将调起微信支付，支付成功后任务自动完成。`
        : `确认后任务完成，请线下支付赏金 ¥${reward} 元给接单人。`,
      success: async (res) => {
        if (!res.confirm) return;
        if (!usePayment) {
          taskAPI.confirmComplete(id).then((r) => {
            if (r.code === 200) {
              wx.showToast({ title: '已确认完成' });
              this.loadDetail();
            } else {
              wx.showToast({ title: r.message || '操作失败', icon: 'none' });
            }
          });
          return;
        }
        wx.showLoading({ title: '请稍候...' });
        const payRes = await taskAPI.createTaskPayment(id, config.cloudEnvId);
        wx.hideLoading();
        if (payRes.code === 200 && payRes.data && payRes.data.payment) {
          wx.requestPayment({
            ...payRes.data.payment,
            success: () => {
              wx.showToast({ title: '支付成功，任务已完成', icon: 'success' });
              setTimeout(() => this.loadDetail(), 1500);
            },
            fail: (err) => {
              if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
                wx.showToast({ title: '已取消支付', icon: 'none' });
              } else {
                wx.showToast({ title: err.errMsg || '支付失败', icon: 'none' });
              }
            },
          });
          return;
        }
        const msg = payRes.message || '无法创建支付单';
        if (payRes.code === 500 && (msg.indexOf('未配置') !== -1 || msg.indexOf('商户') !== -1)) {
          wx.showModal({
            title: '未开通在线支付',
            content: '当前未配置支付商户号，可先线下支付赏金给接单人，再点击确认完成。是否确认完成？',
            success: (m) => {
              if (!m.confirm) return;
              taskAPI.confirmComplete(id).then((r) => {
                if (r.code === 200) {
                  wx.showToast({ title: '已确认完成' });
                  this.loadDetail();
                } else {
                  wx.showToast({ title: r.message || '操作失败', icon: 'none' });
                }
              });
            },
          });
        } else {
          wx.showToast({ title: msg, icon: 'none' });
        }
      },
    });
  },

  onCancel() {
    const { id } = this.data;
    wx.showModal({
      title: '撤销发布',
      content: '确定要撤销发布该任务吗？撤销后该任务将不再可领取。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.cancelTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已撤销' });
            this.loadDetail();
          }
        });
      },
    });
  },

  onRepublish() {
    const { id } = this.data;
    wx.showModal({
      title: '重新发布',
      content: '确定要重新发布该任务吗？重新发布后其他人将可以领取。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.republishTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已重新发布' });
            this.loadDetail();
          } else wx.showToast({ title: r.message || '操作失败', icon: 'none' });
        });
      },
    });
  },

  onDeleteTask() {
    const { id } = this.data;
    wx.showModal({
      title: '删除任务',
      content: '确定要删除该任务吗？删除后不可恢复。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.deleteTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已删除' });
            wx.navigateBack();
          } else wx.showToast({ title: r.message || '删除失败', icon: 'none' });
        });
      },
    });
  },

  onAbandon() {
    const { id } = this.data;
    wx.showModal({
      title: '放弃任务',
      content: '确定要放弃该任务吗？放弃后任务将重新回到待领取。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.abandonTask(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已放弃' });
            this.loadDetail();
          } else wx.showToast({ title: r.message || '操作失败', icon: 'none' });
        });
      },
    });
  },

  onPublishDraft() {
    const { id } = this.data;
    wx.showModal({
      title: '发布任务',
      content: '确定要发布该草稿吗？发布后其他人将可以领取。',
      success: (res) => {
        if (!res.confirm) return;
        taskAPI.publishDraft(id).then((r) => {
          if (r.code === 200) {
            wx.showToast({ title: '已发布' });
            this.loadDetail();
          } else wx.showToast({ title: r.message || '发布失败', icon: 'none' });
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
