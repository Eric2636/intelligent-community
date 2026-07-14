/** 自建后端 HTTP 请求配置 */
// 只需要改这里：本地后端地址（模拟器用 127.0.0.1；真机需改成你电脑的局域网 IP）
const LOCAL_API_BASE = 'http://127.0.0.1:3000';
// 线上后端地址
const PROD_API_BASE = 'https://lllhjh.asia';

export default {
  /**
   * 自建后端地址
   * - 当前小程序不使用云函数，所有业务接口都通过 HTTP 访问该后端服务。
   * - 内网 IP / http 仅适合开发调试；真机预览请在开发者工具勾选「不校验合法域名」。
   * - 正式 / 体验版请替换为已备案、已配置合法域名的 HTTPS 地址。
   */
  apiBaseUrl: '',
  // 生产版本不显示微信内置 vConsole。
  enableVConsole: false,

  // 生产分支固定连接线上后端。
  useLocalDevApi: false,
  productionApiBase: PROD_API_BASE,
  // 兼容旧字段：当 apiBaseUrl 为空且 useLocalDevApi=true 时，会拼成 http://devLanHost:devPort
  devLanHost: '127.0.0.1',
  devPort: 3000,
};
