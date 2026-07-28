import { userAPI } from '~/api/cloud';

const PHONE_AUTHORIZED_LOGIN_KEY = 'phone_authorized_login_v1';
const WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login_v2';
const LEGACY_WECHAT_AUTHORIZED_LOGIN_KEY = 'wechat_authorized_login';

const IDENTITY_OPTIONS = [
  { type: 'OWNER', label: '业主' },
  { type: 'OUTSIDER', label: '小区外人员' },
];

let identitySelectionPromise = null;

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

function trackPage(page) {
  if (page && page._authPageAlive == null) page._authPageAlive = true;
  return page;
}

export function markAuthPageUnloaded(page) {
  if (page) page._authPageAlive = false;
}

export function isPageActive(page) {
  if (!page || page._authPageAlive === false || typeof getCurrentPages !== 'function') return false;
  const pages = getCurrentPages();
  return Boolean(pages && pages.length && pages[pages.length - 1] === page);
}

function inactivePageError() {
  const err = new Error('页面已切换');
  err.code = 'AUTH_PAGE_INACTIVE';
  return err;
}

function assertPageActive(page) {
  if (!isPageActive(page)) throw inactivePageError();
}

async function ensureServerUser(page) {
  const app = getApp();
  try {
    const res = await userAPI.getUserInfo();
    if (!isPageActive(page)) return false;
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

export function requestAuthorizedLogin(page) {
  trackPage(page);
  if (!isPageActive(page)) return false;
  const dialog =
    typeof page.selectComponent === 'function'
      ? page.selectComponent('#auth-login-dialog')
      : null;
  if (dialog && typeof dialog.open === 'function') {
    dialog.open(page);
  } else {
    wx.showToast({ title: '请先完成授权登录', icon: 'none' });
  }
  return false;
}

export async function ensureLoggedIn(page) {
  trackPage(page);
  if (!isPageActive(page)) return false;
  if (hasLoginToken() && hasPhoneAuthorizedLogin()) {
    if (await ensureServerUser(page)) return isPageActive(page);
    if (!isPageActive(page)) return false;
    clearStaleLogin();
  } else if (hasLoginToken()) {
    clearStaleLogin();
  }

  return requestAuthorizedLogin(page);
}

export function requireLogin(page) {
  return ensureLoggedIn(page);
}

async function selectAndSaveIdentity(page) {
  assertPageActive(page);
  const app = getApp();
  let userInfo = normalizeUserInfo(app.globalData.userInfo);

  if (!userInfo.identityType) {
    try {
      const res = await userAPI.getUserInfo();
      if (res && res.code === 200 && res.data) {
        userInfo = normalizeUserInfo(res.data);
        app.globalData.userInfo = userInfo;
      }
    } catch (e) {
      /* ignore: the next write will still surface network/auth errors */
    }
    assertPageActive(page);
  }

  if (userInfo.identityType) return userInfo.identityType;

  const identityType = await selectIdentityType();
  assertPageActive(page);
  wx.showLoading({ title: '保存中...' });
  try {
    const res = await userAPI.updateUserInfo({ identityType });
    assertPageActive(page);
    const saved = res && res.data ? normalizeUserInfo(res.data) : { ...userInfo, identityType };
    app.globalData.userInfo = saved;
    app.eventBus.emit('userInfoChange');
    return identityType;
  } finally {
    wx.hideLoading();
  }
}

export function ensureIdentitySelected(page) {
  trackPage(page);
  if (!isPageActive(page)) return Promise.reject(inactivePageError());
  if (identitySelectionPromise) return identitySelectionPromise;
  identitySelectionPromise = selectAndSaveIdentity(page).finally(() => {
    identitySelectionPromise = null;
  });
  return identitySelectionPromise;
}

export async function completeAuthorizedLogin(phoneCode, page) {
  trackPage(page);
  if (!isPageActive(page)) return false;
  const app = getApp();
  await app.phoneLogin(phoneCode);
  if (!isPageActive(page)) return false;
  if (app.globalData.offlineMode) throw new Error('网络不可用，请稍后重试');
  await ensureIdentitySelected(page);
  return isPageActive(page);
}

export async function ensureMutationReady(page) {
  trackPage(page);
  if (!(await ensureLoggedIn(page)) || !isPageActive(page)) return false;
  try {
    await ensureIdentitySelected(page);
    return isPageActive(page);
  } catch (err) {
    if ((err && err.code === 'AUTH_PAGE_INACTIVE') || !isPageActive(page)) return false;
    wx.showToast({ title: (err && (err.message || err.errMsg)) || '请先选择身份', icon: 'none' });
    return false;
  }
}
