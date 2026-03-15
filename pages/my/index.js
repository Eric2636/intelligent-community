import useToastBehavior from '~/behaviors/useToast';
import { userAPI } from '~/api/cloud';

Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    personalInfo: {},
    menuList: [
      { name: '我的任务', icon: 'root-list', url: 'task', desc: '查看我发布与领取的任务' },
      { name: '我的帖子', icon: 'chat', url: 'posts', desc: '我发布的论坛帖子' },
      { name: '收藏的帖子', icon: 'star', url: 'favorites', desc: '我收藏的论坛帖子' },
      { name: '我发布的', icon: 'shop', url: 'mall', desc: '我在商城发布的闲置/求购' },
      { name: '我的订单', icon: 'cart', url: 'orders', desc: '我买到的与卖出的订单' },
      { name: '收藏的商品', icon: 'star', url: 'mallFav', desc: '我收藏的商城商品' },
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
    const app = getApp();
    if (app.globalData.useCloudBase && token) {
      const personalInfo = await this.getPersonalInfo();
      this.setData({
        isLoad: true,
        personalInfo: personalInfo || {},
      });
    } else {
      this.setData({
        isLoad: !!token,
        personalInfo: {},
      });
    }
  },

  async getPersonalInfo() {
    try {
      const app = getApp();
      if (app.globalData.useCloudBase) {
        // 云开发环境：调用云函数获取用户信息
        try {
          const res = await userAPI.getUserInfo();
          if (res.code === 200 && res.data) {
            return res.data;
          }
        } catch (err) {
          console.error('获取用户信息失败', err);
        }
        // 如果云函数调用失败，返回默认信息
        const openid = app.globalData.openid;
        return {
          name: '用户',
          avatar: '',
          openid: openid || '',
        };
      } else {
        return {};
      }
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
      favorites: '/packageForum/favorites/index',
      mall: '/packageMall/my-list/index',
      orders: '/packageMall/order-list/index',
      mallFav: '/packageMall/favorites/index',
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
