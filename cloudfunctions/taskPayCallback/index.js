// 任务赏金支付结果回调（由微信支付在用户支付成功后调用）
// 协议：必须返回 { errcode: 0, errmsg: 'ok' }，否则微信会重复回调
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const resultCode = event.result_code || event.resultCode
  const returnCode = event.return_code || event.returnCode
  const attach = event.attach
  const outTradeNo = event.out_trade_no || event.outTradeNo

  if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
    return { errcode: 0, errmsg: 'ok' }
  }

  const taskId = (attach || '').trim()
  if (!taskId) {
    console.error('taskPayCallback: missing attach taskId')
    return { errcode: 0, errmsg: 'ok' }
  }

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    if (!taskRes.data || taskRes.data.status === 'completed') {
      return { errcode: 0, errmsg: 'ok' }
    }
    await db.collection('tasks').doc(taskId).update({
      data: {
        status: 'completed',
        confirmedAt: new Date().toISOString(),
        rewardPaidAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('taskPayCallback update task error', err)
  }

  return { errcode: 0, errmsg: 'ok' }
}
