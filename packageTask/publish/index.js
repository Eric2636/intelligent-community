import { taskAPI } from '~/api/cloud';
import { chooseAndUploadMedia, MEDIA_LIMITS } from '~/utils/cloudMedia';

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
    draftId: '',
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

  async onAddMedia() {
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
    const { title, desc, reward, location, mediaImages, mediaVideos, draftId } = this.data;
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
      this.setData({ savingDraft: false });
      if (res.code === 200 && res.data) {
        const id = res.data._id || res.data.id;
        if (id) this.setData({ draftId: id });
        wx.showToast({ title: '草稿已保存', icon: 'success' });
      } else {
        wx.showToast({ title: (res && res.message) || '保存失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ savingDraft: false });
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    }
  },

  async submit() {
    const { title, desc, reward, location, mediaImages, mediaVideos } = this.data;
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
    const res = await taskAPI.publishTask({
      title: t,
      desc: d,
      reward: r,
      location: (location || '').trim() || '线下协商',
      images: mediaImages,
      videos: mediaVideos,
    });
    this.setData({ submitting: false });
    if (res.code === 200 && res.data) {
      wx.showToast({ title: '发布成功' });
      setTimeout(() => wx.navigateBack(), 800);
    } else {
      wx.showToast({ title: (res && res.message) || '发布失败', icon: 'none' });
    }
  },
});
