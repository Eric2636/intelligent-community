// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';

if (config.isMock) {
  Mock();
}

App({
  onLaunch() {
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
  },
  globalData: {
    userInfo: null,
    userId: 'user1', // 任务/商城等模块当前用户，Mock 用
  },

  /** 全局事件总线 */
  eventBus: createBus(),
});
