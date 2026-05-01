import { errandAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { syncCustomTabBar } from '~/utils/syncCustomTabBar';

function normalizeErrandItem(item) {
  if (!item) return item;
  const status = item.status || 'pending_take';
  let fallbackText = '待领取';
  if (status === 'in_progress') fallbackText = '进行中';
  else if (status === 'completed') fallbackText = '已完成';
  const statusText = item.statusText || fallbackText;
  return {
    ...item,
    replyCount: item.replyCount || 0,
    likeCount: item.likeCount || 0,
    status,
    statusText,
    reward: item.reward != null && item.reward !== '' && item.reward !== '0' ? String(item.reward) : item.reward,
  };
}

Page({
  data: {
    pinned: [],
    list: [],
    loading: true,
    refreshing: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    keyword: '',
    orderBy: 'time',
    virtualStart: 0,
    displayList: [],
    listTotalHeight: 0,
    useVirtual: false,
    ITEM_HEIGHT_RPX: 140,
    VIRTUAL_WINDOW: 20,
  },

  onLoad() {
    if (redirectIfEntryHidden('errand')) return;
    this.loadErrands();
  },

  onShow() {
    syncCustomTabBar(this);
    if (redirectIfEntryHidden('errand')) return;
    this.loadErrands();
  },

  async onRefresh() {
    this.setData({
      refreshing: true,
      page: 1,
      hasMore: true,
    });
    await this.loadErrands();
    this.setData({ refreshing: false });
  },

  async onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    await this.loadErrands(false);
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.setData({ page: 1, hasMore: true });
    this.loadErrands(true);
  },

  onOrderChange(e) {
    const orderBy = e.currentTarget.dataset.order;
    this.setData({ orderBy, page: 1, hasMore: true });
    this.loadErrands(true);
  },

  onPullDownRefresh() {
    this.onRefresh().then(() => wx.stopPullDownRefresh());
  },

  async loadErrands(refresh = true) {
    this.setData({ loading: true });

    try {
      const res = await errandAPI.getErrandList({
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: (this.data.keyword || '').trim() || undefined,
        orderBy: this.data.orderBy,
      });

      if (res.code === 200 && res.data) {
        // 自建后端：{ pinned, list, total }；兼容旧版直接返回数组
        let payload = res.data;
        if (Array.isArray(payload)) {
          payload = { pinned: [], list: payload, total: payload.length };
        }
        const { pinned, list } = payload;
        const pinnedNorm = (pinned || []).map(normalizeErrandItem);
        const chunk = (list || []).map(normalizeErrandItem);
        const fullList = refresh ? chunk : [...this.data.list, ...chunk];
        const useVirtual = fullList.length > this.data.VIRTUAL_WINDOW;
        const nextVirtualStart = refresh ? 0 : this.data.virtualStart;
        const displayList = useVirtual ? fullList.slice(nextVirtualStart, nextVirtualStart + this.data.VIRTUAL_WINDOW) : fullList;
        const listTotalHeight = fullList.length * this.data.ITEM_HEIGHT_RPX;
        let pinnedNext = this.data.pinned;
        if (refresh) pinnedNext = pinnedNorm;
        else if (pinnedNorm.length > 0) pinnedNext = pinnedNorm;

        this.setData({
          pinned: pinnedNext,
          list: fullList,
          hasMore: chunk.length >= this.data.pageSize,
          useVirtual,
          displayList,
          virtualStart: nextVirtualStart,
          listTotalHeight,
        });
      } else {
        this.setData({ pinned: [], list: [] });
        wx.showToast({ title: res.message || '获取跑腿失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载跑腿列表失败', err);
      this.setData({ pinned: [], list: [] });
      wx.showToast({ title: err.errMsg || '网络错误，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goPublish() {
    wx.navigateTo({
      url: '/packageErrand/publish/index',
      fail(err) {
        console.error('打开跑腿发布页失败', err);
        wx.showToast({ title: '打开发布页失败', icon: 'none' });
      },
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    const errandId = id != null ? String(id) : '';
    if (!errandId) {
      wx.showToast({ title: '跑腿信息异常', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/packageErrand/detail/index?id=${encodeURIComponent(errandId)}` });
  },

  onListScroll(e) {
    if (!this.data.useVirtual || !this.data.list.length) return;
    const scrollTop = e.detail.scrollTop || 0;
    const PINNED_ESTIMATE_PX = 80;
    const ITEM_HEIGHT_PX = 70;
    const listScrollTop = Math.max(0, scrollTop - PINNED_ESTIMATE_PX);
    const newStart = Math.min(
      Math.max(0, this.data.list.length - this.data.VIRTUAL_WINDOW),
      Math.floor(listScrollTop / ITEM_HEIGHT_PX)
    );
    if (newStart === this.data.virtualStart) return;
    const displayList = this.data.list.slice(newStart, newStart + this.data.VIRTUAL_WINDOW);
    this.setData({ virtualStart: newStart, displayList });
  },
});
