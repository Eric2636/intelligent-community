import { mallAPI } from '~/api/cloud';
import { getCurrentUserId } from '~/utils/getOpenid';

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
      const uid = getCurrentUserId();
      const order = res.data;
      const isBuyer = order.buyerId === uid;
      const isSeller = order.sellerId === uid;
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
