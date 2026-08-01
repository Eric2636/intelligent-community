import { taskAPI } from '~/api/cloud';
import { redirectIfEntryHidden } from '~/utils/moduleEntryGuard';
import { LIST_REFRESH_KEYS, consumeListRefresh } from '~/utils/listRefresh';
import { formatDateTimeYmdHm } from '~/utils/date';
import { normalizeAvatar } from '~/utils/defaultAvatar';
import { ensureMutationReady } from '~/utils/authIdentity';
import { navigateToWithListMutation } from '~/utils/listMutation';

const STATUS_TEXT = {
  draft: '草稿',
  pending_take: '待领取',
  in_progress: '进行中',
  pending_confirm: '待确认',
  completed: '已完成',
  cancelled: '已取消',
};

function normalizeTaskRow(item) {
  if (!item) return item;
  let id = '';
  if (item.id != null) id = String(item.id);
  else if (item._id != null) id = String(item._id);
  const status = item.status || 'pending_take';
  return {
    ...item,
    id,
    status,
    statusLabel: STATUS_TEXT[status] || status,
    publisherAvatar: normalizeAvatar(item.publisherAvatar),
    images: Array.isArray(item.images) ? item.images : [],
    videos: Array.isArray(item.videos) ? item.videos : [],
    desc: item.desc || '',
    location: item.location || '',
    createdAt: formatDateTimeYmdHm(item.createdAt),
  };
}

Page({
  data: {
    activeTab: 'published',
    publishedList: [],
    takenList: [],
    draftList: [],
    cancelledList: [],
    showTabs: true,
    pageTitle: '我的任务',
    emptyText: '暂无发布的任务',
    loading: true,
    showManualLoad: false,
    loadingProps: { size: '40rpx' },
  },

  onLoad(options = {}) {
    if (redirectIfEntryHidden('task')) return;
    this._taskPageAlive = true;
    this._taskLoadRequestId = 0;
    this._skipNextShowRefresh = true;
    const type = options.type === 'draft' || options.type === 'cancelled' ? options.type : 'published';
    const pageTitleMap = {
      draft: '我的草稿',
      cancelled: '我的撤回',
      published: '我的任务',
    };
    const emptyTextMap = {
      draft: '暂无任务草稿',
      cancelled: '暂无撤回的任务',
      published: '暂无发布的任务',
    };
    const pageTitle = pageTitleMap[type];
    const emptyText = emptyTextMap[type];
    this.setData({
      activeTab: type,
      showTabs: type === 'published',
      pageTitle,
      emptyText,
    });
    wx.setNavigationBarTitle({ title: pageTitle });
    this.loadTasks();
  },

  onShow() {
    if (redirectIfEntryHidden('task')) return;
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    const marked = consumeListRefresh(LIST_REFRESH_KEYS.taskMine);
    if (!marked) {
      this._listMutationHandled = false;
      return;
    }
    if (this._listMutationHandled) {
      this._listMutationHandled = false;
      return;
    }
    this.loadTasks({ silent: true });
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh());
  },

  onAuthorized() {
    this.setData({ showManualLoad: true });
  },

  onManualLoad() {
    this.setData({ showManualLoad: false });
    return this.loadTasks();
  },

  onTabTap(e) {
    if (!this.data.showTabs) return;
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => this.loadTasks());
  },

  async loadTasks({ silent = false } = {}) {
    if (redirectIfEntryHidden('task')) return;
    const { activeTab } = this.data;
    const requestId = (this._taskLoadRequestId || 0) + 1;
    this._taskLoadRequestId = requestId;
    const isCurrentRequest = () => this._taskPageAlive && requestId === this._taskLoadRequestId;
    if (!silent) this.setData({ loading: true });
    try {
      if (!(await ensureMutationReady(this))) {
        if (isCurrentRequest()) this.setData({ loading: false });
        return;
      }
      if (!isCurrentRequest()) return;
      const type = ['taken', 'draft', 'cancelled'].includes(activeTab) ? activeTab : 'published';
      const res = await taskAPI.getMyTasks(type);
      if (!isCurrentRequest()) return;
      if (res.code === 200) {
        const raw = res.data || [];
        const list = raw.map(normalizeTaskRow);
        const updates = { loading: false };
        if (activeTab === 'taken') updates.takenList = list;
        else if (activeTab === 'draft') updates.draftList = list;
        else if (activeTab === 'cancelled') updates.cancelledList = list;
        else updates.publishedList = list;
        this.setData(updates);
      } else {
        wx.showToast({ title: res.message || '获取任务失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('加载我的任务失败', err);
      wx.showToast({ title: (err && (err.message || err.errMsg)) || '网络错误，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onPreviewListImages(e) {
    const { kind, cardIndex, current } = e.currentTarget.dataset;
    const listMap = {
      taken: this.data.takenList,
      draft: this.data.draftList,
      cancelled: this.data.cancelledList,
      published: this.data.publishedList,
    };
    const list = listMap[kind] || this.data.publishedList;
    const item = list[Number(cardIndex)];
    if (!item || !item.images || !item.images.length) return;
    wx.previewImage({
      current: current || item.images[0],
      urls: item.images,
    });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    if (this.data.activeTab === 'draft') {
      wx.navigateTo({ url: `/packageTask/publish/index?draftId=${encodeURIComponent(id)}` });
      return;
    }
    navigateToWithListMutation(
      this,
      `/packageTask/detail/index?id=${id}`,
      ['publishedList', 'takenList', 'draftList', 'cancelledList'],
      normalizeTaskRow,
    );
  },

  onUnload() {
    this._authPageAlive = false;
    this._taskPageAlive = false;
    this._taskLoadRequestId = (this._taskLoadRequestId || 0) + 1;
  },
});
