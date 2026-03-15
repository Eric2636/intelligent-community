import useToastBehavior from '~/behaviors/useToast';
import config from '~/config';

Page({
  behaviors: [useToastBehavior],
  data: {
    menuData: [
      [
        {
          title: '通用设置',
          url: '',
          icon: 'app',
        },
        {
          title: '通知设置',
          url: '',
          icon: 'notification',
        },
      ],
      [
        {
          title: '深色模式',
          url: '',
          icon: 'image',
        },
        {
          title: '字体大小',
          url: '',
          icon: 'chart',
        },
        {
          title: '播放设置',
          url: '',
          icon: 'sound',
        },
      ],
      [
        {
          title: '数据库初始化',
          url: '',
          icon: 'cloud',
          action: 'initDB',
        },
        {
          title: '账号安全',
          url: '',
          icon: 'secured',
        },
        {
          title: '隐私',
          url: '',
          icon: 'info-circle',
        },
      ],
      [
        {
          title: '订阅消息',
          url: '',
          icon: 'notification',
          action: 'subscribeMessage',
        },
        {
          title: '清除缓存',
          url: '',
          icon: 'delete',
          action: 'clearCache',
        },
        {
          title: '退出登录',
          url: '',
          icon: 'logout',
          action: 'logout',
        },
      ],
    ],
  },

  async onEleClick(e) {
    const { title, url, action } = e.currentTarget.dataset.data;

    if (action === 'initDB') {
      await this.initDatabase();
      return;
    }

    if (action === 'subscribeMessage') {
      this.requestSubscribeMessage();
      return;
    }

    if (action === 'clearCache') {
      this.clearCache();
      return;
    }

    if (action === 'logout') {
      this.logout();
      return;
    }

    if (url) return;
    this.onShowToast('#t-toast', title);
  },

  requestSubscribeMessage() {
    const tmplIds = config.subscribeTemplateIds || [];
    if (!tmplIds.length) {
      wx.showToast({
        title: '请先在公众平台申请订阅模板并配置 config.subscribeTemplateIds',
        icon: 'none',
        duration: 3000,
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        if (Object.values(res).some((v) => v === 'accept')) {
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } else {
          wx.showToast({ title: '已取消', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.showToast({ title: err.errMsg || '订阅失败', icon: 'none' });
      },
    });
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存数据，不会退出登录。确定继续？',
      success: (res) => {
        if (!res.confirm) return;
        try {
          const token = wx.getStorageSync('access_token');
          wx.clearStorageSync();
          if (token) wx.setStorageSync('access_token', token);
          wx.showToast({ title: '缓存已清除', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: '清除失败', icon: 'none' });
        }
      },
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        wx.removeStorageSync('access_token');
        app.globalData.openid = '';
        app.globalData.userInfo = null;
        wx.showToast({ title: '已退出', icon: 'none' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 300);
      },
    });
  },

  async initDatabase() {
    wx.showLoading({ title: '初始化中...' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'init-db',
        data: {}
      });

      wx.hideLoading();

      const { code, message, data, guide } = result.result;

      if (code === 200) {
        wx.showModal({
          title: '初始化成功',
          content: `所有数据库集合已创建成功！\n成功: ${data.success}/${data.total}`,
          showCancel: false
        });
      } else if (code === 206) {
        // 部分集合需要手动创建
        const missingList = guide.missingCollections.join(', ');
        wx.showModal({
          title: '部分集合需要手动创建',
          content: `以下集合需要手动创建:\n${missingList}\n\n请在云开发控制台 > 数据库中创建这些集合`,
          confirmText: '查看详情',
          success(res) {
            if (res.confirm) {
              console.log('需要创建的集合:', guide.missingCollections);
            }
          }
        });
      } else {
        wx.showModal({
          title: '初始化失败',
          content: message || '未知错误',
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('数据库初始化失败:', err);
      wx.showModal({
        title: '初始化失败',
        content: '请检查云开发环境是否正确配置',
        showCancel: false
      });
    }
  },
});
