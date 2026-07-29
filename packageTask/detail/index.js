import { taskAPI } from '~/api/cloud';
import { config } from '~/config/index';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { ensureMutationReady } from '~/utils/authIdentity';
import { normalizeAvatar } from '~/utils/defaultAvatar';
import { chooseAndUploadMedia } from '~/utils/cloudMedia';

const STATUS_TEXT = {
  draft: '草稿',
  pending_take: '待领取',
  in_progress: '进行中',
  pending_confirm: '待确认',
  completed: '已完成',
  cancelled: '已取消',
};

function firstUrl(list) {
  return Array.isArray(list) && list.length ? String(list[0] || '') : '';
}

function withImage(payload, imageUrl) {
  return imageUrl ? { ...payload, imageUrl } : payload;
}

Page({
  data: {
    id: '',
    task: null,
    loading: true,
    STATUS_TEXT,
    proofText: '',
    proofImages: [],
    proofUploading: false,
    isPublisher: false,
    isTaker: false,
    otherPartyId: '',
    otherPartyName: '',
    showRating: false,
    ratingScore: 5,
    ratingComment: '',
    proofFocus: false,
    showProofEmojiPanel: false,
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

  onPreviewProofImages(e) {
    const { current } = e.currentTarget.dataset;
    const urls = (this.data.task && this.data.task.proofImages) || [];
    if (!urls.length) return;
    wx.previewImage({ current, urls });
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    try {
      const res = await taskAPI.getTaskDetail(id);
      if (res.code !== 200 || !res.data) {
        wx.showToast({ title: (res && res.message) || '获取任务详情失败', icon: 'none' });
        return;
      }
      const raw = res.data;
      const task = {
        ...raw,
        publisherAvatar: normalizeAvatar(raw.publisherAvatar),
        takerAvatar: normalizeAvatar(raw.takerAvatar),
        images: Array.isArray(raw.images) ? raw.images : [],
        videos: Array.isArray(raw.videos) ? raw.videos : [],
        proofImages: Array.isArray(raw.proofImages) ? raw.proofImages : [],
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
      const editableProof =
        isTaker && task.status === 'in_progress'
          ? {
              proofText: task.proofText || '',
              proofImages: [...task.proofImages],
            }
          : {};
      this.setData({ task, isPublisher, isTaker, otherPartyId, otherPartyName, ...editableProof });
    } catch (err) {
      console.error('加载任务详情失败', err);
      wx.showToast({ title: (err && (err.message || err.errMsg)) || '获取任务详情失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onShareAppMessage() {
    const { id, task } = this.data;
    const title = task
      ? `${task.title || '业主互助'}｜感谢金 ${task.reward || '0'}`
      : '业主互助';
    return withImage(
      {
        title,
        path: `/packageTask/detail/index?id=${encodeURIComponent(id || '')}`,
      },
      firstUrl(task && task.images),
    );
  },

  onShareTimeline() {
    const { id, task } = this.data;
    const title = task
      ? `${task.title || '业主互助'}｜感谢金 ${task.reward || '0'}`
      : '业主互助';
    return withImage(
      {
        title,
        query: `id=${encodeURIComponent(id || '')}`,
      },
      firstUrl(task && task.images),
    );
  },

  async onClaim() {
    if (!(await ensureMutationReady(this))) return;
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
  onTaskEmojiHint() {
    this.setData({
      showProofEmojiPanel: !this.data.showProofEmojiPanel,
      proofFocus: false,
    });
  },
  onProofEmojiSelect(e) {
    const emoji = e.detail && e.detail.emoji ? e.detail.emoji : '';
    if (!emoji) return;
    this.setData({
      proofText: `${this.data.proofText || ''}${emoji}`,
    });
  },

  async onAddProofImages() {
    if (this._proofUploadInFlight) return;
    this._proofUploadInFlight = true;
    this.setData({ proofUploading: true });
    try {
      if (!(await ensureMutationReady(this)) || this._authPageAlive === false) return;
      const current = Array.isArray(this.data.proofImages) ? [...this.data.proofImages] : [];
      const result = await chooseAndUploadMedia({
        folder: 'task/proof',
        maxImages: 9,
        maxVideos: 0,
        existingImageCount: current.length,
        existingVideoCount: 0,
      });
      if (this._authPageAlive === false) return;
      this.setData({ proofImages: [...current, ...(result.images || [])] });
    } catch (_) {
      // 上传工具已提示错误；保留已有凭证图片，方便重试。
    } finally {
      this._proofUploadInFlight = false;
      if (this._authPageAlive !== false) this.setData({ proofUploading: false });
    }
  },

  onRemoveProofImage(e) {
    if (this._proofUploadInFlight) return;
    const index = Number(e.currentTarget.dataset.index);
    const proofImages = (this.data.proofImages || []).filter((_, i) => i !== index);
    this.setData({ proofImages });
  },

  onPreviewEditableProofImages(e) {
    const { current } = e.currentTarget.dataset;
    const urls = this.data.proofImages || [];
    if (urls.length) wx.previewImage({ current, urls });
  },

  async onSubmitComplete() {
    if (!(await ensureMutationReady(this))) return;
    const { id, proofText, proofImages, proofUploading } = this.data;
    if (proofUploading || this._proofUploadInFlight) return;
    const text = (proofText || '').trim();
    const images = Array.isArray(proofImages) ? proofImages : [];
    if (!text && images.length === 0) {
      wx.showToast({ title: '请填写完成说明或上传图片', icon: 'none' });
      return;
    }
    taskAPI.submitComplete(id, text, images).then((r) => {
      if (r.code === 200) {
        wx.showToast({ title: '已提交' });
        this.setData({ showProofEmojiPanel: false });
        this.loadDetail();
      }
    });
  },

  async onConfirmComplete() {
    if (!(await ensureMutationReady(this))) return;
    const { id, task } = this.data;
    const reward = (task && task.reward) ? String(task.reward) : '0';
    const usePayment = config.enableTaskPayment;
    wx.showModal({
      title: '确认完成',
      content: usePayment
        ? `需支付感谢金 ${reward} 元给接单人。将调起微信支付，支付成功后任务自动完成。`
        : `确认后任务完成，请线下支付感谢金 ${reward} 元给接单人。`,
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
            content: '当前未配置支付商户号，可先线下支付感谢金给接单人，再点击确认完成。是否确认完成？',
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

  async onRejectComplete() {
    if (this._rejectInFlight) return;
    this._rejectInFlight = true;
    try {
      if (!(await ensureMutationReady(this)) || this._authPageAlive === false) return;
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '驳回完成',
          content: '确认驳回本次完成提交吗？上次凭证会保留，接单人可修改后重新提交。',
          confirmText: '确认驳回',
          confirmColor: '#d54941',
          success: (res) => resolve(Boolean(res.confirm)),
          fail: () => resolve(false),
        });
      });
      if (!confirmed || this._authPageAlive === false) return;
      const { id } = this.data;
      const res = await taskAPI.rejectComplete(id);
      if (this._authPageAlive === false) return;
      if (res.code === 200) {
        wx.showToast({ title: '已驳回', icon: 'success' });
        await this.loadDetail();
      } else {
        wx.showToast({ title: res.message || '驳回失败', icon: 'none' });
      }
    } catch (err) {
      if (this._authPageAlive !== false) {
        wx.showToast({
          title: (err && (err.message || err.errMsg)) || '驳回失败',
          icon: 'none',
        });
      }
    } finally {
      this._rejectInFlight = false;
    }
  },

  async onCancel() {
    if (this._cancelInFlight) return;
    this._cancelInFlight = true;
    try {
      if (!(await ensureMutationReady(this)) || this._authPageAlive === false) return;
      const taskStatus = this.data.task && this.data.task.status;
      const assigned = ['in_progress', 'pending_confirm'].includes(taskStatus);
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: assigned ? '取消任务' : '撤销发布',
          content: assigned
            ? '任务已有接单人，取消后将通知对方。确定继续吗？'
            : '撤销后该任务将不再可领取，确定继续吗？',
          confirmText: assigned ? '确认取消' : '确认撤销',
          confirmColor: '#d54941',
          success: (res) => resolve(Boolean(res.confirm)),
          fail: () => resolve(false),
        });
      });
      if (!confirmed || this._authPageAlive === false) return;
      const result = await taskAPI.cancelTask(this.data.id);
      if (this._authPageAlive === false) return;
      if (result.code === 200) {
        wx.showToast({ title: assigned ? '任务已取消' : '已撤销', icon: 'success' });
        await this.loadDetail();
      } else {
        wx.showToast({ title: result.message || '取消失败', icon: 'none' });
      }
    } catch (err) {
      if (this._authPageAlive !== false) {
        wx.showToast({
          title: (err && (err.message || err.errMsg)) || '取消失败',
          icon: 'none',
        });
      }
    } finally {
      this._cancelInFlight = false;
    }
  },

  async onRepublish() {
    if (!(await ensureMutationReady(this))) return;
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

  async onDeleteTask() {
    if (!(await ensureMutationReady(this))) return;
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

  async onAbandon() {
    if (!(await ensureMutationReady(this))) return;
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

  async onPublishDraft() {
    if (!(await ensureMutationReady(this))) return;
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
    if (!(await ensureMutationReady(this))) return;
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

  onUnload() {
    this._authPageAlive = false;
    this._rejectInFlight = false;
    this._cancelInFlight = false;
    this._proofUploadInFlight = false;
  },
});
