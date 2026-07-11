Page({
  data: {
    agreed: false,
    loggingIn: false,
    loginSuccess: false,
  },

  onShow() {
    const app = getApp();
    app.refreshLoginCode?.().catch((err) => {
      console.warn('[login] 预取 wx.login code 失败', err);
    });
    const token = wx.getStorageSync('access_token');
    const userInfo = app.globalData.userInfo || {};
    const hasPhone = Boolean(String(userInfo.phoneNumber || userInfo.phone || '').trim());
    if (token && hasPhone) {
      wx.switchTab({ url: '/pages/task/index' });
    }
  },

  onAgreementChange(e) {
    const agreed = Boolean(e.detail.checked);
    this.setData({ agreed });
  },

  openAgreement() {
    wx.navigateTo({ url: '/packageCommon/agreement/index' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/packageCommon/privacy/index' });
  },

  async onGetPhoneNumber(e) {
    if (this.data.loggingIn) return;
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }
    const detail = e.detail || {};
    if (detail.errMsg && !/ok/i.test(detail.errMsg)) {
      wx.showToast({ title: '已取消手机号授权', icon: 'none' });
      return;
    }
    if (!detail.code) {
      wx.showToast({ title: '未获取到手机号授权凭证', icon: 'none' });
      return;
    }

    const app = getApp();
    try {
      this.setData({ loggingIn: true });
      wx.showLoading({ title: '登录中...' });
      await app.phoneLogin(detail.code);
      wx.hideLoading();

      if (app.globalData.offlineMode) {
        this.setData({ loggingIn: false });
        wx.showToast({ title: '网络不可用，请稍后重试', icon: 'none' });
        return;
      }

      this.setData({ loginSuccess: true });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/task/index' });
      }, 800);
    } catch (err) {
      wx.hideLoading();
      const msg = (err && err.message) || (err && err.errMsg) || '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
      console.error('登录错误', err);
    } finally {
      this.setData({ loggingIn: false });
    }
  },
});
