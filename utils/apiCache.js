/**
 * 接口结果内存缓存，用于减少重复请求、优化性能
 * TTL 单位：秒
 */
const store = {};

function keyFrom(name, data) {
  try {
    return name + '_' + JSON.stringify(data || {});
  } catch {
    return name + '_' + String(data);
  }
}

export function get(name, data) {
  const key = keyFrom(name, data);
  const item = store[key];
  if (!item) return null;
  if (item.expireAt && Date.now() > item.expireAt) {
    delete store[key];
    return null;
  }
  return item.data;
}

export function set(name, data, payload, ttlSeconds = 60) {
  const key = keyFrom(name, data);
  store[key] = {
    data: payload,
    expireAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  };
}

export function remove(name, data) {
  const key = keyFrom(name, data);
  delete store[key];
}

export function clear() {
  Object.keys(store).forEach((k) => delete store[k]);
}

export default { get, set, remove, clear };
