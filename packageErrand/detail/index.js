import { errandAPI } from '~/api/cloud';
import { invalidateCloudFunction } from '~/utils/apiCache';
import { invalidateHttpCachePrefix } from '~/utils/persistCache';

function hasUnsupportedEmoji(text) {
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text || '');
}

function statusTextFrom(s) {
  if (s === 'pending_take') return '待领取';
  if (s === 'in_progress') return '进行中';
  if (s === 'completed') return '已完成';
  return '待领取';
}

function normalizeErrandPost(raw) {
  if (!raw) return null;
  const replies = (raw.replies || []).map((reply) => ({
    ...reply,
    id: reply.id || reply._id,
    createTime: reply.createTime || reply.createdAt,
  }));
  const status = raw.status || 'pending_take';
  return {
    ...raw,
    id: raw.id || raw._id,
    createTime: raw.createTime || raw.createdAt,
    replyCount: raw.replyCount || replies.length,
    likeCount: raw.likeCount || 0,
    status,
    statusText: raw.statusText || statusTextFrom(status),
    reward: raw.reward != null ? String(raw.reward) : '0',
    replies,
  };
}

Page({
  data: {
    id: '',
    errand: null,
    replyContent: '',
    loading: true,
    submitting: false,
    claimLoading: false,
    completeLoading: false,
  },

  onLoad(options) {
    const id = (options.id || '').trim();

    if (!id || id === 'undefined') {
      wx.showToast({ title: '跑腿ID无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ id });
    this.loadDetail();
  },

  async loadDetail() {
    const { id } = this.data;
    if (!id) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await errandAPI.getErrandDetail(id);
      if (res && res.code === 200 && res.data) {
        this.setData({ errand: normalizeErrandPost(res.data), loading: false });
      } else if (res && res.code === 404) {
        this.setData({ errand: null, loading: false });
        wx.showToast({ title: res.message || '跑腿不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        this.setData({ errand: null, loading: false });
        wx.showToast({ title: (res && res.message) || '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载跑腿详情失败', err);
      this.setData({ errand: null, loading: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },

  async onLike() {
    const { id, errand } = this.data;
    if (!id || !errand) return;
    const isLiked = errand.isLiked;
    const api = isLiked ? errandAPI.unlikeErrand : errandAPI.likeErrand;
    const res = await api(id);
    if (res.code === 200) {
      invalidateHttpCachePrefix('http_cache:api/errands:');
      this.setData({
        errand: {
          ...errand,
          isLiked: !isLiked,
          likeCount:
            (res.data && res.data.likeCount) != null
              ? res.data.likeCount
              : Math.max(0, (errand.likeCount || 0) + (isLiked ? -1 : 1)),
        },
      });
      wx.showToast({ title: isLiked ? '已取消赞' : '已赞', icon: 'none' });
    } else {
      wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    }
  },

  async onClaim() {
    const { id, errand } = this.data;
    if (!id || !errand || !errand.canClaim) return;
    this.setData({ claimLoading: true });
    try {
      const res = await errandAPI.claimErrand(id);
      this.setData({ claimLoading: false });
      if (res.code === 200) {
        invalidateCloudFunction('errand');
        invalidateHttpCachePrefix('http_cache:api/errands:');
        wx.showToast({ title: '领取成功' });
        await this.loadDetail();
        return;
      }
      wx.showToast({ title: res.message || '领取失败', icon: 'none' });
    } catch (err) {
      console.error('领取跑腿失败', err);
      this.setData({ claimLoading: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },

  async onComplete() {
    const { id, errand } = this.data;
    if (!id || !errand || !errand.canComplete) return;
    this.setData({ completeLoading: true });
    try {
      const res = await errandAPI.completeErrand(id);
      this.setData({ completeLoading: false });
      if (res.code === 200) {
        invalidateCloudFunction('errand');
        invalidateHttpCachePrefix('http_cache:api/errands:');
        wx.showToast({ title: '已确认完成' });
        await this.loadDetail();
        return;
      }
      wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    } catch (err) {
      console.error('确认完成失败', err);
      this.setData({ completeLoading: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },

  async onFavorite() {
    const { id, errand } = this.data;
    if (!id || !errand) return;
    const isFavorited = errand.isFavorited;
    const api = isFavorited ? errandAPI.unfavoriteErrand : errandAPI.favoriteErrand;
    const res = await api(id);
    if (res.code === 200) {
      this.setData({ errand: { ...errand, isFavorited: !isFavorited } });
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' });
    } else {
      wx.showToast({ title: res.message || '操作失败', icon: 'none' });
    }
  },

  onReplyInput(e) {
    this.setData({ replyContent: e.detail.value || '' });
  },

  async submitReply() {
    const { id, errand, replyContent } = this.data;
    const content = (replyContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入回复', icon: 'none' });
      return;
    }
    if (hasUnsupportedEmoji(content)) {
      wx.showToast({ title: '请修改评论后重试', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await errandAPI.publishErrandReply(id, { content });
      this.setData({ submitting: false, replyContent: '' });
      if (res.code === 200 && res.data) {
        invalidateHttpCachePrefix('http_cache:api/errands:');
        const row = {
          ...res.data,
          id: res.data.id || res.data._id,
          createTime: res.data.createTime || res.data.createdAt,
        };
        const replies = [row, ...(errand.replies || [])];
        this.setData({
          errand: { ...errand, replies, replyCount: replies.length },
        });
        wx.showToast({ title: '回复成功' });
      } else {
        wx.showToast({ title: res.message || '回复失败', icon: 'none' });
      }
    } catch (err) {
      console.error('回复失败:', err);
      this.setData({ submitting: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },
});
