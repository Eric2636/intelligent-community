/**
 * 底部 Tab 入口配置（显隐/顺序/文案/图标）。
 *
 * 云开发开启时：以云数据库 app_settings 中 kind='tab' 的“列表文档”为准（按 order 排序，启动时拉取并缓存）。
 * 兼容旧结构：app_settings/module_entry.tabs。
 *
 * 注意：当前工程已改为“没加载到配置就不显示入口”，此文件仅保留为结构参考（不作为兜底默认）。
 */
export default {
  tabs: [
    { key: 'task', label: '业主互助', icon: 'file-copy', enabled: true },
    { key: 'errand', label: '小区跑腿', icon: 'service', enabled: false },
    { key: 'forum', label: '小区留言', icon: 'chat', enabled: true },
    { key: 'mall', label: '小区市场', icon: 'cart', enabled: true },
    { key: 'my', label: '我的', icon: 'user', enabled: true, always: true },
  ],
};
