import { mallAPI } from '~/api/cloud';
import { chooseAndUploadMedia } from '~/utils/cloudMedia';
import { ensureMutationReady } from '~/utils/authIdentity';
import { emitListMutation } from '~/utils/listMutation';

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
    itemId: '',
    isEditMode: false,
  },

  async onLoad(options = {}) {
    const itemId = options.id || '';
    this.setData({ itemId, isEditMode: Boolean(itemId) });
    const categoriesRes = await mallAPI.getCategories();
    if (categoriesRes.code === 200) {
      const list = categoriesRes.data || [];
      const first = list[0] || null;
      this.setData({
        categories: list,
        categoryIndex: 0,
        categoryId: first ? first.id : 'flea',
        categoryName: first ? first.name : '跳蚤市场',
      });
    }
    if (itemId) await this.loadEditingItem(itemId);
  },

  async loadEditingItem(itemId) {
    const res = await mallAPI.getItemDetail(itemId);
    if (res.code !== 200 || !res.data) return;
    const item = res.data;
    const categories = this.data.categories || [];
    const matchedIndex = categories.findIndex((category) => category.id === item.categoryId);
    const categoryIndex = matchedIndex >= 0 ? matchedIndex : 0;
    const selectedCategory = categories[categoryIndex];
    let mainImages = [];
    if (Array.isArray(item.mainImages) && item.mainImages.length) mainImages = item.mainImages.slice(0, 1);
    else if (item.coverImage) mainImages = [item.coverImage];
    this.setData({
      categoryIndex,
      categoryId: item.categoryId || (selectedCategory && selectedCategory.id) || 'flea',
      categoryName: item.categoryName || (selectedCategory && selectedCategory.name) || '跳蚤市场',
      title: item.title || '',
      price: item.price == null ? '' : String(item.price),
      desc: item.desc || '',
      contact: item.contact === '保密' ? '' : (item.contact || ''),
      location: item.locationName || item.locationAddress ? {
        name: item.locationName || '',
        address: item.locationAddress || '',
        latitude: item.latitude,
        longitude: item.longitude,
      } : null,
      mainImages,
      subImages: Array.isArray(item.subImages) ? item.subImages : [],
      videos: Array.isArray(item.videos) ? item.videos : [],
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
    if (!(await ensureMutationReady(this))) return;
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
    if (!(await ensureMutationReady(this))) return;
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
    if (!(await ensureMutationReady(this))) return;
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
    if (!(await ensureMutationReady(this))) return;
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
    const emptyLocation = this.data.isEditMode ? null : undefined;
    const payload = {
      categoryId,
      title: t,
      price: (price || '').trim(),
      unit: '元',
      desc: (desc || '').trim(),
      contact: (contact || '').trim() || '保密',
      locationName: location ? location.name : emptyLocation,
      locationAddress: location ? location.address : emptyLocation,
      latitude: location ? location.latitude : emptyLocation,
      longitude: location ? location.longitude : emptyLocation,
      mainImages,
      subImages,
      videos,
    };
    try {
      const res = this.data.isEditMode
        ? await mallAPI.updateItem(this.data.itemId, payload)
        : await mallAPI.publishItem(payload);
      if (res.code === 200 && res.data) {
        const itemId = this.data.itemId || res.data.id || res.data._id;
        emitListMutation(this, { type: 'upsert', id: itemId, data: res.data });
        wx.showToast({ title: this.data.isEditMode ? '修改成功' : '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: res.message || (this.data.isEditMode ? '修改失败' : '发布失败'), icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: (err && (err.message || err.errMsg)) || (this.data.isEditMode ? '修改失败' : '发布失败'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onUnload() {
    this._authPageAlive = false;
  },
});
