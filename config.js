/** 请求配置（上线时 isMock 请设为 false） */
// 只需要改这里：本地后端地址（模拟器用 127.0.0.1；真机需改成你电脑的局域网 IP）
const LOCAL_API_BASE = 'http://127.0.0.1:3000';
// 线上/测试后端地址（保持原值）
const PROD_API_BASE = 'http://124.222.34.110:3000';

export default {
  isMock: false,
  /**
   * 兼容旧版封装（`api/request.js` 使用该字段拼接 url）
   * 统一与 `apiBaseUrl` 保持一致。
   */
  baseUrl: LOCAL_API_BASE,

  /**
   * 自建后端地址
   * - 当前小程序不使用云函数，所有业务接口都通过 HTTP 访问该后端服务。
   * - 内网 IP / http 仅适合开发调试；真机预览请在开发者工具勾选「不校验合法域名」。
   * - 正式 / 体验版请替换为已备案、已配置合法域名的 HTTPS 地址。
   */
  apiBaseUrl: LOCAL_API_BASE,

  // 线上/测试：保留原公网后端（当 apiBaseUrl 为空时会回退到这里）
  useLocalDevApi: true,
  productionApiBase: PROD_API_BASE,
  // 兼容旧字段：当 apiBaseUrl 为空且 useLocalDevApi=true 时，会拼成 http://devLanHost:devPort
  devLanHost: '127.0.0.1',
  devPort: 3000,
};
