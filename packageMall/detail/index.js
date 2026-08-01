import { mallAPI } from '~/api/cloud';
import { getCurrentUserId } from '~/utils/getOpenid';
import { chooseAndUploadMedia } from '~/utils/cloudMedia';
import { ensureMutationReady } from '~/utils/authIdentity';
import { emitListMutation } from '~/utils/listMutation';
import { mallPublishUrl } from '~/utils/mallPaths';

function firstUrl(list) {
  return Array.isArray(list) && list.length ? String(list[0] || '') : '';
}

function withImage(payload, imageUrl) {
  return imageUrl ? { ...payload, imageUrl } : payload;
}

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
    locationMarkers: [],
    comments: [],
    commentTotal: 0,
    commentInput: '',
    commentImages: [],
    commentSubmitting: false,
    commentFocus: false,
    showCommentEmojiPanel: false,
    currentUserId: '',
    replyParentId: '',
    replyTargetName: '',
    ownerActionVisible: false,
    ownerActionLoading: false,
    ownerActions: [],
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
      const latitude = Number(res.data.latitude);
      const longitude = Number(res.data.longitude);
      const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
      const locationMarkers = hasLocation
        ? [{
          id: 1,
          latitude,
          longitude,
          title: res.data.locationName || res.data.locationAddress || '门店地点',
          callout: {
            content: res.data.locationName || '门店地点',
            display: 'ALWAYS',
            padding: 8,
            borderRadius: 8,
            bgColor: '#ffffff',
            color: '#1f2329',
          },
        }]
        : [];
      this.setData({ item: res.data, loading: false, isMine, previewImages, locationMarkers });
      this.updateOwnerActions(res.data);
      emitListMutation(this, { type: 'upsert', id, data: res.data });
      this.loadComments();
    } else {
      this.setData({ loading: false });
    }
  },

  updateOwnerActions(item = this.data.item) {
    if (!item) return;
    const isOnline = item.visibility === 'ONLINE';
    this.setData({
      ownerActions: [
        { label: '编辑', value: 'edit', icon: 'edit-1' },
        { label: isOnline ? '隐藏信息' : '公开信息', value: 'visibility', icon: isOnline ? 'browse-off' : 'browse' },
        { label: '删除', value: 'delete', icon: 'delete-1', color: '#d54941' },
      ],
    });
  },

  onOpenOwnerActions() {
    if (!this.data.isMine || this.data.ownerActionLoading) return;
    this.setData({ ownerActionVisible: true });
  },

  onOwnerActionVisibleChange(e) {
    this.setData({ ownerActionVisible: Boolean(e.detail && e.detail.visible) });
  },

  onOwnerActionClose() {
    this.setData({ ownerActionVisible: false });
  },

  async onOwnerActionSelected(e) {
    const action = e.detail && e.detail.selected && e.detail.selected.value;
    this.setData({ ownerActionVisible: false });
    if (action === 'edit') {
      wx.navigateTo({
        url: mallPublishUrl(this.data.id),
        events: {
          listMutation: (mutation) => {
            if (!mutation || !mutation.data) return;
            this.setData({ item: mutation.data });
            this.updateOwnerActions(mutation.data);
            emitListMutation(this, mutation);
          },
        },
      });
      return;
    }
    if (action === 'visibility') await this.toggleVisibility();
    if (action === 'delete') this.confirmDeleteItem();
  },

  async toggleVisibility() {
    if (this.data.ownerActionLoading) return;
    const item = this.data.item || {};
    const visibility = item.visibility === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    this.setData({ ownerActionLoading: true });
    try {
      const res = await mallAPI.setItemVisibility(this.data.id, visibility);
      if (res.code !== 200) throw new Error(res.message || '操作失败');
      const nextItem = { ...item, ...(res.data || {}), visibility };
      this.setData({ item: nextItem });
      this.updateOwnerActions(nextItem);
      emitListMutation(this, { type: 'upsert', id: this.data.id, data: nextItem });
      wx.showToast({ title: visibility === 'ONLINE' ? '已公开' : '已隐藏', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ ownerActionLoading: false });
    }
  },

  confirmDeleteItem() {
    if (this.data.ownerActionLoading) return;
    wx.showModal({
      title: '删除信息',
      content: '删除后无法恢复，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#d54941',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ ownerActionLoading: true });
        try {
          const res = await mallAPI.deleteItem(this.data.id);
          if (res.code !== 200) throw new Error(res.message || '删除失败');
          emitListMutation(this, { type: 'remove', id: this.data.id });
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          this.setData({ ownerActionLoading: false });
        }
      },
    });
  },

  onShareAppMessage() {
    const { id, item, previewImages } = this.data;
    const title = item
      ? `${item.title || '小区市场'}${item.price ? `｜¥${item.price}` : ''}`
      : '小区市场';
    return withImage(
      {
        title,
        path: `/packageMall/detail/index?id=${encodeURIComponent(id || '')}`,
      },
      firstUrl(previewImages),
    );
  },

  onShareTimeline() {
    const { id, item, previewImages } = this.data;
    const title = item
      ? `${item.title || '小区市场'}${item.price ? `｜¥${item.price}` : ''}`
      : '小区市场';
    return withImage(
      {
        title,
        query: `id=${encodeURIComponent(id || '')}`,
      },
      firstUrl(previewImages),
    );
  },

  onCommentInput(e) {
    this.setData({ commentInput: e.detail.value });
  },
  onCommentEmojiHint() {
    this.setData({
      showCommentEmojiPanel: !this.data.showCommentEmojiPanel,
      commentFocus: false,
    });
  },
  onCommentEmojiSelect(e) {
    const emoji = e.detail && e.detail.emoji ? e.detail.emoji : '';
    if (!emoji) return;
    this.setData({
      commentInput: `${this.data.commentInput || ''}${emoji}`,
    });
  },

  onReplyTap(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ replyParentId: id, replyTargetName: name || '邻居' });
  },

  onCancelReply() {
    this.setData({ replyParentId: '', replyTargetName: '' });
  },

  async onAddCommentImages() {
    if (!(await ensureMutationReady(this))) return;
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
      this.setData({ commentImages: commentImages.concat(images), showCommentEmojiPanel: false });
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
      } catch (err) {
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
    if (!(await ensureMutationReady(this))) return;
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
      this.setData({
        commentInput: '',
        commentImages: [],
        replyParentId: '',
        replyTargetName: '',
        showCommentEmojiPanel: false,
      });
      wx.showToast({ title: '已发布', icon: 'success' });
      this.loadComments();
    } else {
      wx.showToast({ title: res.message || '发布失败', icon: 'none' });
    }
  },

  async onToggleLike(e) {
    if (!(await ensureMutationReady(this))) return;
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
    if (!(await ensureMutationReady(this))) return;
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
    const { current } = e.currentTarget.dataset;
    if (!previewImages.length) return;
    wx.previewImage({ current, urls: previewImages });
  },

  onContact() {
    const contact = String((this.data.item && this.data.item.contact) || '').trim();
    if (!contact) {
      wx.showToast({ title: '暂无商家联系方式', icon: 'none' });
      return;
    }
    const phone = contact.replace(/[^\d+]/g, '');
    if (/^(?:\+?86)?1\d{10}$/.test(phone) || /^0\d{2,3}\d{7,8}$/.test(phone)) {
      wx.makePhoneCall({
        phoneNumber: phone.replace(/^\+?86/, ''),
        fail: () => {
          wx.setClipboardData({ data: contact });
        },
      });
      return;
    }
    wx.setClipboardData({
      data: contact,
      success: () => wx.showToast({ title: '联系方式已复制', icon: 'none' }),
    });
  },

  openLocation() {
    const item = this.data.item || {};
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    wx.openLocation({
      latitude,
      longitude,
      name: item.locationName || '门店地点',
      address: item.locationAddress || item.locationName || '',
      scale: 16,
    });
  },

  async onFavorite() {
    if (!(await ensureMutationReady(this))) return;
    const { item } = this.data;
    if (!item || !item._id) return;
    const { isFavorited } = item;
    const api = isFavorited ? mallAPI.unfavoriteItem : mallAPI.favoriteItem;
    const res = await api(item._id);
    if (res.code === 200) {
      const nextItem = { ...item, isFavorited: !isFavorited };
      this.setData({ item: nextItem });
      emitListMutation(this, { type: 'upsert', id: this.data.id, data: nextItem });
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' });
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
