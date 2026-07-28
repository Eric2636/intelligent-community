import { commonAPI, forumAPI, mallAPI, taskAPI } from '~/api/cloud';
import { ensureMutationReady } from '~/utils/authIdentity';
import { notificationProbe, notificationUrl } from '~/utils/notificationRoute';
import { NOTIFICATION_UNREAD_EVENT } from '~/utils/notificationUnread';

const PAGE_SIZE = 20;
const DELETE_ACTION_STYLE = 'background-color:#e34d59;color:#fff;height:100%;display:flex;align-items:center;padding:0 40rpx;';

function normalizeNotification(row) {
  return {
    ...row,
    rightActions: [
      {
        id: row.id,
        text: '删除',
        className: 'notice-delete-action',
        style: DELETE_ACTION_STYLE,
      },
    ],
  };
}

function mergeUniqueNotifications(current, incoming) {
  const seen = new Set();
  return current.concat(incoming).filter((item) => {
    const id = String(item.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function failureMessage(err, fallback) {
  return (err && (err.message || err.errMsg)) || fallback;
}

function isMissingTarget(err, response) {
  return Boolean(
    (err && err.statusCode === 404) ||
      (response && (response.statusCode === 404 || response.code === 404)) ||
      (response && response.code === 200 && !response.data),
  );
}

Page({
  data: {
    noticeList: [],
    loading: false,
    loadingMore: false,
    authReady: false,
    showManualLoad: false,
    page: 0,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false,
    unreadCount: 0,
  },

  onLoad() {
    this._noticePageAlive = true;
    this._deleteFlights = new Map();
    this._noticeTapFlights = new Map();
    const app = getApp();
    this._onNotificationUnreadCountChange = (count) => {
      if (this._noticePageAlive === false) return;
      this.setData({ unreadCount: Number.isSafeInteger(count) && count > 0 ? count : 0 });
    };
    app.eventBus.on(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
    this._onNotificationUnreadCountChange(app.globalData.notificationUnreadCount);
    this.loadNotices({ reset: true });
  },

  onAuthorized() {
    this.setData({ authReady: true, showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadNotices({ reset: true });
  },

  async loadNotices(options = {}) {
    if (this._noticePageAlive == null) this._noticePageAlive = true;
    const reset = options.reset !== false;
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const requestId = (this._listRequestId || 0) + 1;
    this._listRequestId = requestId;
    const authReady = await ensureMutationReady(this);
    if (requestId !== this._listRequestId || this._noticePageAlive === false) return;
    if (!authReady) {
      this.setData({ loading: false, loadingMore: false });
      return;
    }
    if (reset) {
      await this.refreshServerUnreadCount();
      if (requestId !== this._listRequestId || this._noticePageAlive === false) return;
    }

    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true } : { loadingMore: true });

    try {
      const res = await commonAPI.getNotifications({ page, pageSize: PAGE_SIZE });
      if (this._noticePageAlive === false || requestId !== this._listRequestId) return;
      if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.list)) {
        throw new Error((res && res.message) || '加载消息失败');
      }
      const incoming = res.data.list.map(normalizeNotification);
      const noticeList = reset
        ? incoming
        : mergeUniqueNotifications(this.data.noticeList || [], incoming);
      const total = Number.isSafeInteger(Number(res.data.total))
        ? Math.max(0, Number(res.data.total))
        : noticeList.length;
      this.setData({
        noticeList,
        page,
        total,
        hasMore: noticeList.length < total,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      if (this._noticePageAlive === false || requestId !== this._listRequestId) return;
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: failureMessage(err, '加载消息失败'), icon: 'none' });
    }
  },

  loadNextPage() {
    return this.loadNotices({ reset: false });
  },

  onReachBottom() {
    return this.loadNextPage();
  },

  async refreshServerUnreadCount() {
    const app = getApp();
    if (app && typeof app.refreshNotificationUnreadCount === 'function') {
      return app.refreshNotificationUnreadCount();
    }
    return 0;
  },

  updateLocalReadState(id, readAt) {
    const noticeList = (this.data.noticeList || []).map((item) =>
      String(item.id) === String(id) ? { ...item, readAt } : item,
    );
    this.setData({ noticeList });
  },

  async openNotification(id) {
    const row = (this.data.noticeList || []).find((item) => String(item.id) === String(id));
    if (!row) return;

    if (!row.readAt) {
      try {
        const readRes = await commonAPI.markNotificationRead(row.id);
        if (!readRes || readRes.code !== 200) {
          throw new Error((readRes && readRes.message) || '标记已读失败');
        }
        if (this._noticePageAlive === false) return;
        this.updateLocalReadState(row.id, new Date().toISOString());
        await this.refreshServerUnreadCount();
        if (this._noticePageAlive === false) return;
      } catch (err) {
        if (this._noticePageAlive !== false) {
          wx.showToast({ title: failureMessage(err, '标记已读失败'), icon: 'none' });
        }
        return;
      }
    }

    if (row.bizType === 'system') return;
    const url = notificationUrl(row);
    const probe = notificationProbe(row, { forumAPI, taskAPI, mallAPI });
    if (!url || !probe) {
      wx.showToast({ title: '内容已不存在', icon: 'none' });
      return;
    }

    try {
      const response = await probe;
      if (this._noticePageAlive === false) return;
      if (isMissingTarget(null, response)) {
        wx.showToast({ title: '内容已不存在', icon: 'none' });
        return;
      }
      if (!response || response.code !== 200) {
        throw new Error((response && response.message) || '加载内容失败');
      }
      wx.navigateTo({ url });
    } catch (err) {
      if (this._noticePageAlive === false) return;
      wx.showToast({
        title: isMissingTarget(err) ? '内容已不存在' : failureMessage(err, '加载内容失败'),
        icon: 'none',
      });
    }
  },

  onNoticeTap(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.id
      : '';
    if (!id) return Promise.resolve();
    if (!this._noticeTapFlights) this._noticeTapFlights = new Map();
    const key = String(id);
    if (this._noticeTapFlights.has(key)) return this._noticeTapFlights.get(key);
    const flight = this.openNotification(id).finally(() => {
      if (this._noticeTapFlights.get(key) === flight) this._noticeTapFlights.delete(key);
    });
    this._noticeTapFlights.set(key, flight);
    return flight;
  },

  markAllRead() {
    if (this._markAllReadFlight) return this._markAllReadFlight;
    this._markAllReadFlight = (async () => {
      try {
        const res = await commonAPI.markAllNotificationsRead();
        if (!res || res.code !== 200) throw new Error((res && res.message) || '全部已读失败');
        if (this._noticePageAlive === false) return;
        const readAt = new Date().toISOString();
        const noticeList = (this.data.noticeList || []).map((item) => ({ ...item, readAt: item.readAt || readAt }));
        this.setData({ noticeList });
        await this.refreshServerUnreadCount();
      } catch (err) {
        if (this._noticePageAlive !== false) {
          wx.showToast({ title: failureMessage(err, '全部已读失败'), icon: 'none' });
        }
      }
    })().finally(() => {
      this._markAllReadFlight = null;
    });
    return this._markAllReadFlight;
  },

  deleteNotification(e) {
    const detail = (e && e.detail) || {};
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const id = detail.id || dataset.id;
    if (!id) return Promise.resolve();
    if (!this._deleteFlights) this._deleteFlights = new Map();
    const key = String(id);
    if (this._deleteFlights.has(key)) return this._deleteFlights.get(key);

    const flight = (async () => {
      try {
        const res = await commonAPI.deleteNotification(id);
        if (!res || res.code !== 200) throw new Error((res && res.message) || '删除失败');
        if (this._noticePageAlive === false) return;
        const noticeList = (this.data.noticeList || []).filter(
          (item) => String(item.id) !== String(id),
        );
        this.setData({
          noticeList,
          total: Math.max(0, Number(this.data.total || 0) - 1),
          hasMore: noticeList.length < Math.max(0, Number(this.data.total || 0) - 1),
        });
        await this.loadNotices({ reset: true });
      } catch (err) {
        if (this._noticePageAlive !== false) {
          wx.showToast({ title: failureMessage(err, '删除失败'), icon: 'none' });
        }
      } finally {
        this._deleteFlights.delete(key);
      }
    })();
    this._deleteFlights.set(key, flight);
    return flight;
  },

  onPullDownRefresh() {
    return this.loadNotices({ reset: true }).finally(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    this._authPageAlive = false;
    this._noticePageAlive = false;
    this._listRequestId = (this._listRequestId || 0) + 1;
    if (this._noticeTapFlights) this._noticeTapFlights.clear();
    const app = getApp();
    if (this._onNotificationUnreadCountChange) {
      app.eventBus.off(NOTIFICATION_UNREAD_EVENT, this._onNotificationUnreadCountChange);
    }
  },
});
