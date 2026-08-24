import { forumAPI, userAPI } from '~/api/cloud';
import { chooseAndUploadMedia, MEDIA_LIMITS } from '~/utils/cloudMedia';
import { ensureLoggedIn, ensureMutationReady } from '~/utils/authIdentity';
import { sha256File } from '~/utils/sha256';
import { buildForumPostEditPayload } from '~/utils/forumPostPayload';

Page({
  data: {
    title: '',
    content: '',
    mediaImages: [],
    mediaVideos: [],
    submitting: false,
    contentFocus: false,
    showEmojiPanel: false,
    canManageForumPosts: false,
    featureType: 'CONTENT',
    registrationCapacity: '',
    registrationDeadlineAt: '',
    pinned: false,
    attachments: [],
    attachmentUploading: false,
    editPostId: '',
    editing: false,
  },

  async onLoad(options = {}) {
    const app = getApp();
    this._authPageAlive = true;
    this._onUserInfoChange = () => this.syncForumPermissionFromUserInfo();
    app.eventBus.on('userInfoChange', this._onUserInfoChange);
    this.syncForumPermissionFromUserInfo();
    if (await ensureLoggedIn(this)) {
      await this.refreshForumPermission();
      const editPostId = String(options.editPostId || '').trim();
      if (editPostId && this.data.canManageForumPosts) await this.loadEditPost(editPostId);
    }
  },

  onShow() {
    this.refreshForumPermission();
  },

  syncForumPermissionFromUserInfo() {
    const user = getApp().globalData.userInfo || {};
    const canManageForumPosts = Boolean(user.canManageForumPosts);
    if (this.data.canManageForumPosts !== canManageForumPosts) {
      this.setData({ canManageForumPosts });
    }
    return canManageForumPosts;
  },

  async refreshForumPermission() {
    this.syncForumPermissionFromUserInfo();
    let token = '';
    try {
      token = wx.getStorageSync('access_token') || '';
    } catch (e) {
      return this.data.canManageForumPosts;
    }
    if (!token) return this.data.canManageForumPosts;
    if (this._forumPermissionRequest) return this._forumPermissionRequest;

    this._forumPermissionRequest = (async () => {
      try {
        const res = await userAPI.getUserInfo();
        if (!this._authPageAlive || !res || res.code !== 200 || !res.data) {
          return this.data.canManageForumPosts;
        }
        const app = getApp();
        app.globalData.userInfo = { ...(app.globalData.userInfo || {}), ...res.data };
        return this.syncForumPermissionFromUserInfo();
      } catch (err) {
        console.warn('刷新发帖权限失败:', err);
        return this.data.canManageForumPosts;
      } finally {
        this._forumPermissionRequest = null;
      }
    })();
    return this._forumPermissionRequest;
  },

  onAuthorized() {
    return this.refreshForumPermission();
  },

  async loadEditPost(postId) {
    try {
      const res = await forumAPI.getPostDetail(postId);
      if (!res || res.code !== 200 || !res.data) throw new Error('帖子不存在');
      const post = res.data;
      this.setData({ editPostId: postId, editing: true, title: post.title || '', content: post.content || '', mediaImages: Array.isArray(post.images) ? post.images : [], mediaVideos: Array.isArray(post.videos) ? post.videos : [], attachments: Array.isArray(post.attachments) ? post.attachments.map((item) => ({ mediaAssetId: item.mediaAssetId, name: item.name || '附件', sizeBytes: item.sizeBytes || 0, contentType: item.contentType || '' })) : [], featureType: post.featureType || 'CONTENT', pinned: Boolean(post.pinned) });
    } catch (error) {
      wx.showToast({ title: error.message || '加载帖子失败', icon: 'none' });
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },
  onFeatureTypeChange(e) { this.setData({ featureType: e.detail.value }); },
  onFeatureTypeSelect(e) { this.setData({ featureType: e.currentTarget.dataset.value }); },
  onCapacityInput(e) { this.setData({ registrationCapacity: e.detail.value }); },
  onDeadlineChange(e) { this.setData({ registrationDeadlineAt: e.detail.value }); },
  onPinnedChange(e) { this.setData({ pinned: e.detail.value }); },
  onEmojiHint() {
    this.setData({ showEmojiPanel: !this.data.showEmojiPanel, contentFocus: false });
  },
  onEmojiSelect(e) {
    const emoji = String((e.detail && e.detail.emoji) || '');
    if (!emoji) return;
    this.setData({ content: `${this.data.content || ''}${emoji}` });
  },

  async onAddMedia() {
    if (!(await ensureMutationReady(this))) return;
    const { mediaImages, mediaVideos } = this.data;
    try {
      const { images, videos } = await chooseAndUploadMedia({
        folder: 'forum/posts',
        maxImages: MEDIA_LIMITS.maxImages,
        maxVideos: MEDIA_LIMITS.maxVideos,
        existingImageCount: mediaImages.length,
        existingVideoCount: mediaVideos.length,
      });
      if (!images.length && !videos.length) return;
      this.setData({
        mediaImages: mediaImages.concat(images),
        mediaVideos: mediaVideos.concat(videos),
        showEmojiPanel: false,
      });
    } catch (e) {
      console.error(e);
    }
  },

  onRemoveMedia(e) {
    const { kind, index } = e.currentTarget.dataset;
    const i = Number(index);
    if (kind === 'image') {
      const mediaImages = this.data.mediaImages.filter((_, j) => j !== i);
      this.setData({ mediaImages });
    } else if (kind === 'video') {
      const mediaVideos = this.data.mediaVideos.filter((_, j) => j !== i);
      this.setData({ mediaVideos });
    }
  },

  onPreviewImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    if (!urls || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  async onAddAttachment() {
    if (!this.data.canManageForumPosts || this.data.attachmentUploading) return;
    const remain = 5 - this.data.attachments.length;
    if (remain <= 0) { wx.showToast({ title: '每篇帖子最多5个附件', icon: 'none' }); return; }
    wx.chooseMessageFile({ count: remain, type: 'file', extension: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'], success: async ({ tempFiles = [] }) => {
      this.setData({ attachmentUploading: true });
      try {
        const added = [];
        for (const file of tempFiles) {
          if (Number(file.size) > 20 * 1024 * 1024) throw new Error('单个附件不能超过20MB');
          const filename = file.name || file.path.split('/').pop() || '附件';
          const contentType = file.type || 'application/octet-stream';
          const sha256 = await sha256File(file.path);
          const checked = await forumAPI.checkForumAttachment({ sha256, filename, contentType, sizeBytes: Number(file.size) });
          const payload = checked && checked.data ? checked.data : checked;
          const uploaded = payload && payload.exists ? payload : await forumAPI.uploadForumAttachment(file.path, { sha256, filename, contentType, sizeBytes: Number(file.size) });
          added.push({ mediaAssetId: uploaded.mediaAssetId || uploaded.id, name: uploaded.name || filename, sizeBytes: uploaded.sizeBytes || file.size, contentType: uploaded.contentType || contentType });
        }
        this.setData({ attachments: this.data.attachments.concat(added) });
      } catch (err) {
        wx.showToast({ title: err.message || '附件上传失败', icon: 'none' });
      } finally { this.setData({ attachmentUploading: false }); }
    } });
  },

  onRemoveAttachment(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ attachments: this.data.attachments.filter((_, i) => i !== index) });
  },

  async submit() {
    if (!(await ensureMutationReady(this))) return;
    this.syncForumPermissionFromUserInfo();
    const { title, content, mediaImages, mediaVideos, canManageForumPosts, featureType, registrationCapacity, registrationDeadlineAt, pinned, attachments, attachmentUploading } = this.data;
    if (attachmentUploading) { wx.showToast({ title: '附件上传中，请稍候', icon: 'none' }); return; }
    const t = (title || '').trim();
    const c = (content || '').trim();

    if (!t) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!c && mediaImages.length === 0 && mediaVideos.length === 0) {
      wx.showToast({ title: '请输入内容或添加图片/视频', icon: 'none' });
      return;
    }
    if (canManageForumPosts && !this.data.editing && featureType === 'REGISTRATION') {
      if (!/^\d+$/.test(String(registrationCapacity)) || Number(registrationCapacity) < 1) {
        wx.showToast({ title: '请设置报名人数上限', icon: 'none' });
        return;
      }
      if (!registrationDeadlineAt || new Date(`${registrationDeadlineAt}T23:59:59`).getTime() <= Date.now()) {
        wx.showToast({ title: '请选择未来的报名截止日期', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });

    try {
      const payload = this.data.editing
        ? buildForumPostEditPayload({ title: t, content: c, mediaImages, mediaVideos, attachments })
        : {
          title: t,
          content: c,
          images: mediaImages,
          videos: mediaVideos,
          ...(canManageForumPosts ? {
          postType: 'NORMAL',
          featureType,
          pinned,
          attachments: attachments.map((item) => ({ mediaAssetId: item.mediaAssetId })),
          ...(featureType === 'REGISTRATION' ? { registrationCapacity: Number(registrationCapacity), registrationDeadlineAt: new Date(`${registrationDeadlineAt}T23:59:59`).toISOString() } : {}),
          } : {}),
        };
      const res = this.data.editing ? await forumAPI.updatePost(this.data.editPostId, payload) : await forumAPI.publishPost(payload);

      this.setData({ submitting: false });

      if (res.code === 200 && res.data) {
          wx.showToast({ title: this.data.editing ? '保存成功' : '发帖成功' });
        setTimeout(() => {
          wx.navigateBack();
        }, 800);
      } else {
        wx.showToast({
          title: res.message || '发帖失败',
          icon: 'none',
        });
      }
    } catch (err) {
      console.error('发布帖子失败:', err);
      this.setData({ submitting: false });
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none',
      });
    }
  },

  onUnload() {
    this._authPageAlive = false;
    const app = getApp();
    if (this._onUserInfoChange) app.eventBus.off('userInfoChange', this._onUserInfoChange);
  },
});
