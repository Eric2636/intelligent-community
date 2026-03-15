import { mallAPI } from '~/api/cloud';

Page({
  data: {
    categories: [],
    categoryIndex: 0,
    categoryName: '日用品',
    categoryId: 'daily',
    title: '',
    price: '',
    desc: '',
    contact: '',
    submitting: false,
  },

  onLoad() {
    mallAPI.getCategories().then((res) => {
      if (res.code !== 200) return;
      const list = (res.data || []).filter((c) => c.id !== 'all');
      const categoryName = list[0] ? list[0].name : '日用品';
      this.setData({ categories: list, categoryName });
    });
  },

  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const list = this.data.categories;
    const item = list[idx];
    if (item) this.setData({ categoryIndex: idx, categoryId: item.id, categoryName: item.name });
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onPriceInput(e) { this.setData({ price: e.detail.value }); },
  onDescInput(e) { this.setData({ desc: e.detail.value }); },
  onContactInput(e) { this.setData({ contact: e.detail.value }); },

  async submit() {
    const { categoryId, title, price, desc, contact } = this.data;
    const t = (title || '').trim();
    if (!t) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const res = await mallAPI.publishItem({
      categoryId,
      title: t,
      price: (price || '').trim(),
      unit: '元',
      desc: (desc || '').trim(),
      contact: (contact || '').trim() || '保密',
    });
    this.setData({ submitting: false });
    if (res.code === 200 && res.data) {
      wx.showToast({ title: '发布成功' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },
});
