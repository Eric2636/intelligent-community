import { getItemDetail } from '~/mock/mall/api';

Page({
  data: {
    id: '',
    item: null,
    loading: true,
  },

  onLoad(options) {
    const { id } = options;
    this.setData({ id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await getItemDetail(id);
    if (res.code === 200 && res.data) this.setData({ item: res.data, loading: false });
    else this.setData({ loading: false });
  },

  onContact() {
    wx.showToast({ title: '请联系发布者', icon: 'none' });
  },
});
