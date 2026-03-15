// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';

// 判断是否使用云开发
const USE_CLOUDBASE = true; // 使用云开发

if (!USE_CLOUDBASE && config.isMock) {
  Mock();
}

App({
  onLaunch() {
    // 初始化云开发
    if (USE_CLOUDBASE) {
      try {
        wx.cloud.init({
          env: 'intelligence-communi-4bcfec6c3b1', // 云开发环境ID - 如果环境不存在，请修改为实际的环境ID
          traceUser: true,
        });
        console.log('云开发初始化成功');
        console.log('云开发环境:', 'intelligence-communi-4bcfec6c3b1');
      } catch (err) {
        console.error('云开发初始化失败:', err);
      }
    }

    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate(() => {});
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) updateManager.applyUpdate();
        },
      });
    });

    // 云开发环境下自动登录
    if (USE_CLOUDBASE) {
      this.login();
    }
  },

  async login() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'user',
        data: {
          action: 'login'
        }
      });
      if (result.result.code === 200) {
        this.globalData.openid = result.result.data.openid;
        this.globalData.userInfo = result.result.data.userInfo;
        console.log('登录成功，openid:', result.result.data.openid);
        console.log('用户信息:', result.result.data.userInfo);
      }
    } catch (err) {
      console.error('登录失败', err);
    }
  },

  globalData: {
    userInfo: null,
    userId: 'user1', // 任务/商城等模块当前用户，Mock 用
    openid: '', // 云开发用户openid
    useCloudBase: USE_CLOUDBASE, // 是否使用云开发
  },

  /** 全局事件总线 */
  eventBus: createBus(),
});
