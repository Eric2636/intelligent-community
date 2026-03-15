Page({
  data: {
    appName: '智能社区',
    version: '1.0.0',
    appDescription: '为社区居民提供便捷的任务发布、论坛交流、二手商城等综合服务平台',
    features: [
      '任务互助：发布和领取社区任务',
      '社区论坛：分享生活点滴',
      '二手商城：闲置物品交易',
      '消息通知：实时获取动态',
    ],
    contact: {
      phone: '400-888-8888',
      email: 'support@smartcommunity.com',
    },
  },

  onContactTap(e) {
    const { type, value } = e.currentTarget.dataset;
    if (type === 'phone') {
      wx.makePhoneCall({
        phoneNumber: value,
      });
    } else if (type === 'email') {
      wx.setClipboardData({
        data: value,
        success: () => {
          wx.showToast({
            title: '邮箱已复制',
            icon: 'success',
          });
        },
      });
    }
  },

  onVersionTap() {
    wx.showToast({
      title: '当前已是最新版本',
      icon: 'none',
    });
  },
});
