import { forumAPI } from '~/api/cloud';
import { chooseAndUploadMedia, MEDIA_LIMITS } from '~/utils/cloudMedia';

Page({
  data: {
    title: '',
    content: '',
    mediaImages: [],
    mediaVideos: [],
    submitting: false,
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  async onAddMedia() {
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

  async submit() {
    const { title, content, mediaImages, mediaVideos } = this.data;
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

    this.setData({ submitting: true });

    try {
      const res = await forumAPI.publishPost({
        title: t,
        content: c,
        images: mediaImages,
        videos: mediaVideos,
      });

      this.setData({ submitting: false });

      if (res.code === 200 && res.data) {
        wx.showToast({ title: '发帖成功' });
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
});
