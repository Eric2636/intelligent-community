import { errandAPI } from '~/api/cloud';
import { invalidateCloudFunction } from '~/utils/apiCache';
import { invalidateHttpCachePrefix } from '~/utils/persistCache';

function hasUnsupportedEmoji(text) {
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text || '');
}

Page({
  data: {
    title: '',
    content: '',
    reward: '',
    submitting: false,
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value || '' });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value || '' });
  },

  onRewardInput(e) {
    this.setData({ reward: e.detail.value || '' });
  },

  async submit() {
    const title = (this.data.title || '').trim();
    const content = (this.data.content || '').trim();
    const reward = (this.data.reward || '').trim();

    if (!title) {
      wx.showToast({ title: '请输入跑腿标题', icon: 'none' });
      return;
    }
    if (!content) {
      wx.showToast({ title: '请输入跑腿内容', icon: 'none' });
      return;
    }
    if (!reward) {
      wx.showToast({ title: '请输入佣金', icon: 'none' });
      return;
    }
    if (hasUnsupportedEmoji(title) || hasUnsupportedEmoji(content)) {
      wx.showToast({ title: '请修改标题或正文后重试', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await errandAPI.publishErrand({
        title,
        content,
        reward,
      });
      this.setData({ submitting: false });
      if (res && res.code === 200) {
        invalidateCloudFunction('errand');
        invalidateHttpCachePrefix('http_cache:api/errands:');
        wx.showToast({ title: '发布成功' });
        setTimeout(() => wx.navigateBack(), 700);
        return;
      }
      wx.showToast({ title: (res && res.message) || '发布失败', icon: 'none' });
    } catch (err) {
      console.error('发布跑腿失败', err);
      this.setData({ submitting: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  },
});
