/** 是否使用 mock 代替 api 返回（上线请设为 false） */
export const config = {
  useMock: false,
  // 订阅消息模板 ID 列表，在微信公众平台「订阅消息」中申请后填入，用于消息推送
  subscribeTemplateIds: ['Krl4JhRZbIFrUccFLtgmRgiuK8VSb_hWRYLcEAKm1OM', 'vm5dcU8Dm9RHZnmINicEia_zhsfic-YG2omITNQR-Vo'],
  // 云开发环境 ID（与 app.js 中 wx.cloud.init 的 env 一致），用于任务赏金支付回调
  cloudEnvId: 'intelligence-communi-4bcfec6c3b1',
};

export default { config };
