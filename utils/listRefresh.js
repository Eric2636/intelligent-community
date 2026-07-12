export const LIST_REFRESH_KEYS = {
  forum: 'forum',
  forumMine: 'forumMine',
  forumFavorites: 'forumFavorites',
  mall: 'mall',
  mallMine: 'mallMine',
  mallFavorites: 'mallFavorites',
  mallOrders: 'mallOrders',
  task: 'task',
  taskMine: 'taskMine',
  errand: 'errand',
  errandMine: 'errandMine',
  user: 'user',
};

const STORAGE_KEY = 'list_refresh_flags';

function normalizeKeys(keys) {
  return Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean);
}

function readFlags() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || {};
  } catch (err) {
    return {};
  }
}

function writeFlags(flags) {
  try {
    wx.setStorageSync(STORAGE_KEY, flags || {});
  } catch (err) {
    // ignore storage errors; list pages still refresh on normal navigation paths
  }
}

export function markListRefresh(keys) {
  const normalized = normalizeKeys(keys);
  if (!normalized.length) return;
  const flags = readFlags();
  const now = Date.now();
  normalized.forEach((key) => {
    flags[key] = now;
  });
  writeFlags(flags);
}

export function consumeListRefresh(keys) {
  const normalized = normalizeKeys(keys);
  if (!normalized.length) return false;
  const flags = readFlags();
  const shouldRefresh = normalized.some((key) => Boolean(flags[key]));
  if (!shouldRefresh) return false;
  normalized.forEach((key) => {
    delete flags[key];
  });
  writeFlags(flags);
  return true;
}

export function markForumLists() {
  markListRefresh([LIST_REFRESH_KEYS.forum, LIST_REFRESH_KEYS.forumMine, LIST_REFRESH_KEYS.forumFavorites]);
}

export function markMallLists() {
  markListRefresh([LIST_REFRESH_KEYS.mall, LIST_REFRESH_KEYS.mallMine, LIST_REFRESH_KEYS.mallFavorites]);
}

export function markTaskLists() {
  markListRefresh([LIST_REFRESH_KEYS.task, LIST_REFRESH_KEYS.taskMine]);
}

export function markErrandLists() {
  markListRefresh([LIST_REFRESH_KEYS.errand, LIST_REFRESH_KEYS.errandMine]);
}
