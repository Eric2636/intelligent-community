Page({
  data: {
    agreed: false,
  },

  onAgreementChange(e) {
    const agreed = e.detail.value === 'agree';
    this.setData({ agreed });
  },

  openAgreement() {
    wx.navigateTo({ url: '/packageCommon/agreement/index' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/packageCommon/privacy/index' });
  },

  async login() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }

    const app = getApp();
    try {
      wx.showLoading({ title: '登录中...' });
      await app.login();
      wx.hideLoading();

      if (app.globalData.offlineMode) {
        wx.showToast({ title: '网络不可用，已进入离线浏览', icon: 'none' });
        return;
      }

      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/my/index' });
      }, 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
      console.error('登录错误', err);
    }
  },
});
