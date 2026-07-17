import { userAPI } from '~/api/cloud';

const PHONE_AUTHORIZED_LOGIN_KEY = 'phone_authorized_login_v1';
const WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login_v2';
const LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login';

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

function hasPhoneAuthorizedLogin() {
  try {
    return wx.getStorageSync(PHONE_AUTHORIZED_LOGIN_KEY) === true;
  } catch (e) {
    return false;
  }
}

function clearStaleLogin() {
  try {
    wx.removeStorageSync('access_token');
    wx.removeStorageSync(PHONE_AUTHORIZED_LOGIN_KEY);
    wx.removeStorageSync(WECHAT_AUTHORIZED_LOGIN_KEY);
    wx.removeStorageSync(LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY);
  } catch (e) {
    /* ignore */
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

async function ensureServerUser() {
  const app = getApp();
  try {
    const res = await userAPI.getUserInfo();
    if (res && res.code === 200 && res.data) {
      const userInfo = normalizeUserInfo(res.data);
      app.globalData.userInfo = userInfo;
      return Boolean(String(userInfo.phoneNumber || userInfo.phone || '').trim());
    }
  } catch (e) {
    /* stale tokens are handled by falling through */
  }
  return false;
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
  if (hasLoginToken() && hasPhoneAuthorizedLogin()) {
    if (await ensureServerUser()) return true;
    clearStaleLogin();
  } else if (hasLoginToken()) {
    clearStaleLogin();
  }

  const app = getApp();
  try {
    await app.requestPhoneLogin();
  } catch (err) {
    wx.showToast({ title: (err && err.message) || '请先完成手机号验证登录', icon: 'none' });
    return false;
  }

  if (!hasLoginToken() || !hasPhoneAuthorizedLogin()) return false;
  return ensureServerUser();
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
