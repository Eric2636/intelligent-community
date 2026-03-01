import { publishTask } from '~/mock/task/api';

Page({
  data: {
    title: '',
    desc: '',
    reward: '',
    location: '',
    submitting: false,
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onDescInput(e) { this.setData({ desc: e.detail.value }); },
  onRewardInput(e) { this.setData({ reward: e.detail.value }); },
  onLocationInput(e) { this.setData({ location: e.detail.value }); },

  async submit() {
    const { title, desc, reward, location } = this.data;
    const t = (title || '').trim();
    if (!t) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }
    const r = (reward || '').trim();
    if (!r || isNaN(Number(r)) || Number(r) <= 0) {
      wx.showToast({ title: '请输入有效佣金金额', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const res = await publishTask({
      title: t,
      desc: (desc || '').trim(),
      reward: r,
      location: (location || '').trim() || '线下协商',
      publisherName: '我',
    });
    this.setData({ submitting: false });
    if (res.code === 200 && res.data) {
      wx.showToast({ title: '发布成功' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },
});
