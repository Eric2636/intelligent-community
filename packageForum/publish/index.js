import { publishPost } from '~/mock/forum/api';

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
    const res = await publishPost({ title: t, content: c, authorName: '热心网友' });
    this.setData({ submitting: false });
    if (res.code === 200 && res.data) {
      wx.showToast({ title: '发帖成功' });
      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    }
  },
});
