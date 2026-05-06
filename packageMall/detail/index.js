import { mallAPI } from '~/api/cloud';
import { mallOrderDetailUrl } from '~/utils/mallPaths';
import { getCurrentUserId } from '~/utils/getOpenid';
import { chooseAndUploadMedia } from '~/utils/cloudMedia';

function countCommentTree(roots) {
  if (!Array.isArray(roots)) return 0;
  let n = 0;
  for (let i = 0; i < roots.length; i += 1) {
    const r = roots[i];
    n += 1;
    if (r.replies && r.replies.length) n += r.replies.length;
  }
  return n;
}

Page({
  data: {
    id: '',
    item: null,
    loading: true,
    isMine: false,
    previewImages: [],
    comments: [],
    commentTotal: 0,
    commentInput: '',
    commentImages: [],
    commentSubmitting: false,
    currentUserId: '',
    replyParentId: '',
  },

  onLoad(options) {
    const { id } = options;
    this.setData({ id, currentUserId: getCurrentUserId() || '' });
    this.loadDetail();
  },

  onShow() {
    this.setData({ currentUserId: getCurrentUserId() || '' });
  },

  async loadDetail() {
    const { id } = this.data;
    this.setData({ loading: true });
    const res = await mallAPI.getItemDetail(id);
    if (res.code === 200 && res.data) {
      const uid = getCurrentUserId();
      const isMine = res.data.publisherId === uid;
      const mainImages = Array.isArray(res.data.mainImages) ? res.data.mainImages : [];
      const subImages = Array.isArray(res.data.subImages) ? res.data.subImages : [];
      const legacyImages = Array.isArray(res.data.images) ? res.data.images : [];
      const previewImages = (mainImages.length ? mainImages.concat(subImages) : legacyImages).filter(Boolean);
      this.setData({ item: res.data, loading: false, isMine, previewImages });
      this.loadComments();
    } else {
      this.setData({ loading: false });
    }
  },

  onCommentInput(e) {
    this.setData({ commentInput: e.detail.value });
  },

  onReplyTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ replyParentId: id });
    wx.showToast({ title: '已选择回复对象', icon: 'none' });
  },

  onCancelReply() {
    this.setData({ replyParentId: '' });
  },

  async onAddCommentImages() {
    const { commentImages } = this.data;
    const remain = Math.max(0, 3 - commentImages.length);
    if (remain <= 0) {
      wx.showToast({ title: '评论图片最多 3 张', icon: 'none' });
      return;
    }
    try {
      const { images } = await chooseAndUploadMedia({
        folder: 'mall/comments',
        maxImages: remain,
        maxVideos: 0,
        existingImageCount: 0,
        existingVideoCount: 0,
      });
      if (!images.length) return;
      this.setData({ commentImages: commentImages.concat(images) });
    } catch (err) {
      console.error(err);
    }
  },

  onRemoveCommentImage(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const commentImages = this.data.commentImages.filter((_, j) => j !== idx);
    this.setData({ commentImages });
  },

  onPreviewCommentImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    let list = urls;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch {
        list = [];
      }
    }
    if (!list || !list.length) return;
    wx.previewImage({ current, urls: list });
  },

  async loadComments() {
    const itemId = this.data.id;
    if (!itemId) return;
    const res = await mallAPI.getItemComments(itemId);
    if (res.code === 200) {
      const comments = res.data || [];
      this.setData({ comments, commentTotal: countCommentTree(comments) });
    }
  },

  async submitComment() {
    const uid = getCurrentUserId();
    if (!uid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const itemId = this.data.id;
    const content = (this.data.commentInput || '').trim();
    const commentImages = this.data.commentImages || [];
    if (!content && commentImages.length === 0) {
      wx.showToast({ title: '请输入文字或添加图片', icon: 'none' });
      return;
    }
    if (content.length > 1000) {
      wx.showToast({ title: '评论最多 1000 字', icon: 'none' });
      return;
    }
    const { replyParentId } = this.data;
    this.setData({ commentSubmitting: true });
    const res = await mallAPI.createItemComment(itemId, {
      content: content || undefined,
      parentCommentId: replyParentId || undefined,
      images: commentImages.length ? commentImages : undefined,
    });
    this.setData({ commentSubmitting: false });
    if (res.code === 200) {
      this.setData({ commentInput: '', commentImages: [], replyParentId: '' });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadComments();
    } else {
      wx.showToast({ title: res.message || '发布失败', icon: 'none' });
    }
  },

  async onToggleLike(e) {
    const uid = getCurrentUserId();
    if (!uid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const { id, liked } = e.currentTarget.dataset;
    const itemId = this.data.id;
    if (!id || !itemId) return;
    const isLiked = liked === 1 || liked === '1' || liked === true || liked === 'true';
    const fn = isLiked ? mallAPI.unlikeItemComment : mallAPI.likeItemComment;
    const r = await fn(itemId, id);
    if (r.code === 200) this.loadComments();
    else wx.showToast({ title: r.message || '操作失败', icon: 'none' });
  },

  async onDeleteComment(e) {
    const { id } = e.currentTarget.dataset;
    const itemId = this.data.id;
    if (!id || !itemId) return;
    wx.showModal({
      title: '删除评论',
      content: '确定删除这条评论吗？',
      success: async (res) => {
        if (!res.confirm) return;
        const r = await mallAPI.deleteItemComment(itemId, id);
        if (r.code === 200) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadComments();
        } else {
          wx.showToast({ title: r.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  onPreviewSwiperMedia(e) {
    const { previewImages } = this.data;
    const current = e.currentTarget.dataset.current;
    if (!previewImages.length) return;
    wx.previewImage({ current, urls: previewImages });
  },

  onContact() {
    if (this.data.item && this.data.item.contact) {
      wx.showToast({ title: '请通过页面联系方式沟通', icon: 'none' });
    } else {
      wx.showToast({ title: '请联系发布者', icon: 'none' });
    }
  },

  async onFavorite() {
    const item = this.data.item;
    if (!item || !item._id) return;
    if (!getCurrentUserId()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const isFavorited = item.isFavorited;
    const api = isFavorited ? mallAPI.unfavoriteItem : mallAPI.favoriteItem;
    const res = await api(item._id);
    if (res.code === 200) {
      this.setData({ item: { ...item, isFavorited: !isFavorited } });
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' });
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
  },

  async onBuy() {
    const item = this.data.item;
    const uid = getCurrentUserId();
    if (!uid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (item.publisherId === uid) {
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
        wx.navigateTo({ url: mallOrderDetailUrl(res.data.orderId) });
      }, 500);
    } else {
      wx.showToast({ title: res.message || '下单失败', icon: 'none' });
    }
  },
});
