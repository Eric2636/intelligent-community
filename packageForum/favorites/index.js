import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { normalizeForumListPost } from '~/utils/forumPostList';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this.loadList();
  },

  onShow() {
    if (redirectIfEntryHidden('forum')) return;
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    if (redirectIfEntryHidden('forum')) return;
    this.setData({ loading: true });
    const res = await forumAPI.getMyFavoritePosts();
    if (res.code === 200) {
      const list = (res.data || []).map(normalizeForumListPost);
      this.setData({ list, loading: false });
    } else this.setData({ loading: false });
  },

  onForumListPreviewImage(e) {
    const postId = String(e.currentTarget.dataset.postId || '');
    const current = e.currentTarget.dataset.src;
    const post = (this.data.list || []).find((p) => String(p.id || p._id) === postId);
    if (!post || !post.images || !post.images.length) return;
    wx.previewImage({
      current: current || post.images[0],
      urls: post.images,
    });
  },

  goPost(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageForum/post/index?postId=${id}` });
  },
});
