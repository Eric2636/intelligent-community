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
    phoneLoginVisible: false,
    phoneLoginLoading: false,
    phoneLoginProfile: null,
  },
  lifetimes: {
    attached() {
      const app = getApp();
      const pages = getCurrentPages();
      this._ownerPage = pages && pages.length ? pages[pages.length - 1] : null;
      this._onPhoneLoginRequest = (request) => {
        const currentPages = getCurrentPages();
        const currentPage = currentPages && currentPages.length ? currentPages[currentPages.length - 1] : null;
        if (this._ownerPage && currentPage && this._ownerPage !== currentPage) return;
        if (!request || request.handled) return;
        request.handled = true;
        this._phoneLoginRequest = request;
        this.setData({
          phoneLoginVisible: true,
          phoneLoginLoading: false,
          phoneLoginProfile: null,
        });
      };
      app.eventBus.on('phoneLoginRequest', this._onPhoneLoginRequest);
    },
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
    detached() {
      const app = getApp();
      if (this._onPhoneLoginRequest) {
        app.eventBus.off('phoneLoginRequest', this._onPhoneLoginRequest);
      }
      if (this._phoneLoginRequest) {
        this._phoneLoginRequest.reject(new Error('手机号验证登录已取消'));
        this._phoneLoginRequest = null;
      }
    },
  },
  methods: {
    closePhoneLogin() {
      this.setData({
        phoneLoginVisible: false,
        phoneLoginLoading: false,
        phoneLoginProfile: null,
      });
    },
    onPhoneLoginCancel() {
      if (this.data.phoneLoginLoading) return;
      if (this._phoneLoginRequest) {
        this._phoneLoginRequest.reject(new Error('请先完成手机号验证登录'));
        this._phoneLoginRequest = null;
      }
      this.closePhoneLogin();
    },
    async onPhoneLoginTap() {
      const app = getApp();
      if (!app.getWechatProfile) return;
      try {
        const profile = await app.getWechatProfile();
        this.setData({ phoneLoginProfile: profile || null });
      } catch (e) {
        this.setData({ phoneLoginProfile: null });
      }
    },
    async onGetPhoneNumber(e) {
      if (this.data.phoneLoginLoading) return;
      const request = this._phoneLoginRequest;
      const detail = (e && e.detail) || {};
      if (detail.errMsg && !/ok/i.test(detail.errMsg)) {
        if (request) request.reject(new Error('已取消手机号授权'));
        this._phoneLoginRequest = null;
        this.closePhoneLogin();
        return;
      }
      if (!detail.code) {
        if (request) request.reject(new Error('未获取到手机号授权凭证'));
        this._phoneLoginRequest = null;
        this.closePhoneLogin();
        return;
      }

      this.setData({ phoneLoginLoading: true });
      wx.showLoading({ title: '验证中...' });
      try {
        const app = getApp();
        await app.phoneLogin(detail.code, this.data.phoneLoginProfile || {});
        wx.hideLoading();
        this.closePhoneLogin();
        if (request) request.resolve(true);
        this._phoneLoginRequest = null;
      } catch (err) {
        wx.hideLoading();
        this.setData({ phoneLoginLoading: false });
        if (request) request.reject(err);
        this._phoneLoginRequest = null;
        this.closePhoneLogin();
      }
    },
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
