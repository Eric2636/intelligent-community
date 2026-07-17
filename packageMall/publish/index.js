import { mallAPI } from '~/api/cloud';
import { chooseAndUploadMedia } from '~/utils/cloudMedia';
import { ensureMutationReady } from '~/utils/authIdentity';

Page({
  data: {
    categories: [],
    categoryIndex: 0,
    categoryName: '跳蚤市场',
    categoryId: 'flea',
    title: '',
    price: '',
    desc: '',
    contact: '',
    location: null,
    mainImages: [],
    subImages: [],
    videos: [],
    submitting: false,
  },

  onLoad() {
    mallAPI.getCategories().then((res) => {
      if (res.code !== 200) return;
      const list = res.data || [];
      const first = list[0] || null;
      this.setData({
        categories: list,
        categoryIndex: 0,
        categoryId: first ? first.id : 'flea',
        categoryName: first ? first.name : '跳蚤市场',
      });
    });
  },

  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const list = this.data.categories;
    const item = list[idx];
    if (item) this.setData({ categoryIndex: idx, categoryId: item.id, categoryName: item.name });
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onPriceInput(e) { this.setData({ price: e.detail.value }); },
  onDescInput(e) { this.setData({ desc: e.detail.value }); },
  onContactInput(e) { this.setData({ contact: e.detail.value }); },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          location: {
            name: res.name || '',
            address: res.address || '',
            latitude: res.latitude,
            longitude: res.longitude,
          },
        });
      },
      fail: (err) => {
        if (err && /auth deny|auth denied|authorize/i.test(err.errMsg || '')) {
          wx.showToast({ title: '请允许位置权限后再选择门店', icon: 'none' });
        }
      },
    });
  },

  clearLocation() {
    this.setData({ location: null });
  },

  async onAddMainImages() {
    if (!(await ensureMutationReady())) return;
    const { mainImages, subImages } = this.data;
    if (mainImages.length >= 1) {
      wx.showToast({ title: '主图只能 1 张', icon: 'none' });
      return;
    }
    const remainTotal = Math.max(0, 6 - subImages.length);
    if (remainTotal <= 0) {
      wx.showToast({ title: '图片最多 6 张', icon: 'none' });
      return;
    }
    const { images } = await chooseAndUploadMedia({
      folder: 'mall/items',
      maxImages: 1,
      maxVideos: 0,
      existingImageCount: 0,
      existingVideoCount: 0,
    });
    if (!images.length) return;
    this.setData({ mainImages: images.slice(0, 1) });
  },

  async onAddSubImages() {
    if (!(await ensureMutationReady())) return;
    const { mainImages, subImages } = this.data;
    const remain = Math.max(0, 6 - (mainImages.length + subImages.length));
    if (remain <= 0) {
      wx.showToast({ title: '图片最多 6 张', icon: 'none' });
      return;
    }
    const { images } = await chooseAndUploadMedia({
      folder: 'mall/items',
      maxImages: remain,
      maxVideos: 0,
      existingImageCount: 0,
      existingVideoCount: 0,
    });
    if (!images.length) return;
    this.setData({ subImages: subImages.concat(images) });
  },

  async onAddVideos() {
    if (!(await ensureMutationReady())) return;
    const { videos } = this.data;
    const remain = Math.max(0, 2 - videos.length);
    if (remain <= 0) {
      wx.showToast({ title: '视频最多 2 段', icon: 'none' });
      return;
    }
    const { videos: newVideos } = await chooseAndUploadMedia({
      folder: 'mall/items',
      maxImages: 0,
      maxVideos: remain,
      existingImageCount: 0,
      existingVideoCount: 0,
    });
    if (!newVideos.length) return;
    this.setData({ videos: videos.concat(newVideos) });
  },

  onRemoveMedia(e) {
    const { kind, index } = e.currentTarget.dataset;
    const i = Number(index);
    if (kind === 'main') {
      this.setData({ mainImages: this.data.mainImages.filter((_, j) => j !== i) });
    } else if (kind === 'sub') {
      this.setData({ subImages: this.data.subImages.filter((_, j) => j !== i) });
    } else if (kind === 'video') {
      this.setData({ videos: this.data.videos.filter((_, j) => j !== i) });
    }
  },

  onPreviewImage(e) {
    const { current, urls } = e.currentTarget.dataset;
    if (!urls || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  async submit() {
    if (!(await ensureMutationReady())) return;
    const { categoryId, title, price, desc, contact, location, mainImages, subImages, videos } = this.data;
    const t = (title || '').trim();
    if (!t) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!mainImages.length) {
      wx.showToast({ title: '请至少上传 1 张主图', icon: 'none' });
      return;
    }
    if (mainImages.length + subImages.length > 6) {
      wx.showToast({ title: '图片最多 6 张', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const res = await mallAPI.publishItem({
      categoryId,
      title: t,
      price: (price || '').trim(),
      unit: '元',
      desc: (desc || '').trim(),
      contact: (contact || '').trim() || '保密',
      locationName: location ? location.name : undefined,
      locationAddress: location ? location.address : undefined,
      latitude: location ? location.latitude : undefined,
      longitude: location ? location.longitude : undefined,
      mainImages,
      subImages,
      videos,
    });
    this.setData({ submitting: false });
    if (res.code === 200 && res.data) {
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },
});
