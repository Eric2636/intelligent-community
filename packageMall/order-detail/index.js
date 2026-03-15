import { mallAPI } from '~/api/cloud';

Page({
  data: {
    id: '',
    order: null,
    loading: true,
    isBuyer: false,
    isSeller: false,
  },

  onLoad(options) {
    const { id } = options;
    this.setData({ id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await mallAPI.getOrderDetail(id);
    if (res.code === 200 && res.data) {
      const app = getApp();
      const openid = (app.globalData && app.globalData.openid) || '';
      const order = res.data;
      const isBuyer = order.buyerId === openid;
      const isSeller = order.sellerId === openid;
      this.setData({
        order,
        loading: false,
        isBuyer,
        isSeller,
      });
    } else {
      this.setData({ loading: false });
    }
  },

  getStatusText(status) {
    const map = { pending: '待沟通', completed: '已完成', cancelled: '已取消' };
    return map[status] || status;
  },

  async onConfirmComplete() {
    const { order } = this.data;
    if (order.status !== 'pending') return;
    const res = await mallAPI.updateOrderStatus(order._id, 'completed');
    if (res.code === 200) {
      wx.showToast({ title: '已确认完成', icon: 'success' });
      this.loadDetail();
    } else {
      wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    }
  },

  async onCancel() {
    const { order } = this.data;
    if (order.status !== 'pending') return;
    wx.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await mallAPI.updateOrderStatus(order._id, 'cancelled');
        if (result.code === 200) {
          wx.showToast({ title: '已取消', icon: 'success' });
          this.loadDetail();
        } else {
          wx.showToast({ title: result.message || '操作失败', icon: 'none' });
        }
      },
    });
  },
});
