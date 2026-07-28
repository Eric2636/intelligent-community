import { completeAuthorizedLogin } from '~/utils/authIdentity';

Component({
  data: {
    visible: false,
    submitting: false,
  },

  lifetimes: {
    attached() {
      this._alive = true;
    },

    detached() {
      this._alive = false;
      this._requestPage = null;
    },
  },

  methods: {
    open(page) {
      if (!this._alive || this.data.visible) return;
      this._requestPage = page || null;
      this.setData({ visible: true, submitting: false });
    },

    close() {
      if (!this._alive) return;
      this.setData({ visible: false, submitting: false });
    },

    onCancel() {
      if (!this._alive || this.data.submitting) return;
      this.close();
      this.triggerEvent('cancel');
    },

    async onGetPhoneNumber(e) {
      if (!this._alive || this.data.submitting) return;
      const detail = (e && e.detail) || {};
      if ((detail.errMsg && !/ok/i.test(detail.errMsg)) || !detail.code) {
        if (!this._alive) return;
        wx.showToast({
          title: detail.code ? '手机号授权失败，请重试' : '未完成手机号授权，请重试',
          icon: 'none',
        });
        this.setData({ submitting: false });
        return;
      }

      this.setData({ submitting: true });
      try {
        const authorized = await completeAuthorizedLogin(detail.code, this._requestPage);
        if (!this._alive || !authorized) return;
        this.close();
        this.triggerEvent('authorized');
        wx.showToast({ title: '登录成功', icon: 'success' });
      } catch (err) {
        if (!this._alive) return;
        this.setData({ submitting: false });
        wx.showToast({
          title: (err && (err.message || err.errMsg)) || '手机号验证失败，请重试',
          icon: 'none',
        });
      }
    },
  },
});
