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
    statusHeight: 0,
  },
  lifetimes: {
    ready() {
      const statusHeight = wx.getWindowInfo().statusBarHeight;
      this.setData({ statusHeight });
    },
  },
  methods: {
    goBack() {
      wx.navigateBack();
    },
  },
});
