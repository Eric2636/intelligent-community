import { forumAPI } from '~/api/cloud';

Page({
  data: {
    postId: '',
    post: null,
    replyContent: '',
    loading: true,
    submitting: false,
  },

  onLoad(options) {
    const postId = (options.postId || '').trim();

    if (!postId || postId === 'undefined') {
      wx.showToast({
        title: '帖子ID无效',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ postId });
    this.loadPost();
  },

  async onLike() {
    const { postId, post } = this.data
    if (!postId) return
    const isLiked = post.isLiked
    const api = isLiked ? forumAPI.unlikePost : forumAPI.likePost
    const res = await api(postId)
    if (res.code === 200) {
      this.setData({
        post: {
          ...post,
          isLiked: !isLiked,
          likeCount: (res.data && res.data.likeCount) != null ? res.data.likeCount : (post.likeCount || 0) + (isLiked ? -1 : 1)
        }
      })
      wx.showToast({ title: isLiked ? '已取消赞' : '已赞', icon: 'none' })
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' })
  },

  async onFavorite() {
    const { postId, post } = this.data
    if (!postId) return
    const isFavorited = post.isFavorited
    const api = isFavorited ? forumAPI.unfavoritePost : forumAPI.favoritePost
    const res = await api(postId)
    if (res.code === 200) {
      this.setData({ post: { ...post, isFavorited: !isFavorited } })
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' })
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' })
  },

  async loadPost() {
    const { postId } = this.data;

    if (!postId) {
      wx.showToast({
        title: '帖子ID不能为空',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await forumAPI.getPostDetail(postId);

      if (res.code === 200 && res.data) {
        this.setData({ post: res.data, loading: false });
      } else if (res.code === 404) {
        this.setData({ post: null, loading: false });
        wx.showToast({
          title: res.message || '帖子不存在',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        this.setData({ post: null, loading: false });
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (err) {
      this.setData({ post: null, loading: false });
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
    }
  },

  onReplyInput(e) {
    this.setData({ replyContent: e.detail.value });
  },

  async submitReply() {
    const { postId, post, replyContent } = this.data;
    const content = (replyContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await forumAPI.publishReply(postId, { content });
      this.setData({ submitting: false, replyContent: '' });
      if (res.code === 200 && res.data) {
        const replies = [...(post.replies || []), res.data];
        this.setData({
          post: { ...post, replies, replyCount: replies.length },
        });
        wx.showToast({ title: '回复成功' });
      } else {
        wx.showToast({
          title: res.message || '回复失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('回复失败:', err);
      this.setData({ submitting: false });
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
    }
  },
});
