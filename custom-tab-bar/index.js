import { buildVisibleTabBarList } from '~/utils/moduleEntryGuard';

Component({
  data: {
    value: '',
    visibleList: [],
  },
  lifetimes: {
    attached() {
      const app = getApp();
      this._onVisibilityChange = () => this.refreshTabBar();
      app.eventBus.on('moduleEntryVisibilityChange', this._onVisibilityChange);
      this.refreshTabBar();
    },
    detached() {
      getApp().eventBus.off('moduleEntryVisibilityChange', this._onVisibilityChange);
    },
  },
  pageLifetimes: {
    show() {
      this.refreshTabBar();
    },
  },
  methods: {
    /** 供 Tab 页 onShow 调用：getTabBar().syncFromRoute() */
    syncFromRoute() {
      this.refreshTabBar();
    },
    refreshTabBar() {
      const app = getApp();
      const visibleList = buildVisibleTabBarList();
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      let value = '';
      if (curPage && curPage.route) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe && nameRe[1]) value = nameRe[1];
      }
      let allowed = visibleList.some((item) => item.value === value);
      if (!allowed && app.globalData.tabBarSelectedKey) {
        value = app.globalData.tabBarSelectedKey;
        allowed = visibleList.some((item) => item.value === value);
      }
      if (!allowed) {
        value = visibleList[0] ? visibleList[0].value : '';
      }
      if (value) {
        app.globalData.tabBarSelectedKey = value;
      }
      this.setData({ visibleList, value });
    },
    handleChange(e) {
      const { value } = e.detail;
      const app = getApp();
      app.globalData.tabBarSelectedKey = value;
      // 避免与 wx.switchTab 同时 setData 导致 TDesign TabBar 高亮异常：仅 switchTab，选中态由目标页 onShow + syncFromRoute 刷新
      wx.switchTab({ url: `/pages/${value}/index` });
    },
  },
});
