import { Subject } from 'rxjs';

import { taskAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { formatDateTimeYmdHm } from '~/utils/date';
import { normalizeAvatar } from '~/utils/defaultAvatar';
import { createHotSearch } from '~/utils/hotSearch';
import { navigateToWithListMutation } from '../../utils/listMutation.js';

Page({
  data: {
    list: [],
    listTotal: 0,
    loading: true,
    refreshing: false,
    loadingMore: false,
    showNoMore: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
    queryKeyword: '',
  },

  onLoad() {
    if (redirectIfEntryHidden('task')) return;
    this._pageAlive = true;
    this._keyword$ = new Subject();
    this._searchRequestId = 0;
    this._committedRequestInvalidated = false;
    this._activeSearchKeyword = '';
    this._stopHotSearch = createHotSearch(this._keyword$, (keyword) => {
      if (!this._pageAlive) return;
      if (keyword === this._activeSearchKeyword) {
        if (this._committedRequestInvalidated) {
          this.setData({ page: 1, hasMore: true });
          this.loadList(true);
        }
        return;
      }
      this._activeSearchKeyword = keyword;
      this._committedRequestInvalidated = false;
      this.setData({ queryKeyword: keyword, page: 1, hasMore: true });
      this.loadList(true);
    });
    this._skipNextShowRefresh = true;
    this.loadList();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('task')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.task);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadList(true, { silent: true });
  },

  async onRefresh() {
    this.setData({ refreshing: true });
    await this.loadList(true);
  },

  async onLoadMore() {
    await this.loadMore();
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore) return;
    if (!this.data.hasMore) {
      this.showNoMoreTip();
      return;
    }
    this.setData({ page: this.data.page + 1, loadingMore: true });
    await this.loadList(false);
  },

  showNoMoreTip() {
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
    this.setData({ showNoMore: true });
    this._noMoreTimer = setTimeout(() => {
      this.setData({ showNoMore: false });
      this._noMoreTimer = null;
    }, 2000);
  },

  onSearchInput(e) {
    if (!this._pageAlive) return;
    const nextKeyword = e.detail.value || '';
    const normalizedKeyword = String(nextKeyword).trim();
    if (normalizedKeyword !== this._activeSearchKeyword) {
      const hasInFlightRequest = this._activeListRequestId === this._searchRequestId;
      this._searchRequestId += 1;
      this._committedRequestInvalidated =
        this._committedRequestInvalidated || hasInFlightRequest;
    }
    this.setData({ keyword: nextKeyword });
    this._keyword$.next(nextKeyword);
  },

  onSearchClear() {
    if (!this._pageAlive) return;
    this.onSearchInput({ detail: { value: '' } });
  },

  async loadList(refresh = true, { silent = false } = {}) {
    this._searchRequestId += 1;
    const requestId = this._searchRequestId;
    this._activeListRequestId = requestId;
    this._committedRequestInvalidated = false;
    const nextPage = refresh ? 1 : this.data.page;
    const requestPageSize = silent
      ? Math.max(this.data.pageSize, this.data.list.length)
      : this.data.pageSize;
    const keyword = String(this.data.queryKeyword || '').trim();
    this.setData({
      page: silent ? this.data.page : nextPage,
      hasMore: refresh ? true : this.data.hasMore,
      showNoMore: refresh ? false : this.data.showNoMore,
      loading: silent ? this.data.loading : refresh,
      loadingMore: silent ? this.data.loadingMore : !refresh,
    });
    try {
      const res = await taskAPI.getTaskList({
        keyword: keyword || undefined,
        page: nextPage,
        pageSize: requestPageSize,
      });
      if (!this._pageAlive || requestId !== this._searchRequestId) return;
      if (res.code === 200) {
        if (res.__fromOfflineCache) {
          wx.showToast({ title: '网络不可用，当前展示缓存数据', icon: 'none' });
        }
        const raw = res.data || [];
        const normalized = raw.map((t) => ({
          ...t,
          id: t._id || t.id,
          publisherAvatar: normalizeAvatar(t.publisherAvatar),
          images: Array.isArray(t.images) ? t.images : [],
          videos: Array.isArray(t.videos) ? t.videos : [],
          createdAt: formatDateTimeYmdHm(t.createdAt),
        }));
        const list = refresh ? normalized : [...this.data.list, ...normalized];
        if (!refresh && normalized.length === 0) this.showNoMoreTip();
        this.setData({
          list,
          listTotal: list.length,
          hasMore: normalized.length >= requestPageSize,
        });
      } else {
        wx.showToast({ title: res.message || '获取任务失败', icon: 'none' });
      }
    } catch (err) {
      if (!this._pageAlive || requestId !== this._searchRequestId) return;
      console.error('加载任务列表失败', err);
      if (!refresh) this.setData({ page: Math.max(1, nextPage - 1) });
      wx.showToast({ title: err.message || err.errMsg || '网络错误，请重试', icon: 'none' });
    } finally {
      if (this._pageAlive && requestId === this._searchRequestId) {
        this._activeListRequestId = 0;
        this.setData({ loading: false, loadingMore: false, refreshing: false });
      }
    }
  },

  onPreviewListImages(e) {
    const { cardIndex, current } = e.currentTarget.dataset;
    const { list } = this.data;
    const item = list[Number(cardIndex)];
    if (!item || !item.images || !item.images.length) return;
    wx.previewImage({
      current: current || item.images[0],
      urls: item.images,
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    navigateToWithListMutation(this, `/packageTask/detail/index?id=${id}`, 'list', (task) => ({
      ...task,
      id: task.id || task._id,
      publisherAvatar: normalizeAvatar(task.publisherAvatar),
      images: Array.isArray(task.images) ? task.images : [],
      videos: Array.isArray(task.videos) ? task.videos : [],
      createdAt: formatDateTimeYmdHm(task.createdAt),
    }));
  },

  async goPublish() {
    if (!(await ensureMutationReady(this))) return;
    wx.navigateTo({ url: '/packageTask/publish/index' });
  },

  onUnload() {
    this._pageAlive = false;
    this._authPageAlive = false;
    if (this._stopHotSearch) this._stopHotSearch();
    if (this._keyword$) this._keyword$.complete();
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
  },
});
