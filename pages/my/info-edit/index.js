import { areaList } from './areaData.js';
import { userAPI } from '~/api/cloud';
import { uploadAvatarForReview } from '~/utils/cloudMedia';
import { ensureMutationReady } from '~/utils/authIdentity';

const AVATAR_REVIEW_STORAGE_KEY = 'pending_avatar_review_v1';
const AVATAR_REVIEW_POLL_INTERVAL = 3000;

function defaultPersonInfo() {
  return {
    name: '',
    avatar: '',
    gender: 0,
    householdNo: '',
    birth: '',
    address: [],
    introduction: '',
    photos: [],
  };
}

function normalizePhotoUrls(rawPhotos) {
  if (!Array.isArray(rawPhotos)) return [];
  return rawPhotos
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.url || item.path || item.thumb || (item.response && item.response.url) || '';
      }
      return '';
    })
    .map((url) => String(url || '').trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

function resolveProfileName(user = {}) {
  const name = String(user.name || '').trim();
  if (name && name !== '微信用户') return name;
  const phone = String(user.phoneNumber || user.phone || '').trim();
  return phone.length >= 4 ? `用户${phone.slice(-4)}` : '用户';
}

function normalizePersonInfo(raw, fallback = {}) {
  const source = {
    ...fallback,
    ...(raw || {}),
  };
  return {
    ...defaultPersonInfo(),
    ...source,
    name: resolveProfileName(source),
    avatar: String(source.avatar || source.avatarUrl || source.image || '').trim(),
    introduction: String(source.brief || source.introduction || '').trim(),
    photos: normalizePhotoUrls(source.photos),
  };
}

function buildUserInfoPayload(personInfo) {
  const gender = Number(personInfo.gender);
  return {
    name: String(personInfo.name || '').trim(),
    gender: Number.isInteger(gender) && gender >= 0 && gender <= 1 ? gender : 0,
    householdNo: String(personInfo.householdNo || '').trim(),
    birth: String(personInfo.birth || '').trim(),
    address: Array.isArray(personInfo.address) ? personInfo.address : [],
    brief: String(personInfo.introduction || personInfo.brief || '').trim(),
    photos: normalizePhotoUrls(personInfo.photos),
  };
}

Page({
  data: {
    personInfo: defaultPersonInfo(),
    genderOptions: [
      {
        label: '男',
        value: 0,
      },
      {
        label: '女',
        value: 1,
      },
    ],
    birthVisible: false,
    birthStart: '1970-01-01',
    birthEnd: '2025-03-01',
    birthTime: 0,
    birthFilter: (type, options) => (type === 'year' ? options.sort((a, b) => b.value - a.value) : options),
    addressText: '',
    addressVisible: false,
    provinces: [],
    cities: [],
    avatarReviewStatus: '',

    gridConfig: {
      column: 3,
      width: 160,
      height: 160,
    },
  },

  onLoad() {
    this._avatarReviewPageAlive = true;
    this.initAreaData();
    this.getPersonalInfo();
    this.resumeAvatarReview();
  },

  async getPersonalInfo() {
    try {
      const app = getApp();
      const token = wx.getStorageSync('access_token');
      if (token) {
        const res = await userAPI.getUserInfo();
        const data = res && res.code === 200 && res.data ? res.data : app.globalData.userInfo;
        this.setData(
          {
            personInfo: normalizePersonInfo(data, app.globalData.userInfo),
          },
          () => {
            const { personInfo } = this.data;
            const address = Array.isArray(personInfo.address) ? personInfo.address : [];
            this.setData({
              addressText:
                address.length >= 2
                  ? `${areaList.provinces[address[0]] || ''} ${areaList.cities[address[1]] || ''}`.trim()
                  : '',
            });
          },
        );
      } else {
        this.setData({
          personInfo: defaultPersonInfo(),
        });
      }
    } catch (err) {
      console.error('获取用户信息失败', err);
    }
  },

  getAreaOptions(data, filter) {
    const res = Object.keys(data).map((key) => ({ value: key, label: data[key] }));
    return typeof filter === 'function' ? res.filter(filter) : res;
  },

  getCities(provinceValue) {
    return this.getAreaOptions(
      areaList.cities,
      (city) => `${city.value}`.slice(0, 2) === `${provinceValue}`.slice(0, 2),
    );
  },

  initAreaData() {
    const provinces = this.getAreaOptions(areaList.provinces);
    const cities = this.getCities(provinces[0].value);
    this.setData({ provinces, cities });
  },

  onAreaPick(e) {
    const { column, index } = e.detail;
    const { provinces } = this.data;

    // 更改省份则更新城市列表
    if (column === 0) {
      const cities = this.getCities(provinces[index].value);
      this.setData({ cities });
    }
  },

  showPicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({
      [`${mode}Visible`]: true,
    });
    if (mode === 'address') {
      const cities = this.getCities(this.data.personInfo.address[0]);
      this.setData({ cities });
    }
  },

  hidePicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({
      [`${mode}Visible`]: false,
    });
  },

  onPickerChange(e) {
    const { value, label } = e.detail;
    const { mode } = e.currentTarget.dataset;

    this.setData({
      [`personInfo.${mode}`]: value,
    });
    if (mode === 'address') {
      this.setData({
        addressText: label.join(' '),
      });
    }
  },

  personInfoFieldChange(field, e) {
    const { value } = e.detail;
    this.setData({
      [`personInfo.${field}`]: value,
    });
  },

  onNameChange(e) {
    this.personInfoFieldChange('name', e);
  },

  onGenderChange(e) {
    this.personInfoFieldChange('gender', e);
  },

  onHouseholdNoChange(e) {
    this.personInfoFieldChange('householdNo', e);
  },

  onIntroductionChange(e) {
    this.personInfoFieldChange('introduction', e);
  },

  async uploadAvatar(tempFilePath) {
    if (!(await ensureMutationReady(this))) return;
    const path = String(tempFilePath || '').trim();
    if (!path) return;
    try {
      wx.showLoading({ title: '上传头像...', mask: true });
      const result = await uploadAvatarForReview(path);
      wx.hideLoading();
      const review = result && result.avatarReview;
      if (!review || !review.id) throw new Error('头像审核提交失败，请稍后重试');
      wx.setStorageSync(AVATAR_REVIEW_STORAGE_KEY, { id: review.id });
      this.setData({ avatarReviewStatus: 'PENDING' });
      wx.showToast({ title: '头像审核中，通过后自动生效', icon: 'none' });
      this.scheduleAvatarReviewCheck(review.id);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '头像上传失败', icon: 'none' });
    }
  },

  resumeAvatarReview() {
    const stored = wx.getStorageSync(AVATAR_REVIEW_STORAGE_KEY);
    const reviewId = String((stored && stored.id) || stored || '').trim();
    if (!reviewId) return;
    this.setData({ avatarReviewStatus: 'PENDING' });
    this.checkAvatarReview(reviewId);
  },

  scheduleAvatarReviewCheck(reviewId) {
    if (this._avatarReviewTimer) clearTimeout(this._avatarReviewTimer);
    if (!this._avatarReviewPageAlive) return;
    this._avatarReviewTimer = setTimeout(() => {
      this.checkAvatarReview(reviewId);
    }, AVATAR_REVIEW_POLL_INTERVAL);
  },

  clearAvatarReview() {
    if (this._avatarReviewTimer) clearTimeout(this._avatarReviewTimer);
    this._avatarReviewTimer = null;
    wx.removeStorageSync(AVATAR_REVIEW_STORAGE_KEY);
    this.setData({ avatarReviewStatus: '' });
  },

  async checkAvatarReview(reviewId) {
    if (!this._avatarReviewPageAlive) return;
    try {
      const result = await userAPI.getAvatarReview(reviewId);
      if (!this._avatarReviewPageAlive) return;
      const status = String((result && result.status) || '').toUpperCase();
      if (status === 'PASSED') {
        this.clearAvatarReview();
        await this.getPersonalInfo();
        if (!this._avatarReviewPageAlive) return;
        const app = getApp();
        const { avatar } = this.data.personInfo;
        app.globalData.userInfo = {
          ...(app.globalData.userInfo || {}),
          avatar,
          avatarUrl: avatar,
        };
        app.eventBus.emit('userInfoChange');
        wx.showToast({ title: '头像已更新', icon: 'success' });
        return;
      }
      if (status === 'REJECTED') {
        this.clearAvatarReview();
        wx.showToast({ title: '头像未通过审核，请重新选择', icon: 'none' });
        return;
      }
      if (status === 'FAILED' || status === 'SUPERSEDED') {
        this.clearAvatarReview();
        wx.showToast({ title: '头像审核失败，请稍后重试', icon: 'none' });
        return;
      }
      this.scheduleAvatarReviewCheck(reviewId);
    } catch (err) {
      console.warn('查询头像审核状态失败', err);
      this.scheduleAvatarReviewCheck(reviewId);
    }
  },

  onChooseWechatAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    this.uploadAvatar(avatarUrl);
  },

  async onChooseCustomAvatar() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: resolve,
          fail: reject,
        });
      });
      const file = res && res.tempFiles && res.tempFiles[0];
      if (file && file.tempFilePath) await this.uploadAvatar(file.tempFilePath);
    } catch (err) {
      if (err && err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: (err && err.message) || '选择头像失败', icon: 'none' });
    }
  },

  onPhotosRemove(e) {
    const { index } = e.detail;
    const { photos } = this.data.personInfo;

    photos.splice(index, 1);
    this.setData({
      'personInfo.photos': photos,
    });
  },

  onPhotosSuccess(e) {
    const { files } = e.detail;
    this.setData({
      'personInfo.photos': files,
    });
  },

  onPhotosDrop(e) {
    const { files } = e.detail;
    this.setData({
      'personInfo.photos': files,
    });
  },

  async onSaveInfo() {
    if (!(await ensureMutationReady(this))) return;
    const { personInfo } = this.data;
    const app = getApp();
    const payload = buildUserInfoPayload(personInfo);

    try {
      wx.showLoading({ title: '保存中...' });
      const res = await userAPI.updateUserInfo(payload);
      wx.hideLoading();

      if (res.code === 200) {
        const saved = res.data || payload;
        app.globalData.userInfo = {
          ...(app.globalData.userInfo || {}),
          ...saved,
          nickName: (saved && saved.name) || payload.name || '',
          avatar:
            (saved && (saved.avatar || saved.avatarUrl || saved.image)) || personInfo.avatar || '',
          avatarUrl:
            (saved && (saved.avatarUrl || saved.avatar || saved.image)) || personInfo.avatar || '',
        };
        app.eventBus.emit('userInfoChange');
        wx.showToast({
          title: '保存成功',
          icon: 'success',
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1000);
      } else {
        wx.showToast({
          title: res.message || '保存失败',
          icon: 'none',
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none',
      });
      console.error('保存用户信息失败', err);
    }
  },

  onUnload() {
    this._authPageAlive = false;
    this._avatarReviewPageAlive = false;
    if (this._avatarReviewTimer) clearTimeout(this._avatarReviewTimer);
  },
});
