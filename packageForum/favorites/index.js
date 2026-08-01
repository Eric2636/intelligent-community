import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { normalizeForumListPost } from '~/utils/forumPostList';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '../../utils/listMutation.js';

Page({
  data: {
    list: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this._skipNextShowRefresh = true;
    this.loadList();
  },

  onShow() {
    if (redirectIfEntryHidden('forum')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.forumFavorites);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadList({ silent: true });
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  onAuthorized() {
    this.setData({ authReady: true, showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadList();
  },

  async loadList({ silent = false } = {}) {
    if (redirectIfEntryHidden('forum')) return;
    if (!(await ensureMutationReady(this))) {
      if (!silent) this.setData({ loading: false });
      return;
    }
    if (!silent) this.setData({ loading: true });
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
    const { id } = e.currentTarget.dataset;
    navigateToWithListMutation(
      this,
      `/packageForum/post/index?postId=${id}`,
      'list',
      normalizeForumListPost,
      (mutation) => mutation && mutation.data && mutation.data.isFavorited === false
        ? { type: 'remove', id: mutation.id }
        : mutation,
    );
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
