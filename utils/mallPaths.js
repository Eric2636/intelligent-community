/** 小区市场分包路由，避免各处硬编码路径（须放在主包 utils，供主包与分包共同引用） */

export function mallDetailUrl(itemId) {
  return `/packageMall/detail/index?id=${encodeURIComponent(itemId)}`;
}

export function mallPublishUrl() {
  return '/packageMall/publish/index';
}

export function mallMyItemsUrl() {
  return '/packageMall/my-list/index';
}

export function mallOrdersUrl() {
  return '/packageMall/order-list/index';
}

export function mallOrderDetailUrl(orderId) {
  return `/packageMall/order-detail/index?id=${encodeURIComponent(orderId)}`;
}

export function mallFavoritesUrl() {
  return '/packageMall/favorites/index';
}
