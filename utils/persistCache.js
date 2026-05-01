function now() {
  return Date.now();
}

export function cacheGet(key) {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) return null;
    const item = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!item) return null;
    if (item.expireAt && now() > item.expireAt) {
      wx.removeStorageSync(key);
      return null;
    }
    return item.data;
  } catch {
    return null;
  }
}

export function cacheSet(key, data, ttlSeconds) {
  try {
    const expireAt = ttlSeconds ? now() + ttlSeconds * 1000 : 0;
    wx.setStorageSync(key, { data, expireAt });
  } catch {}
}

/** 删除本地存储里 key 以 prefix 开头的缓存项（用于发帖/领取后刷新列表等） */
export function invalidateHttpCachePrefix(prefix) {
  const p = String(prefix || '');
  if (!p) return;
  try {
    const keys = (wx.getStorageInfoSync().keys || []).filter((k) => String(k).startsWith(p));
    keys.forEach((k) => {
      try {
        wx.removeStorageSync(k);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

