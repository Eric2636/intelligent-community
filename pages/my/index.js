import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    personalInfo: {},
    menuList: [
      { name: '我的任务', icon: 'root-list', url: 'task', desc: '查看我发布与领取的任务' },
      { name: '我的帖子', icon: 'chat', url: 'posts', desc: '我发布的论坛帖子' },
      { name: '我发布的', icon: 'shop', url: 'mall', desc: '我在商城发布的闲置/求购' },
      { name: '消息通知', icon: 'notification', url: 'notice', desc: '任务与系统消息' },
      { name: '意见反馈', icon: 'edit', url: 'feedback', desc: '提交建议或问题' },
      { name: '关于我们', icon: 'info-circle', url: 'about', desc: '产品介绍与版本' },
      { name: '设置', icon: 'setting', url: '/pages/setting/index', desc: '账号与通用设置' },
      { name: '联系客服', icon: 'service', url: '', desc: '有问题找我们' },
    ],
  },

  onLoad() {},

  async onShow() {
    const token = wx.getStorageSync('access_token');
    const personalInfo = await this.getPersonalInfo();
    this.setData({
      isLoad: !!token,
      personalInfo: personalInfo || {},
    });
  },

  async getPersonalInfo() {
    try {
      const res = await request('/api/genPersonalInfo');
      return res.data && res.data.data ? res.data.data : {};
    } catch (e) {
      return {};
    }
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onNavigateTo() {
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },

  onMenuTap(e) {
    const { url, name } = e.currentTarget.dataset;
    const routes = {
      task: '/packageTask/my-tasks/index',
      posts: '/packageForum/my-posts/index',
      mall: '/packageMall/my-list/index',
      notice: '/packageCommon/notice/index',
      feedback: '/packageCommon/feedback/index',
      about: '/packageCommon/about/index',
    };
    if (routes[url]) {
      wx.navigateTo({ url: routes[url] });
      return;
    }
    if (url) {
      wx.navigateTo({ url });
      return;
    }
    this.onShowToast('#t-toast', name || '敬请期待');
  },
});
