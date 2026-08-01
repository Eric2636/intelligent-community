import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { normalizeForumListPost } from '~/utils/forumPostList';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '~/utils/listMutation';

Page({
  data: {
    postList: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this._skipNextShowRefresh = true;
    this.loadPosts();
  },

  onShow() {
    if (redirectIfEntryHidden('forum')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.forumMine);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadPosts({ silent: true });
  },

  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  onAuthorized() {
    this.setData({ authReady: true, showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadPosts();
  },

  async loadPosts({ silent = false } = {}) {
    if (redirectIfEntryHidden('forum')) return;
    if (!(await ensureMutationReady(this))) {
      if (!silent) this.setData({ loading: false });
      return;
    }
    if (!silent) this.setData({ loading: true });
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
    navigateToWithListMutation(
      this,
      `/packageForum/post/index?postId=${id}`,
      'postList',
      normalizeForumListPost,
    );
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
