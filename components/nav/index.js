const TAB_URLS = [
  '/pages/task/index',
  '/pages/errand/index',
  '/pages/forum/index',
  '/pages/mall/index',
  '/pages/my/index',
];

Component({
  options: {
    styleIsolation: 'shared',
  },
  properties: {
    titleText: String,
    /** 是否显示返回按钮（非 Tab 页传 true） */
    showBack: {
      type: Boolean,
      value: false,
    },
    fallbackUrl: {
      type: String,
      value: '',
    },
  },
  data: {
    /** 与 TDesign t-navbar 占位一致：状态栏高度 + 导航内容区，避免首帧占位未就绪时与下方搜索区重叠 */
    navHolderPx: 88,
  },
  lifetimes: {
    ready() {
      let navHolderPx = 88;
      try {
        const sys = wx.getWindowInfo();
        const top = sys && typeof sys.statusBarHeight === 'number' ? sys.statusBarHeight : 0;
        const menu = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
        if (menu && typeof menu.top === 'number' && typeof menu.height === 'number') {
          navHolderPx = top + (menu.top - top) * 2 + menu.height;
        } else {
          navHolderPx = top + 48;
        }
        navHolderPx = Math.ceil(navHolderPx);
      } catch (e) {
        navHolderPx = 88;
      }
      this.setData({ navHolderPx });
    },
  },
  methods: {
    goFallback() {
      const { fallbackUrl } = this.properties;
      if (!fallbackUrl) {
        wx.navigateBack();
        return;
      }
      const go = TAB_URLS.indexOf(fallbackUrl) >= 0 ? wx.switchTab : wx.redirectTo;
      go({ url: fallbackUrl });
    },
    goBack() {
      const pages = getCurrentPages();
      if (pages && pages.length > 1) {
        wx.navigateBack({
          delta: 1,
          fail: () => this.goFallback(),
        });
        return;
      }
      this.goFallback();
    },
  },
});
