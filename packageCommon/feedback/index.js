const typeOptions = ['功能建议', '问题反馈', '其他'];

Page({
  data: {
    typeIndex: 0,
    typeText: typeOptions[0],
    content: '',
    contact: '',
    submitting: false,
  },

  onTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ typeIndex: idx, typeText: typeOptions[idx] });
  },
  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },
  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submit() {
    const { content } = this.data;
    if (!(content || '').trim()) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showToast({ title: '感谢反馈', icon: 'success' });
    this.setData({ submitting: false, content: '', contact: '' });
  },
});
