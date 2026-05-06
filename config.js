/** 请求配置（上线时 isMock 请设为 false） */
export default {
  isMock: false,
  baseUrl: '',

  /**
   * 自建后端地址
   * - 正式 / 体验版：useLocalDevApi 设为 false，并填写 productionApiBase（公网须 https，与小程序后台「服务器域名」一致）
   * - 内网 IP + http 仅适合同 VPC / 局域网调试；真机预览请在开发者工具勾选「不校验合法域名」
   * - 本地联调：useLocalDevApi 为 true，真机用 devLanHost，开发者工具用 127.0.0.1
   */
  useLocalDevApi: false,
  /** 无尾部斜杠；当前为线上 API 机内网地址（与 Docker 映射 3000 一致） */
  productionApiBase: 'http://localhost:3000',
  devLanHost: '124.222.34.110',
  devPort: 3000,
};
