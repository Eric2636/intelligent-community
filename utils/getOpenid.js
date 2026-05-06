/** 当前登录用户 openid（未登录为空字符串） */
export function getOpenid() {
  const app = getApp()
  const u = app.globalData && app.globalData.userInfo
  if (u && u.openid) return u.openid
  return (app.globalData && app.globalData.openid) || ''
}

/** 自建后端 JWT 对应的 User.id，与任务/商城等接口里的 publisherId、sellerId 一致 */
export function getCurrentUserId() {
  const app = getApp()
  const u = app.globalData && app.globalData.userInfo
  return (u && u.id) || ''
}
