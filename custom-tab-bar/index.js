import { buildVisibleTabBarList } from '~/utils/moduleEntryGuard';
import { NOTIFICATION_UNREAD_EVENT } from '~/utils/notificationUnread';

Component({
  data: {
    value: '',
    visibleList: [],
    unreadCount: 0,
  },
  lifetimes: {
    attached() {
      const app = getApp();
      this._onVisibilityChange = () => this.refreshTabBar();
      this._onNotificationUnreadCountChange = (count) => {
        this.setData({
          unreadCount: Number.isSafeInteger(count) && count > 0 ? count : 0,
        });
        this.refreshTabBar();
      };
      app.eventBus.on('moduleEntryVisibilityChange', this._onVisibilityChange);
      app.eventBus.on(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
      this.setData({ unreadCount: app.globalData.notificationUnreadCount || 0 });
      this.refreshTabBar();
    },
    detached() {
      getApp().eventBus.off('moduleEntryVisibilityChange', this._onVisibilityChange);
      getApp().eventBus.off(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
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
      const visibleList = buildVisibleTabBarList().map((item) => ({
        ...item,
        badgeProps:
          item.value === 'my' && this.data.unreadCount > 0
            ? { count: this.data.unreadCount, maxCount: 99, visible: true }
            : { count: 0, visible: false },
      }));
      const pages = getCurrentPages();
      const [curPage] = pages.slice(-1);
      let value = '';
      if (curPage && curPage.route) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        const [, routeName] = nameRe || [];
        if (routeName) value = routeName;
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
