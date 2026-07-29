import { commonAPI } from '~/api/cloud';
import { ensureMutationReady } from '~/utils/authIdentity';

function countFeedbackCodePoints(value) {
  return Array.from(String(value || '')).length;
}

Page({
  data: {
    content: '',
    contentLength: 0,
    submitting: false,
  },

  onLoad() {
    this._feedbackPageAlive = true;
    this._feedbackNavigationTimer = null;
    this._submitInFlight = false;
  },

  onContentInput(e) {
    const content = String((e.detail && e.detail.value) || '');
    this.setData({
      content,
      contentLength: countFeedbackCodePoints(content.trim()),
    });
  },

  onAuthorized() {
    if (!this._feedbackPageAlive) return;
    wx.showToast({ title: '登录成功，请再次点击提交', icon: 'none' });
  },

  releaseSubmitLock() {
    this._submitInFlight = false;
    if (this._feedbackPageAlive && this.data.submitting) {
      this.setData({ submitting: false });
    }
  },

  navigateBackAfterSubmit() {
    let settled = false;
    const settle = (failed) => {
      if (settled) return;
      settled = true;
      if (this._feedbackNavigationTimer != null) {
        clearTimeout(this._feedbackNavigationTimer);
        this._feedbackNavigationTimer = null;
      }
      this.releaseSubmitLock();
      if (failed && this._feedbackPageAlive) {
        wx.showToast({ title: '反馈已提交，请手动返回', icon: 'none' });
      }
    };
    try {
      this._feedbackNavigationTimer = setTimeout(() => {
        this._feedbackNavigationTimer = null;
        settle(true);
      }, 1500);
      wx.navigateBack({
        success: () => settle(false),
        fail: () => settle(true),
        complete: () => settle(false),
      });
    } catch (err) {
      settle(true);
    }
  },

  async submit() {
    if (this._submitInFlight) return;
    this._submitInFlight = true;
    let keepLockedForNavigation = false;
    try {
      if (!(await ensureMutationReady(this))) return;
      if (!this._feedbackPageAlive) return;
      const content = String(this.data.content || '').trim();
      const contentLength = countFeedbackCodePoints(content);
      if (!content) {
        wx.showToast({ title: '请输入反馈内容', icon: 'none' });
        return;
      }
      if (contentLength > 500) {
        wx.showToast({ title: '反馈内容不能超过500个字符', icon: 'none' });
        return;
      }
      this.setData({ submitting: true });
      const res = await commonAPI.submitFeedback({
        content,
      });
      if (!this._feedbackPageAlive) return;
      if (res.code === 200) {
        this.setData({ content: '', contentLength: 0 });
        wx.showToast({
          title: '提交成功，感谢反馈',
          icon: 'success',
          duration: 1200,
        });
        const timerId = setTimeout(() => {
          if (this._feedbackNavigationTimer === timerId) {
            this._feedbackNavigationTimer = null;
          }
          if (!this._feedbackPageAlive) {
            this.releaseSubmitLock();
            return;
          }
          this.navigateBackAfterSubmit();
        }, 800);
        this._feedbackNavigationTimer = timerId;
        keepLockedForNavigation = true;
      } else {
        wx.showToast({
          title: res.message || '提交失败，请重试',
          icon: 'none',
        });
      }
    } catch (err) {
      if (this._feedbackPageAlive) {
        wx.showToast({
          title: '提交失败，请重试',
          icon: 'none',
        });
      }
    } finally {
      if (!keepLockedForNavigation) this.releaseSubmitLock();
    }
  },

  onUnload() {
    this._authPageAlive = false;
    this._feedbackPageAlive = false;
    if (this._feedbackNavigationTimer != null) {
      clearTimeout(this._feedbackNavigationTimer);
      this._feedbackNavigationTimer = null;
    }
    this.releaseSubmitLock();
  },
});
