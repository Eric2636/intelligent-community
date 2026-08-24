import { forumAPI } from '~/api/cloud';
import { chooseAndUploadMedia, MEDIA_LIMITS } from '~/utils/cloudMedia';
import { FORUM_REPLY_EMOJI_LIST } from '~/utils/forumReplyEmoji';
import { ensureMutationReady } from '~/utils/authIdentity';
import { emitListMutation } from '../../utils/listMutation.js';

function firstUrl(list) {
  return Array.isArray(list) && list.length ? String(list[0] || '') : '';
}

function withImage(payload, imageUrl) {
  return imageUrl ? { ...payload, imageUrl } : payload;
}

/** 与任务详情等页一致：自建后端 userId + 兼容 openid */
function getMeIds() {
  try {
    const app = getApp();
    const me = (app.globalData && app.globalData.userInfo) || null;
    return {
      userId: me && me.id != null ? String(me.id).trim() : '',
      openid: me && me.openid != null ? String(me.openid).trim() : '',
    };
  } catch (e) {
    return { userId: '', openid: '' };
  }
}

function isSameAuthor(authorId, me) {
  const aid = authorId != null && authorId !== '' ? String(authorId).trim() : '';
  if (!aid) return false;
  if (me.userId && aid === me.userId) return true;
  if (me.openid && aid === me.openid) return true;
  return false;
}

function computeCanPublish(replyContent, replyImages, replyVideos) {
  const hasText = String(replyContent || '').trim().length > 0;
  return hasText || (replyImages && replyImages.length > 0) || (replyVideos && replyVideos.length > 0);
}

function reactionCountsToList(rc) {
  if (!rc || typeof rc !== 'object') return [];
  return Object.keys(rc)
    .filter((k) => (rc[k] || 0) > 0)
    .map((emoji) => ({ emoji, count: rc[emoji] }));
}

function normalizeReply(r, me) {
  if (!r) return r;
  const rc = r.reactionCounts && typeof r.reactionCounts === 'object' ? r.reactionCounts : {};
  const depth = typeof r.depth === 'number' ? r.depth : 0;
  return {
    ...r,
    id: r.id || r._id,
    depth,
    padLeftRpx: depth > 0 ? 24 + depth * 28 : 0,
    isAuthor: isSameAuthor(r.authorId, me),
    authorAvatar: r.authorAvatar || '',
    likeCount: r.likeCount == null ? 0 : r.likeCount,
    isLiked: Boolean(r.isLiked),
    favoriteCount: r.favoriteCount == null ? 0 : r.favoriteCount,
    isFavorited: Boolean(r.isFavorited),
    reactionCounts: rc,
    reactionList: reactionCountsToList(rc),
    myReaction: r.myReaction || '',
    images: Array.isArray(r.images) ? r.images : [],
    videos: Array.isArray(r.videos) ? r.videos : [],
  };
}

function normalizeForumPost(raw) {
  if (!raw) return null;
  const me = getMeIds();
  const images = Array.isArray(raw.images) ? raw.images : [];
  const videos = Array.isArray(raw.videos) ? raw.videos : [];
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const replies = (raw.replies || []).map((r) => normalizeReply(r, me));
  return {
    ...raw,
    images,
    videos,
    attachments,
    replies,
    isAuthor: isSameAuthor(raw.authorId, me),
    authorAvatar: raw.authorAvatar || '',
  };
}

Page({
  data: {
    postId: '',
    post: null,
    replyContent: '',
    replyImages: [],
    replyVideos: [],
    loading: true,
    submitting: false,
    deletingPost: false,
    registrationSubmitting: false,
    canPublish: false,
    replyFocus: false,
    replyTarget: null,
    replyPlaceholderText: '请输入评论',
    showEmojiPanel: false,
    replyReactionEmojis: FORUM_REPLY_EMOJI_LIST,
    reactionPanelReplyId: '',
    anchor: '',
  },

  onOpenAttachment(e) {
    const item = e.currentTarget.dataset.item || {};
    if (!item.url) return;
    wx.downloadFile({ url: item.url, success: (res) => {
      if (res.statusCode !== 200) { wx.showToast({ title: '附件下载失败', icon: 'none' }); return; }
      wx.openDocument({ filePath: res.tempFilePath, showMenu: true, fail: () => wx.showToast({ title: '暂不支持打开此文件', icon: 'none' }) });
    }, fail: () => wx.showToast({ title: '附件下载失败', icon: 'none' }) });
  },

  onLoad(options) {
    const postId = (options.postId || '').trim();
    const anchor = (options.anchor || '').trim();

    if (!postId || postId === 'undefined') {
      wx.showToast({
        title: '帖子ID无效',
        icon: 'none',
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ postId, anchor });
    this.loadPost();
  },

  async onLike() {
    if (!(await ensureMutationReady(this))) return;
    const { postId, post } = this.data;
    if (!postId) return;
    const {isLiked} = post;
    const api = isLiked ? forumAPI.unlikePost : forumAPI.likePost;
    const res = await api(postId);
    if (res.code === 200) {
      this.setData({
        post: {
          ...post,
          isLiked: !isLiked,
          likeCount:
            (res.data && res.data.likeCount) != null
              ? res.data.likeCount
              : (post.likeCount || 0) + (isLiked ? -1 : 1),
        },
      });
      wx.showToast({ title: isLiked ? '已取消赞' : '已赞', icon: 'none' });
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
  },

  async onDeletePost() {
    if (!(await ensureMutationReady(this))) return;
    const { postId, post, deletingPost } = this.data;
    if (!post || !post.isAuthor || deletingPost) return;
    wx.showModal({
      title: '删除帖子',
      content: '删除后无法恢复，确认删除该帖及全部回复？',
      confirmText: '删除',
      confirmColor: '#e34d59',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ deletingPost: true });
        try {
          const r = await forumAPI.deletePost(postId);
          if (r && r.code === 200) {
            wx.showToast({ title: '已删除', icon: 'success' });
            emitListMutation(this, { type: 'remove', id: postId });
            setTimeout(() => wx.navigateBack(), 400);
          } else {
            wx.showToast({ title: (r && r.message) || '删除失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
        } finally {
          this.setData({ deletingPost: false });
        }
      },
    });
  },

  async onRegistrationAction() {
    if (!(await ensureMutationReady(this))) return;
    const { postId, post, registrationSubmitting } = this.data;
    if (!post || post.featureType !== 'REGISTRATION' || registrationSubmitting) return;
    const api = post.registration && post.registration.isRegistered ? forumAPI.cancelPostRegistration : forumAPI.registerPost;
    this.setData({ registrationSubmitting: true });
    try {
      const res = await api(postId);
      if (res.code !== 200) throw new Error(res.message || '操作失败');
      await this.loadPost({ silent: true });
      wx.showToast({ title: post.registration && post.registration.isRegistered ? '已取消报名' : '报名成功' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ registrationSubmitting: false });
    }
  },

  async onDeleteReply(e) {
    if (!(await ensureMutationReady(this))) return;
    const replyId = e.currentTarget.dataset.rid;
    const { postId, post } = this.data;
    if (!replyId || !post) return;
    wx.showModal({
      title: '删除回复',
      content: '确认删除这条回复？',
      confirmText: '删除',
      confirmColor: '#e34d59',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const r = await forumAPI.deleteReply(postId, replyId);
          if (r && r.code === 200) {
            wx.showToast({ title: '已删除', icon: 'none' });
            await this.loadPost({ silent: true });
          } else {
            wx.showToast({ title: (r && r.message) || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      },
    });
  },

  async onFavorite() {
    if (!(await ensureMutationReady(this))) return;
    const { postId, post } = this.data;
    if (!postId) return;
    const {isFavorited} = post;
    const api = isFavorited ? forumAPI.unfavoritePost : forumAPI.favoritePost;
    const res = await api(postId);
    if (res.code === 200) {
      this.setData({ post: { ...post, isFavorited: !isFavorited } });
      wx.showToast({ title: isFavorited ? '已取消收藏' : '已收藏', icon: 'none' });
    } else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
  },

  async loadPost(options = {}) {
    const silent = options.silent === true;
    const { postId } = this.data;

    if (!postId) {
      wx.showToast({
        title: '帖子ID不能为空',
        icon: 'none',
      });
      return;
    }

    if (!silent) this.setData({ loading: true });

    try {
      const res = await forumAPI.getPostDetail(postId);

      if (res.code === 200 && res.data) {
        const post = normalizeForumPost(res.data);
        this.setData(
          {
            post,
            loading: silent ? this.data.loading : false,
          },
          () => {
            if (this.data.anchor === 'comments') this.scrollToComments();
          },
        );
        emitListMutation(this, { type: 'upsert', id: postId, data: post });
      } else if (res.code === 404) {
        if (!silent) {
          this.setData({ post: null, loading: false });
          wx.showToast({
            title: res.message || '帖子不存在',
            icon: 'none',
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      } else if (!silent) {
          this.setData({ post: null, loading: false });
          wx.showToast({
            title: res.message || '加载失败',
            icon: 'none',
          });
        }
    } catch (err) {
      if (!silent) {
        this.setData({ post: null, loading: false });
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none',
        });
      }
    }
  },

  scrollToComments() {
    setTimeout(() => {
      wx.pageScrollTo({
        selector: '#post-comments',
        duration: 300,
        fail: () => {},
      });
    }, 120);
  },

  onShareAppMessage() {
    const { postId, post } = this.data;
    const title = post
      ? `${post.postType === 'ANNOUNCEMENT' ? '公告｜' : ''}${post.title || '小区留言'}`
      : '小区留言';
    this.recordPostShare();
    return withImage(
      {
        title,
        path: `/packageForum/post/index?postId=${encodeURIComponent(postId || '')}`,
      },
      firstUrl(post && post.images),
    );
  },

  onShareTimeline() {
    const { postId, post } = this.data;
    const title = post
      ? `${post.postType === 'ANNOUNCEMENT' ? '公告｜' : ''}${post.title || '小区留言'}`
      : '小区留言';
    this.recordPostShare();
    return withImage(
      {
        title,
        query: `postId=${encodeURIComponent(postId || '')}`,
      },
      firstUrl(post && post.images),
    );
  },

  recordPostShare() {
    const { postId, post } = this.data;
    if (!postId || !post) return;
    const currentShareCount = Number(post.shareCount || post.forwardCount || 0);
    this.setData({
      post: {
        ...post,
        shareCount: currentShareCount + 1,
        forwardCount: currentShareCount + 1,
      },
    });
    forumAPI.recordPostShare(postId)
      .then((res) => {
        if (res && res.code === 200 && res.data && res.data.shareCount != null) {
          this.setData({
            post: {
              ...this.data.post,
              shareCount: res.data.shareCount,
              forwardCount: res.data.shareCount,
            },
          });
        }
      })
      .catch((err) => {
        console.error('记录帖子分享失败', err);
      });
  },

  patchReply(post, replyId, patch) {
    const replies = (post.replies || []).map((x) => {
      if (String(x.id) !== String(replyId)) return x;
      const next = { ...x, ...patch };
      const rc = next.reactionCounts && typeof next.reactionCounts === 'object' ? next.reactionCounts : {};
      next.reactionList = reactionCountsToList(rc);
      return next;
    });
    return { ...post, replies };
  },

  onCancelReplyTarget() {
    this.setData({
      replyTarget: null,
      replyPlaceholderText: '请输入评论',
    });
  },

  onReplyToTap(e) {
    const {rid} = e.currentTarget.dataset;
    const name = e.currentTarget.dataset.name || '邻居';
    if (!rid) return;
    this.setData({
      replyTarget: { id: rid, authorName: name },
      replyPlaceholderText: '请输入评论',
    });
  },

  async onReplyLike(e) {
    if (!(await ensureMutationReady(this))) return;
    const {rid} = e.currentTarget.dataset;
    const { postId, post } = this.data;
    if (!rid || !post) return;
    const reply = (post.replies || []).find((x) => String(x.id) === String(rid));
    if (!reply) return;
    try {
      const api = reply.isLiked ? forumAPI.unlikeReply : forumAPI.likeReply;
      const res = await api(postId, rid);
      if (res.code === 200 && res.data) {
        const next = this.patchReply(post, rid, {
          isLiked: res.data.isLiked,
          likeCount: res.data.likeCount,
        });
        this.setData({ post: next });
      } else wx.showToast({ title: (res && res.message) || '操作失败', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '网络错误', icon: 'none' });
    }
  },

  async onReplyFavorite(e) {
    if (!(await ensureMutationReady(this))) return;
    const {rid} = e.currentTarget.dataset;
    const { postId, post } = this.data;
    if (!rid || !post) return;
    const reply = (post.replies || []).find((x) => String(x.id) === String(rid));
    if (!reply) return;
    try {
      const api = reply.isFavorited ? forumAPI.unfavoriteReply : forumAPI.favoriteReply;
      const res = await api(postId, rid);
      if (res.code === 200 && res.data) {
        const next = this.patchReply(post, rid, {
          isFavorited: res.data.isFavorited,
          favoriteCount: res.data.favoriteCount,
        });
        this.setData({ post: next });
        wx.showToast({ title: res.data.isFavorited ? '已收藏该评论' : '已取消收藏', icon: 'none' });
      } else wx.showToast({ title: (res && res.message) || '操作失败', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '网络错误', icon: 'none' });
    }
  },

  async setReplyReaction(rid, emoji) {
    if (!(await ensureMutationReady(this))) return;
    const { post } = this.data;
    if (!rid || !post) return;
    try {
      const r = await forumAPI.setReplyReaction(this.data.postId, rid, emoji);
      if (r.code === 200 && r.data) {
        const next = this.patchReply(post, rid, {
          reactionCounts: r.data.reactionCounts,
          myReaction: r.data.myReaction,
        });
        this.setData({ post: next, reactionPanelReplyId: '' });
      } else wx.showToast({ title: (r && r.message) || '操作失败', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '网络错误', icon: 'none' });
    }
  },

  onReplyEmojiOpen(e) {
    const { rid } = e.currentTarget.dataset;
    if (!rid) return;
    this.setData({
      reactionPanelReplyId: this.data.reactionPanelReplyId === rid ? '' : rid,
      showEmojiPanel: false,
    });
  },

  onReplyReactionSelect(e) {
    const emoji = String((e.detail && e.detail.emoji) || '');
    const { reactionPanelReplyId } = this.data;
    if (!emoji || !reactionPanelReplyId) return;
    this.setReplyReaction(reactionPanelReplyId, emoji);
  },

  onClearReplyReaction(e) {
    const { rid } = e.currentTarget.dataset;
    if (!rid) return;
    this.setReplyReaction(rid, '');
  },

  onReplyInput(e) {
    const replyContent = e.detail.value;
    const canPublish = computeCanPublish(replyContent, this.data.replyImages, this.data.replyVideos);
    this.setData({ replyContent, canPublish });
  },

  onReplyEmojiHint() {
    this.setData({
      showEmojiPanel: !this.data.showEmojiPanel,
      reactionPanelReplyId: '',
      replyFocus: false,
    });
  },

  onReplyEmojiSelect(e) {
    const emoji = String((e.detail && e.detail.emoji) || '');
    if (!emoji) return;
    const replyContent = `${this.data.replyContent || ''}${emoji}`;
    const canPublish = computeCanPublish(replyContent, this.data.replyImages, this.data.replyVideos);
    this.setData({ replyContent, canPublish });
  },

  async onReplyAddMedia() {
    if (!(await ensureMutationReady(this))) return;
    const { replyImages, replyVideos } = this.data;
    try {
      const { images, videos } = await chooseAndUploadMedia({
        folder: 'forum/replies',
        maxImages: 6,
        maxVideos: MEDIA_LIMITS.maxVideos,
        existingImageCount: replyImages.length,
        existingVideoCount: replyVideos.length,
      });
      if (!images.length && !videos.length) return;
      const nextImages = replyImages.concat(images);
      const nextVideos = replyVideos.concat(videos);
      const canPublish = computeCanPublish(this.data.replyContent, nextImages, nextVideos);
      this.setData({
        replyImages: nextImages,
        replyVideos: nextVideos,
        canPublish,
        showEmojiPanel: false,
      });
    } catch (e) {
      console.error(e);
    }
  },

  onRemoveReplyMedia(e) {
    const { kind, index } = e.currentTarget.dataset;
    const i = Number(index);
    if (kind === 'image') {
      const replyImages = this.data.replyImages.filter((_, j) => j !== i);
      const canPublish = computeCanPublish(this.data.replyContent, replyImages, this.data.replyVideos);
      this.setData({ replyImages, canPublish });
    } else if (kind === 'video') {
      const replyVideos = this.data.replyVideos.filter((_, j) => j !== i);
      const canPublish = computeCanPublish(this.data.replyContent, this.data.replyImages, replyVideos);
      this.setData({ replyVideos, canPublish });
    }
  },

  onPreviewPostImages(e) {
    const {current} = e.currentTarget.dataset;
    const urls = this.data.post.images || [];
    if (!urls.length) return;
    wx.previewImage({ current, urls });
  },

  onPreviewReplyImage(e) {
    const {rid} = e.currentTarget.dataset;
    const current = e.currentTarget.dataset.src;
    const { post } = this.data;
    const reply = (post.replies || []).find((x) => String(x.id) === String(rid));
    if (!reply) return;
    const urls = reply.images || [];
    if (!urls.length) return;
    wx.previewImage({ current, urls });
  },

  async submitReply() {
    if (this.data.submitting) return;
    if (!(await ensureMutationReady(this))) return;
    const { postId, replyContent, replyImages, replyVideos, replyTarget } = this.data;
    const content = (replyContent || '').trim();
    if (!content && replyImages.length === 0 && replyVideos.length === 0) {
      wx.showToast({ title: '请输入回复或添加图片/视频', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const payload = {
        content,
        images: replyImages,
        videos: replyVideos,
      };
      if (replyTarget && replyTarget.id) {
        payload.parentReplyId = replyTarget.id;
      }
      const res = await forumAPI.publishReply(postId, payload);
      this.setData({
        submitting: false,
        replyContent: '',
        replyImages: [],
        replyVideos: [],
        canPublish: false,
        replyTarget: null,
        replyPlaceholderText: '请输入评论',
        showEmojiPanel: false,
      });
      if (res.code === 200) {
        wx.showToast({ title: '回复成功' });
        await this.loadPost({ silent: true });
      } else {
        wx.showToast({
          title: res.message || '回复失败',
          icon: 'none',
        });
      }
    } catch (err) {
      console.error('回复失败:', err);
      this.setData({ submitting: false });
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none',
      });
    }
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
