/** 是否使用 mock 代替 api 返回（上线请设为 false） */
export const config = {
  useMock: false,
  // 订阅消息模板 ID 列表，在微信公众平台「订阅消息」中申请后填入，用于消息推送
  subscribeTemplateIds: ['Krl4JhRZbIFrUccFLtgmRgiuK8VSb_hWRYLcEAKm1OM', 'vm5dcU8Dm9RHZnmINicEia_zhsfic-YG2omITNQR-Vo'],
  // 已切换自建后端：云开发环境 ID 不再使用
  cloudEnvId: '',
  // 是否启用业主互助赏金在线支付（true=调起微信支付，false=仅线下支付后确认完成）
  enableTaskPayment: false,
};

export default { config };
