import { areaList } from './areaData.js';
import { userAPI } from '~/api/cloud';

Page({
  data: {
    personInfo: {
      name: '',
      gender: 0,
      birth: '',
      address: [],
      introduction: '',
      photos: [],
    },
    genderOptions: [
      {
        label: '男',
        value: 0,
      },
      {
        label: '女',
        value: 1,
      },
      {
        label: '保密',
        value: 2,
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

    gridConfig: {
      column: 3,
      width: 160,
      height: 160,
    },
  },

  onLoad() {
    this.initAreaData();
    this.getPersonalInfo();
  },

  async getPersonalInfo() {
    try {
      const app = getApp();
      if (app.globalData.useCloudBase) {
        // 云开发环境：调用云函数获取用户信息
        const res = await userAPI.getUserInfo();
        if (res.code === 200 && res.data) {
          this.setData(
            {
              personInfo: res.data,
            },
            () => {
              const { personInfo } = this.data;
              this.setData({
                addressText: `${areaList.provinces[personInfo.address[0]]} ${areaList.cities[personInfo.address[1]]}`,
              });
            },
          );
        } else {
          // 没有用户信息时，设置默认值
          this.setData({
            personInfo: {
              name: '',
              gender: 0,
              birth: '',
              address: [],
              introduction: '',
              photos: [],
            },
          });
        }
      } else {
        // 非云开发环境，不加载用户信息
        this.setData({
          personInfo: {
            name: '',
            gender: 0,
            birth: '',
            address: [],
            introduction: '',
            photos: [],
          },
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

  onIntroductionChange(e) {
    this.personInfoFieldChange('introduction', e);
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
    const { personInfo } = this.data;
    const app = getApp();

    if (app.globalData.useCloudBase) {
      try {
        wx.showLoading({ title: '保存中...' });
        const res = await userAPI.updateUserInfo(personInfo);
        wx.hideLoading();

        if (res.code === 200) {
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
    } else {
      wx.showToast({
        title: '请使用云开发模式',
        icon: 'none',
      });
    }
  },
});
