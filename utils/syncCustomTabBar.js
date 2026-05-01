/** 自定义 TabBar 与当前 Tab 页选中态同步（微信会为每个 Tab 页创建新的 TabBar 组件实例） */
export function syncCustomTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return;
  const tabBar = page.getTabBar();
  if (tabBar && typeof tabBar.syncFromRoute === 'function') {
    tabBar.syncFromRoute();
  }
}
