import { getPostDetail, publishReply } from '~/mock/forum/api';

Page({
  data: {
    postId: '',
    post: null,
    replyContent: '',
    loading: true,
    submitting: false,
  },

  onLoad(options) {
    const { postId } = options;
    this.setData({ postId });
    this.loadPost();
  },

  async loadPost() {
    const { postId } = this.data;
    this.setData({ loading: true });
    const res = await getPostDetail(postId);
    if (res.code === 200 && res.data) {
      this.setData({ post: res.data, loading: false });
    } else {
      this.setData({ loading: false });
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
    const res = await publishReply(postId, { content, authorName: '热心网友' });
    this.setData({ submitting: false, replyContent: '' });
    if (res.code === 200 && res.data) {
      const replies = [...(post.replies || []), res.data];
      this.setData({
        post: { ...post, replies, replyCount: replies.length },
      });
      wx.showToast({ title: '回复成功' });
    }
  },
});
