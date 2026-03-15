Page({
  data: {
    agreed: false,
  },

  onAgreementChange(e) {
    const agreed = e.detail.value === 'agree';
    this.setData({ agreed });
  },

  async login() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }

    const app = getApp();
    if (!app.globalData.useCloudBase) {
      wx.showToast({ title: '请使用云开发模式', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '登录中...' });
      const result = await wx.cloud.callFunction({
        name: 'user',
        data: { action: 'login' },
      });
      wx.hideLoading();

      if (result.result && result.result.code === 200) {
        app.globalData.openid = result.result.data.openid;
        app.globalData.userInfo = result.result.data.userInfo || null;
        wx.setStorageSync('access_token', result.result.data.openid);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 800);
      } else {
        wx.showToast({ title: result.result?.message || '登录失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
      console.error('登录错误', err);
    }
  },
});
