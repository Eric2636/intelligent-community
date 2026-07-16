import { userAPI } from '~/api/cloud';

const IDENTITY_OPTIONS = [
  { type: 'OWNER', label: '业主' },
  { type: 'OUTSIDER', label: '小区外人员' },
];

function getToken() {
  try {
    return wx.getStorageSync('access_token') || '';
  } catch (e) {
    return '';
  }
}

function normalizeUserInfo(user) {
  if (!user) return {};
  const avatar = user.avatar || user.avatarUrl || user.image || '';
  return {
    ...user,
    avatar,
    avatarUrl: user.avatarUrl || avatar,
    image: user.image || avatar,
  };
}

function selectIdentityType() {
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: IDENTITY_OPTIONS.map((x) => x.label),
      success: (res) => {
        const option = IDENTITY_OPTIONS[res.tapIndex];
        if (!option) {
          reject(new Error('请选择身份'));
          return;
        }
        resolve(option.type);
      },
      fail: () => reject(new Error('请选择身份后继续')),
    });
  });
}

export function hasLoginToken() {
  return Boolean(getToken());
}

export function requireLogin() {
  if (hasLoginToken()) return true;
  wx.showToast({ title: '请先登录', icon: 'none' });
  setTimeout(() => {
    wx.navigateTo({ url: '/pages/login/login?authRequired=1' });
  }, 300);
  return false;
}

export async function ensureIdentitySelected() {
  const app = getApp();
  let userInfo = normalizeUserInfo(app.globalData.userInfo);

  if (!userInfo.identityType && !userInfo.contentTagLabel && !userInfo.adminLabel) {
    try {
      const res = await userAPI.getUserInfo();
      if (res && res.code === 200 && res.data) {
        userInfo = normalizeUserInfo(res.data);
        app.globalData.userInfo = userInfo;
      }
    } catch (e) {
      /* ignore: the next write will still surface network/auth errors */
    }
  }

  if (userInfo.contentTagLabel || userInfo.adminLabel) return userInfo.contentTagLabel || userInfo.adminLabel;
  if (userInfo.identityType) return userInfo.identityType;

  const identityType = await selectIdentityType();
  wx.showLoading({ title: '保存中...' });
  try {
    const res = await userAPI.updateUserInfo({ identityType });
    const saved = res && res.data ? normalizeUserInfo(res.data) : { ...userInfo, identityType };
    app.globalData.userInfo = saved;
    app.eventBus.emit('userInfoChange');
    return identityType;
  } finally {
    wx.hideLoading();
  }
}

export async function ensureMutationReady() {
  if (!requireLogin()) return false;
  try {
    await ensureIdentitySelected();
    return true;
  } catch (err) {
    wx.showToast({ title: (err && (err.message || err.errMsg)) || '请先选择身份', icon: 'none' });
    return false;
  }
}
