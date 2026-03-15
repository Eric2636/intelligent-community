import { mallAPI } from '~/api/cloud';

Page({
  data: {
    id: '',
    item: null,
    loading: true,
    isMine: false,
  },

  onLoad(options) {
    const { id } = options;
    this.setData({ id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await mallAPI.getItemDetail(id);
    if (res.code === 200 && res.data) {
      const app = getApp();
      const openid = (app.globalData && app.globalData.openid) || '';
      const isMine = res.data.publisherId === openid;
      this.setData({ item: res.data, loading: false, isMine });
    } else {
      this.setData({ loading: false });
    }
  },

  onContact() {
    if (this.data.item && this.data.item.contact) {
      wx.showToast({ title: '请通过页面联系方式沟通', icon: 'none' });
    } else {
      wx.showToast({ title: '请联系发布者', icon: 'none' });
    }
  },

  async onFavorite() {
    const item = this.data.item
    if (!item || !item._id) return
    const app = getApp()
    if (!app.globalData.openid) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    const isFavorited = item.isFavorited
    const api = isFavorited ? mallAPI.unfavoriteItem : mallAPI.favoriteItem
    const res = await api(item._id)
    if (res.code === 200) {
      this.setData({ item: { ...item, isFavorited: !isFavorited } })
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' })
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' })
  },

  async onBuy() {
    const item = this.data.item;
    const app = getApp();
    const openid = (app.globalData && app.globalData.openid) || '';
    if (!openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (item.publisherId === openid) {
      wx.showToast({ title: '不能购买自己发布的商品', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中...' });
    const res = await mallAPI.createOrder({
      itemId: item._id,
      itemTitle: item.title,
      itemPrice: item.price,
      itemUnit: item.unit || '元',
      sellerId: item.publisherId,
      contact: item.contact,
    });
    wx.hideLoading();
    if (res.code === 200 && res.data && res.data.orderId) {
      wx.showToast({ title: '订单已创建', icon: 'success' });
      setTimeout(() => {
        wx.navigateTo({ url: `/packageMall/order-detail/index?id=${res.data.orderId}` });
      }, 500);
    } else {
      wx.showToast({ title: res.message || '下单失败', icon: 'none' });
    }
  },
});
