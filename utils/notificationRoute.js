const ROUTE_BUILDERS = {
  forum: (id) => `/packageForum/post/index?postId=${encodeURIComponent(id)}`,
  task: (id) => `/packageTask/detail/index?id=${encodeURIComponent(id)}`,
  mall: (id) => `/packageMall/order-detail/index?id=${encodeURIComponent(id)}`,
};

function notificationTarget(row) {
  if (!row || typeof row !== 'object') return null;
  const { bizType, bizId: rawId } = row;
  if (!Object.prototype.hasOwnProperty.call(ROUTE_BUILDERS, bizType)) return null;
  if (typeof rawId !== 'string') return null;
  const bizId = rawId.trim();
  const hasControlCharacter = Array.from(bizId).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!bizId || bizId.length > 256 || hasControlCharacter) return null;
  return { bizType, bizId };
}

export function notificationUrl(row) {
  const target = notificationTarget(row);
  return target ? ROUTE_BUILDERS[target.bizType](target.bizId) : '';
}

export function notificationProbe(row, apis) {
  const target = notificationTarget(row);
  if (!target) return null;
  if (target.bizType === 'forum') return apis.forumAPI.getPostDetail(target.bizId);
  if (target.bizType === 'task') return apis.taskAPI.getTaskDetail(target.bizId);
  return apis.mallAPI.getOrderDetail(target.bizId);
}
