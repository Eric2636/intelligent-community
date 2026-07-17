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

export async function ensureLoggedIn() {
  if (hasLoginToken()) return true;

  const app = getApp();
  let profile = null;
  try {
    profile = await app.getWechatProfile();
  } catch (err) {
    wx.showToast({ title: '授权登录后可继续操作', icon: 'none' });
    return false;
  }

  wx.showLoading({ title: '登录中...' });
  try {
    await app.login(profile);
  } catch (err) {
    wx.showToast({ title: '登录失败，可继续浏览公开内容', icon: 'none' });
    return false;
  } finally {
    wx.hideLoading();
  }

  if (hasLoginToken()) return true;
  wx.showToast({ title: '登录失败，可继续浏览公开内容', icon: 'none' });
  return false;
}

export function requireLogin() {
  return ensureLoggedIn();
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
  if (!(await ensureLoggedIn())) return false;
  try {
    await ensureIdentitySelected();
    return true;
  } catch (err) {
    wx.showToast({ title: (err && (err.message || err.errMsg)) || '请先选择身份', icon: 'none' });
    return false;
  }
}
