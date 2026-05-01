import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { normalizeForumListPost } from '~/utils/forumPostList';

Page({
  data: {
    postList: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this.loadPosts();
  },

  onShow() {
    if (redirectIfEntryHidden('forum')) return;
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  async loadPosts() {
    if (redirectIfEntryHidden('forum')) return;
    this.setData({ loading: true });
    const res = await forumAPI.getMyPosts();
    if (res.code === 200) {
      const postList = (res.data || []).map(normalizeForumListPost);
      this.setData({ postList, loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  onForumListPreviewImage(e) {
    const postId = String(e.currentTarget.dataset.postId || '');
    const current = e.currentTarget.dataset.src;
    const post = (this.data.postList || []).find((p) => String(p.id || p._id) === postId);
    if (!post || !post.images || !post.images.length) return;
    wx.previewImage({
      current: current || post.images[0],
      urls: post.images,
    });
  },

  goPost(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${id}`,
    });
  },
});
