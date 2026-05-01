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
      } catch (e) {}
      this.setData({ navHolderPx });
    },
  },
  methods: {
    goBack() {
      wx.navigateBack();
    },
  },
});
