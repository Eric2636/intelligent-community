import { forumAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { normalizeForumListPost } from '~/utils/forumPostList';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '../../utils/listMutation.js';

Page({
  data: {
    postList: [],
    loading: true,
    authReady: false,
    showManualLoad: false,
    canManageForumPosts: false,
    ownerActionVisible: false,
    ownerActionLoading: false,
    ownerActions: [],
    actionPost: null,
    showRegistrationEntries: false,
    registrationEntries: [],
  },

  onLoad() {
    if (redirectIfEntryHidden('forum')) return;
    this._skipNextShowRefresh = true;
    this.syncForumPermissionFromUserInfo();
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
    this.syncForumPermissionFromUserInfo();
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
    this.syncForumPermissionFromUserInfo();
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

  syncForumPermissionFromUserInfo() {
    const canManageForumPosts = Boolean((getApp().globalData.userInfo || {}).canManageForumPosts);
    if (this.data.canManageForumPosts !== canManageForumPosts) {
      this.setData({ canManageForumPosts });
    }
    return canManageForumPosts;
  },

  onOpenOwnerActions(e) {
    if (this.data.ownerActionLoading) return;
    const id = String(e.currentTarget.dataset.id || '');
    const actionPost = (this.data.postList || []).find((post) => String(post.id || post._id) === id);
    if (!actionPost) return;
    const ownerActions = [];
    if (this.data.canManageForumPosts) {
      ownerActions.push({ label: actionPost.pinned ? '取消置顶' : '置顶', value: 'pin', icon: 'pushpin' });
      const boundUserId = String((getApp().globalData.userInfo || {}).id || '');
      if (boundUserId && String(actionPost.authorId || '') === boundUserId) ownerActions.push({ label: '编辑', value: 'edit', icon: 'edit-1' });
      if (actionPost.featureType === 'REGISTRATION') {
        ownerActions.push({ label: '报名名单', value: 'entries', icon: 'root-list' });
      }
    }
    ownerActions.push({ label: '删除', value: 'delete', icon: 'delete-1', color: '#d54941' });
    this.setData({ actionPost, ownerActions, ownerActionVisible: true });
  },

  onOwnerActionVisibleChange(e) {
    this.setData({ ownerActionVisible: Boolean(e.detail && e.detail.visible) });
  },

  onOwnerActionClose() {
    this.setData({ ownerActionVisible: false });
  },

  replaceActionPost(nextPost) {
    const id = nextPost && (nextPost.id || nextPost._id);
    if (!id) return;
    this.setData({
      postList: this.data.postList.map((post) => (String(post.id || post._id) === String(id) ? nextPost : post)),
      actionPost: nextPost,
    });
  },

  async onOwnerActionSelected(e) {
    const value = e.detail && e.detail.selected && e.detail.selected.value;
    const post = this.data.actionPost;
    this.setData({ ownerActionVisible: false });
    if (!post) return;
    if (value === 'pin') await this.togglePinned(post);
    if (value === 'edit') wx.navigateTo({ url: `/packageForum/publish/index?editPostId=${encodeURIComponent(post.id || post._id)}` });
    if (value === 'entries') await this.loadRegistrationEntries(post);
    if (value === 'delete') this.confirmDeletePost(post);
  },

  async togglePinned(post) {
    if (this.data.ownerActionLoading) return;
    const id = post.id || post._id;
    const pinned = !post.pinned;
    this.setData({ ownerActionLoading: true });
    try {
      const res = await forumAPI.setPostPinned(id, pinned);
      if (res.code !== 200) throw new Error(res.message || '操作失败');
      this.replaceActionPost({ ...post, pinned });
      wx.showToast({ title: pinned ? '已置顶' : '已取消置顶', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ ownerActionLoading: false });
    }
  },

  async loadRegistrationEntries(post) {
    if (this.data.ownerActionLoading) return;
    this.setData({ ownerActionLoading: true });
    try {
      const res = await forumAPI.getPostRegistrationEntries(post.id || post._id);
      if (res.code !== 200) throw new Error(res.message || '获取报名名单失败');
      this.setData({
        registrationEntries: (res.data && res.data.list) || [],
        showRegistrationEntries: true,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '获取报名名单失败', icon: 'none' });
    } finally {
      this.setData({ ownerActionLoading: false });
    }
  },

  confirmDeletePost(post) {
    if (this.data.ownerActionLoading) return;
    const id = post.id || post._id;
    wx.showModal({
      title: '删除帖子',
      content: `删除“${post.title || '这篇帖子'}”后，回复和报名记录也会删除，且无法恢复。`,
      confirmText: '删除',
      confirmColor: '#d54941',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ ownerActionLoading: true });
        try {
          const res = await forumAPI.deletePost(id);
          if (res.code !== 200) throw new Error(res.message || '删除失败');
          this.setData({ postList: this.data.postList.filter((entry) => String(entry.id || entry._id) !== String(id)) });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          this.setData({ ownerActionLoading: false });
        }
      },
    });
  },

  closeRegistrationEntries() { this.setData({ showRegistrationEntries: false }); },

  onRegistrationEntriesVisibleChange(e) {
    this.setData({ showRegistrationEntries: Boolean(e.detail && e.detail.visible) });
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
