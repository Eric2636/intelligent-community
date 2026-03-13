/**
 * 商城 Mock API
 */
import store from './store';

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export function getCategories() {
  return delay().then(() => ({ code: 200, data: store.getCategories() }));
}

export function getItemList(categoryId) {
  return delay().then(() => ({ code: 200, data: store.getItemList(categoryId) }));
}

export function getMyItems() {
  return delay().then(() => {
    const uid = (getApp().globalData && getApp().globalData.userId) || 'user1';
    return { code: 200, data: store.getMyItems(uid) };
  });
}

export function getItemDetail(id) {
  return delay().then(() => {
    const data = store.getItemDetail(id);
    if (!data) return { code: 404, data: null };
    return { code: 200, data };
  });
}

export function publishItem(payload) {
  return delay().then(() => {
    const uid = (getApp().globalData && getApp().globalData.userId) || 'user1';
    const data = store.addItem({ ...payload, publisherId: uid });
    return { code: 200, data };
  });
}
