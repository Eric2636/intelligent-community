export const NOTIFICATION_UNREAD_EVENT = 'notificationUnreadCountChange';

let unreadRequestSequence = 0;

function currentAccountKey() {
  try {
    const token = wx.getStorageSync('access_token');
    return token ? String(token) : '';
  } catch (e) {
    return '';
  }
}

function hasAuthorizedPhone() {
  try {
    return wx.getStorageSync('phone_authorized_login_v1') === true;
  } catch (e) {
    return false;
  }
}

function publishCount(app, count, accountKey) {
  const normalized = Number.isSafeInteger(count) && count > 0 ? count : 0;
  app.globalData.notificationUnreadCount = normalized;
  app.globalData.notificationUnreadAccountKey = accountKey || '';
  app.eventBus.emit(NOTIFICATION_UNREAD_EVENT, normalized);
  return normalized;
}

export function resetNotificationUnreadCount(app) {
  unreadRequestSequence += 1;
  return publishCount(app, 0, '');
}

export async function refreshNotificationUnreadCount(app, requestUnreadCount) {
  const accountKey = currentAccountKey();
  if (!accountKey || !hasAuthorizedPhone()) return resetNotificationUnreadCount(app);

  if (app.globalData.notificationUnreadAccountKey !== accountKey) {
    publishCount(app, 0, accountKey);
  }

  unreadRequestSequence += 1;
  const requestId = unreadRequestSequence;
  try {
    const res = await requestUnreadCount();
    if (requestId !== unreadRequestSequence || currentAccountKey() !== accountKey) {
      return app.globalData.notificationUnreadCount || 0;
    }
    const rawCount = res && res.code === 200 && res.data ? Number(res.data.count) : NaN;
    if (!Number.isSafeInteger(rawCount) || rawCount < 0) {
      return publishCount(app, 0, accountKey);
    }
    return publishCount(app, rawCount, accountKey);
  } catch (e) {
    if (requestId === unreadRequestSequence && currentAccountKey() === accountKey) {
      return publishCount(app, 0, accountKey);
    }
    return app.globalData.notificationUnreadCount || 0;
  }
}
