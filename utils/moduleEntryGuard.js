import { decryptText } from '~/utils/textCipher';

const STORAGE_KEY = 'module_entry_tabs';

/** 与 app.json tabBar 顺序一致，用于「第一个可见 Tab」 */
const TAB_ORDER = ['task', 'errand', 'forum', 'mall', 'my'];
/** 可配置模块（含非底部 Tab 模块） */
const MODULE_ORDER = ['task', 'errand', 'forum', 'mall', 'my'];

function normalizeTabs(rawTabs) {
  const base = Array.isArray(rawTabs) ? rawTabs : [];
  const seen = new Set();
  const tabs = [];

  for (const t of base) {
    if (!t || typeof t !== 'object') continue;
    const key = t.key;
    if (!key || typeof key !== 'string') continue;
    if (!MODULE_ORDER.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({
      key,
      value: key,
      label: typeof t.labelEnc === 'string' && t.labelEnc ? decryptText(t.labelEnc) : (typeof t.label === 'string' && t.label ? t.label : key),
      icon: typeof t.icon === 'string' && t.icon ? t.icon : '',
      enabled: t.enabled !== false,
      always: t.always === true,
    });
  }

  return tabs;
}

export function getModuleEntryTabs() {
  const app = getApp();
  const tabs = app.globalData.moduleEntryTabs;
  if (Array.isArray(tabs)) return normalizeTabs(tabs);
  // 未加载到配置（也没有缓存）时：不展示任何入口
  return [];
}

export function buildVisibleTabBarList() {
  const tabs = getModuleEntryTabs();
  return tabs.filter((t) => TAB_ORDER.includes(t.value) && (t.always || t.enabled));
}

export function isModuleEnabled(moduleKey) {
  const tabs = getModuleEntryTabs();
  if (!tabs.length) return false;
  const t = tabs.find((x) => x.value === moduleKey);
  return !!(t && t.enabled !== false);
}

export function getFirstVisibleTabUrl() {
  const visible = buildVisibleTabBarList();
  const first = visible[0] ? visible[0].value : '';
  return first ? `/pages/${first}/index` : '';
}

/**
 * @param {'task'|'errand'|'forum'|'mall'} moduleKey
 * @returns {boolean} 是否已触发跳转（若 true，调用方应跳过后续加载）
 */
export function redirectIfEntryHidden(moduleKey) {
  if (moduleKey === 'my') return false;
  const tabs = getModuleEntryTabs();
  // 配置尚未加载：不做跳转
  if (!tabs.length) return false;
  const target = tabs.find((t) => t.value === moduleKey);
  if (target && target.enabled === false) {
    const url = getFirstVisibleTabUrl();
    if (url) wx.switchTab({ url });
    return true;
  }
  return false;
}

export function readStoredModuleTabs() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    if (stored && typeof stored === 'object') return stored;
  } catch (e) {}
  return null;
}

export { STORAGE_KEY };
