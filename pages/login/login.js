Page({
  onLoad() {
    this.goHome();
  },

  onShow() {
    this.goHome();
  },

  goHome() {
    if (this.redirecting) return;
    this.redirecting = true;
    wx.switchTab({
      url: '/pages/task/index',
      fail: () => {
        wx.reLaunch({ url: '/pages/task/index' });
      },
      complete: () => {
        this.redirecting = false;
      },
    });
  },
});
