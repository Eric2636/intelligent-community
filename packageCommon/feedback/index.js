import { commonAPI } from '~/api/cloud';

Page({
  data: {
    feedbackType: '',
    typeOptions: [
      { label: '功能建议', value: 'suggestion' },
      { label: '问题反馈', value: 'bug' },
      { label: '其他', value: 'other' },
    ],
    content: '',
    contact: '',
    submitting: false,
  },

  onTypeChange(e) {
    const { value } = e.detail;
    const selected = this.data.typeOptions.find((item) => item.value === value);
    this.setData({
      feedbackType: value,
      typeLabel: selected?.label || '',
    });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  async submit() {
    const { feedbackType, content, contact } = this.data;

    if (!feedbackType) {
      wx.showToast({ title: '请选择反馈类型', icon: 'none' });
      return;
    }

    if (!content.trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }

    if (!contact.trim()) {
      wx.showToast({ title: '请输入联系方式', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const res = await commonAPI.submitFeedback({
        type: feedbackType,
        content: content.trim(),
        contact: contact.trim(),
      });

      this.setData({ submitting: false });

      if (res.code === 200) {
        wx.showToast({
          title: '提交成功，感谢您的反馈！',
          icon: 'success',
          duration: 2000,
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: res.message || '提交失败，请重试',
          icon: 'none',
        });
      }
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none',
      });
    }
  },
});
