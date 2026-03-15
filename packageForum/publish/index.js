import { forumAPI } from '~/api/cloud';

Page({
  data: {
    title: '',
    content: '',
    submitting: false,
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async submit() {
    const { title, content } = this.data;
    const t = (title || '').trim();
    const c = (content || '').trim();

    if (!t) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!c) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const res = await forumAPI.publishPost({
        title: t,
        content: c
      });
      console.log('发布结果:', res);

      this.setData({ submitting: false });

      if (res.code === 200 && res.data) {
        wx.showToast({ title: '发帖成功' });
        setTimeout(() => {
          wx.navigateBack();
        }, 800);
      } else {
        wx.showToast({
          title: res.message || '发帖失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('发布帖子失败:', err);
      this.setData({ submitting: false });
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
    }
  },
});
