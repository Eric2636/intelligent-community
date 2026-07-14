import { taskAPI } from '~/api/cloud';
import { chooseAndUploadMedia, MEDIA_LIMITS } from '~/utils/cloudMedia';
import { ensureMutationReady } from '~/utils/authIdentity';

Page({
  data: {
    title: '',
    desc: '',
    reward: '',
    location: '',
    mediaImages: [],
    mediaVideos: [],
    submitting: false,
    savingDraft: false,
    loadingDraft: false,
    draftId: '',
    descFocus: false,
    showEmojiPanel: false,
  },

  onLoad(options = {}) {
    const draftId = options.draftId ? String(options.draftId) : '';
    if (!draftId) return;
    this.setData({ draftId });
    this.loadDraft(draftId);
  },

  async loadDraft(draftId) {
    this.setData({ loadingDraft: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await taskAPI.getTaskDetail(draftId);
      if (res.code !== 200 || !res.data) {
        wx.showToast({ title: (res && res.message) || '加载草稿失败', icon: 'none' });
        return;
      }
      const raw = res.data;
      if (raw.status && raw.status !== 'draft') {
        wx.showToast({ title: '该任务不是草稿', icon: 'none' });
        return;
      }
      this.setData({
        title: raw.title || '',
        desc: raw.desc || '',
        reward: raw.reward || '',
        location: raw.location || '',
        mediaImages: Array.isArray(raw.images) ? raw.images : [],
        mediaVideos: Array.isArray(raw.videos) ? raw.videos : [],
      });
    } catch (e) {
      console.error('加载草稿失败', e);
      wx.showToast({ title: (e && (e.message || e.errMsg)) || '加载草稿失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loadingDraft: false });
    }
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },
  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },
  onRewardInput(e) {
    this.setData({ reward: e.detail.value });
  },
  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },
  onEmojiHint() {
    this.setData({ showEmojiPanel: !this.data.showEmojiPanel, descFocus: false });
  },
  onEmojiSelect(e) {
    const emoji = String((e.detail && e.detail.emoji) || '');
    if (!emoji) return;
    this.setData({ desc: `${this.data.desc || ''}${emoji}` });
  },

  async onAddMedia() {
    if (!(await ensureMutationReady())) return;
    const { mediaImages, mediaVideos } = this.data;
    try {
      const { images, videos } = await chooseAndUploadMedia({
        folder: 'task/publish',
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

  async saveDraft() {
    if (this.data.savingDraft) return;
    if (!(await ensureMutationReady())) return;
    const { title, desc, reward, location, mediaImages, mediaVideos, draftId } = this.data;
    const editingDraft = Boolean(draftId);
    this.setData({ savingDraft: true });
    try {
      const res = await taskAPI.saveDraftTask({
        taskId: draftId || undefined,
        title: (title || '').trim() || undefined,
        desc: (desc || '').trim() || undefined,
        reward: (reward || '').trim() || undefined,
        location: (location || '').trim() || undefined,
        images: mediaImages,
        videos: mediaVideos,
      });
      if (res.code === 200 && res.data) {
        const id = res.data._id || res.data.id;
        if (id) this.setData({ draftId: id });
        wx.showToast({ title: '草稿已保存', icon: 'success' });
        if (!editingDraft) {
          setTimeout(() => {
            wx.switchTab({ url: '/pages/task/index' });
          }, 600);
        }
      } else {
        wx.showToast({ title: (res && res.message) || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingDraft: false });
    }
  },

  async submit() {
    if (this.data.submitting) return;
    if (!(await ensureMutationReady())) return;
    const { title, desc, reward, location, mediaImages, mediaVideos, draftId } = this.data;
    const t = (title || '').trim();
    if (!t) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }
    const d = (desc || '').trim();
    if (!d && mediaImages.length === 0 && mediaVideos.length === 0) {
      wx.showToast({ title: '请填写任务说明或添加图片/视频', icon: 'none' });
      return;
    }
    const r = (reward || '').trim();
    if (!r || Number.isNaN(Number(r)) || Number(r) <= 0) {
      wx.showToast({ title: '请输入有效佣金金额', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      let res;
      if (draftId) {
        const saveRes = await taskAPI.saveDraftTask({
          taskId: draftId,
          title: t,
          desc: d,
          reward: r,
          location: (location || '').trim() || '线下协商',
          images: mediaImages,
          videos: mediaVideos,
        });
        if (saveRes.code !== 200) {
          wx.showToast({ title: saveRes.message || '保存草稿失败', icon: 'none' });
          return;
        }
        res = await taskAPI.publishDraft(draftId);
      } else {
        res = await taskAPI.publishTask({
          title: t,
          desc: d,
          reward: r,
          location: (location || '').trim() || '线下协商',
          images: mediaImages,
          videos: mediaVideos,
        });
      }
      if (res.code === 200 && res.data) {
        wx.showToast({ title: '发布成功' });
        setTimeout(() => {
          if (draftId) wx.switchTab({ url: '/pages/task/index' });
          else wx.navigateBack();
        }, 800);
      } else {
        wx.showToast({ title: (res && res.message) || '发布失败', icon: 'none' });
      }
    } catch (e) {
      console.error('发布任务失败', e);
      wx.showToast({ title: (e && (e.message || e.errMsg)) || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
