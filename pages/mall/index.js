import { Subject } from 'rxjs';

import { mallAPI } from '~/api/cloud';
import { mallDetailUrl, mallPublishUrl } from '~/utils/mallPaths';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { ensureMutationReady } from '~/utils/authIdentity';
import { createHotSearch } from '~/utils/hotSearch';
import { applyMutationToPageLists } from '../../utils/listMutation.js';

Page({
  data: {
    categories: [],
    currentCategory: 'flea',
    fullList: [],
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
    orderBy: 'time', // time | price_asc | price_desc
  },

  onLoad() {
    if (redirectIfEntryHidden('mall')) return;
    this._pageAlive = true;
    this._keyword$ = new Subject();
    this._searchRequestId = 0;
    this._committedRequestInvalidated = false;
    this._activeSearchKeyword = '';
    this._categoryRequestId = 0;
    this._mallRefreshId = 0;
    this._categoryReady = false;
    this._stopHotSearch = createHotSearch(this._keyword$, (keyword) => {
      if (!this._pageAlive) return;
      if (keyword === this._activeSearchKeyword) {
        if (
          this._committedRequestInvalidated &&
          this._categoryReady &&
          !this._categoryRefreshInFlight
        ) {
          this.setData({ page: 1, hasMore: true });
          this.loadList(true);
        }
        return;
      }
      this._activeSearchKeyword = keyword;
      this._committedRequestInvalidated = false;
      this.setData({ queryKeyword: keyword, page: 1, hasMore: true });
      if (this._categoryReady && !this._categoryRefreshInFlight) this.loadList(true);
    });
    this._skipNextShowRefresh = true;
    this.refreshMall();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('mall')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.mall);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadList(true, this.data.currentCategory, { silent: true });
  },

  async onRefresh() {
    await this.refreshMall({ showRefreshing: true });
  },

  async onLoadMore() {
    this.loadMore();
  },

  async loadCategories() {
    this._categoryRequestId = (this._categoryRequestId || 0) + 1;
    const requestId = this._categoryRequestId;
    try {
      const res = await mallAPI.getCategories();
      if (!this._pageAlive || requestId !== this._categoryRequestId) return null;
      if (res.code !== 200) {
        wx.showToast({ title: res.message || '获取分类失败，请重试', icon: 'none' });
        return { ok: false };
      }
      const categories = res.data || [];
      const currentCategory = categories.some((item) => item.id === this.data.currentCategory)
        ? this.data.currentCategory
        : (categories[0] && categories[0].id) || '';
      const categoryChanged = currentCategory !== this.data.currentCategory;
      this._categoryReady = Boolean(currentCategory);
      if (categoryChanged) {
        this._searchRequestId = (this._searchRequestId || 0) + 1;
        this._activeListRequestId = 0;
      }
      this.setData({
        categories,
        currentCategory,
        ...(categoryChanged
          ? {
              fullList: [],
              list: [],
              listTotal: 0,
              hasMore: false,
            }
          : {}),
      });
      return { categories, currentCategory, ok: true };
    } catch (err) {
      if (!this._pageAlive || requestId !== this._categoryRequestId) return null;
      console.error('加载商品分类失败', err);
      wx.showToast({ title: '获取分类失败，请重试', icon: 'none' });
      return { ok: false };
    }
  },

  async refreshMall({ showRefreshing = false } = {}) {
    this._mallRefreshId = (this._mallRefreshId || 0) + 1;
    const refreshId = this._mallRefreshId;
    this._categoryRefreshInFlight = true;
    this.setData({
      loading: true,
      refreshing: showRefreshing ? true : this.data.refreshing,
    });
    try {
      const categoryResult = await this.loadCategories();
      if (!this._pageAlive || refreshId !== this._mallRefreshId || !categoryResult) return;
      if (!categoryResult.ok) return;
      if (!categoryResult.currentCategory) {
        this.setData({
          fullList: [],
          list: [],
          listTotal: 0,
          hasMore: false,
          loading: false,
          loadingMore: false,
        });
        return;
      }
      await this.loadList(true, categoryResult.currentCategory);
    } finally {
      if (this._pageAlive && refreshId === this._mallRefreshId) {
        this._categoryRefreshInFlight = false;
        this.setData({ loading: false, refreshing: false });
      }
    }
  },

  async loadList(refresh = true, confirmedCategoryId = '', { silent = false } = {}) {
    const categoryId = confirmedCategoryId || this.data.currentCategory;
    if (!this._categoryReady || !categoryId) return;
    this._searchRequestId += 1;
    const requestId = this._searchRequestId;
    this._activeListRequestId = requestId;
    this._committedRequestInvalidated = false;
    const { queryKeyword, orderBy, pageSize } = this.data;
    const visibleSize = silent ? Math.max(pageSize, this.data.list.length) : pageSize;
    let nextPage = this.data.page;
    if (!silent && refresh) nextPage = 1;
    const normalizedKeyword = String(queryKeyword || '').trim();
    this.setData({
      page: nextPage,
      hasMore: refresh ? true : this.data.hasMore,
      showNoMore: refresh ? false : this.data.showNoMore,
      loading: silent ? this.data.loading : refresh,
      loadingMore: silent ? this.data.loadingMore : !refresh,
    });
    try {
      const res = await mallAPI.getItems({
        categoryId,
        keyword: normalizedKeyword || undefined,
        orderBy,
      });
      if (!this._pageAlive || requestId !== this._searchRequestId) return;
      if (res.code === 200) {
        if (res.__fromOfflineCache) {
          wx.showToast({ title: '网络不可用，当前展示缓存数据', icon: 'none' });
        }
        const raw = res.data || [];
        const list = raw.slice(0, visibleSize);
        this.setData({
          fullList: raw,
          list,
          listTotal: raw.length,
          hasMore: raw.length > list.length,
        });
      } else {
        wx.showToast({ title: res.message || '获取商品失败', icon: 'none' });
      }
    } catch (err) {
      if (!this._pageAlive || requestId !== this._searchRequestId) return;
      console.error('加载商品列表失败', err);
      wx.showToast({ title: err.message || err.errMsg || '网络错误，请重试', icon: 'none' });
    } finally {
      if (this._pageAlive && requestId === this._searchRequestId) {
        this._activeListRequestId = 0;
        this.setData({ loading: false, loadingMore: false, refreshing: false });
      }
    }
  },

  loadMore() {
    if (this.data.loading || this.data.loadingMore || this.data.refreshing) return;
    if (!this.data.hasMore) {
      this.showNoMoreTip();
      return;
    }
    const nextPage = this.data.page + 1;
    const nextEnd = nextPage * this.data.pageSize;
    const list = this.data.fullList.slice(0, nextEnd);
    if (list.length === this.data.list.length) {
      this.showNoMoreTip();
      this.setData({ hasMore: false });
      return;
    }
    this.setData({
      page: nextPage,
      list,
      hasMore: this.data.fullList.length > list.length,
    });
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

  onOrderChange(e) {
    const orderBy = e.currentTarget.dataset.order;
    this.setData({ orderBy });
    if (this._categoryRefreshInFlight) return;
    this.loadList(true);
  },

  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!this.data.categories.some((item) => item.id === id)) return;
    this._mallRefreshId += 1;
    this._categoryRequestId = (this._categoryRequestId || 0) + 1;
    this._categoryRefreshInFlight = false;
    this._categoryReady = true;
    const categoryChanged = id !== this.data.currentCategory;
    if (categoryChanged) {
      this._searchRequestId = (this._searchRequestId || 0) + 1;
      this._activeListRequestId = 0;
    }
    this.setData({
      currentCategory: id,
      ...(categoryChanged
        ? {
            fullList: [],
            list: [],
            listTotal: 0,
            hasMore: false,
          }
        : {}),
    });
    this.loadList(true);
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    this._listMutationHandled = false;
    wx.navigateTo({
      url: mallDetailUrl(id),
      events: {
        listMutation: (mutation) => {
          this._listMutationHandled = true;
          this.reconcileMallMutation(mutation);
        },
      },
    });
  },

  reconcileMallMutation(mutation) {
    if (!mutation) return;
    const data = mutation.data || {};
    const keyword = String(this.data.queryKeyword || '').trim().toLowerCase();
    const matchesCategory = this.data.currentCategory === 'all' || data.categoryId === this.data.currentCategory;
    const searchable = `${data.title || ''} ${data.desc || ''}`.toLowerCase();
    const shouldRemove = mutation.type === 'remove'
      || data.visibility === 'OFFLINE'
      || (mutation.data && (!matchesCategory || (keyword && !searchable.includes(keyword))));
    if (shouldRemove) {
      applyMutationToPageLists(this, ['list', 'fullList'], { type: 'remove', id: mutation.id });
      return;
    }
    if (!mutation.data) return;
    const id = String(mutation.id || data.id || data._id || '');
    const current = this.data.fullList || [];
    const index = current.findIndex((item) => String(item.id || item._id) === id);
    const fullList = index >= 0
      ? current.map((item, itemIndex) => itemIndex === index ? { ...data, id: data.id || data._id || id } : item)
      : [{ ...data, id: data.id || data._id || id }, ...current];
    const price = (item) => {
      const value = Number.parseFloat(String(item.price || '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(value) ? value : 0;
    };
    const sorted = [...fullList].sort((left, right) => {
      if (this.data.orderBy === 'price_asc') return price(left) - price(right);
      if (this.data.orderBy === 'price_desc') return price(right) - price(left);
      return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);
    });
    const visibleSize = Math.max(this.data.pageSize, this.data.list.length);
    const list = sorted.slice(0, visibleSize);
    this.setData({ fullList: sorted, list, listTotal: sorted.length, hasMore: sorted.length > list.length });
  },

  async goPublish() {
    if (!(await ensureMutationReady(this))) return;
    wx.navigateTo({ url: mallPublishUrl() });
  },

  onUnload() {
    this._pageAlive = false;
    this._authPageAlive = false;
    this._categoryRefreshInFlight = false;
    this._mallRefreshId = (this._mallRefreshId || 0) + 1;
    this._categoryRequestId = (this._categoryRequestId || 0) + 1;
    if (this._stopHotSearch) this._stopHotSearch();
    if (this._keyword$) this._keyword$.complete();
    if (this._noMoreTimer) clearTimeout(this._noMoreTimer);
  },
});
