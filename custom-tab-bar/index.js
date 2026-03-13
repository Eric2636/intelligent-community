const app = getApp();

Component({
  data: {
    value: 'task', // 初始选中任务，避免第一次加载时闪烁
    list: [
      { icon: 'file-copy', value: 'task', label: '任务' },
      { icon: 'chat', value: 'forum', label: '论坛' },
      { icon: 'cart', value: 'mall', label: '商城' },
      { icon: 'user', value: 'my', label: '我的' },
    ],
  },
  lifetimes: {
    ready() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (curPage) {
        const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
        if (nameRe && nameRe[1]) {
          this.setData({ value: nameRe[1] });
        }
      }
    },
  },
  methods: {
    handleChange(e) {
      const { value } = e.detail;
      wx.switchTab({ url: `/pages/${value}/index` });
    },
  },
});
