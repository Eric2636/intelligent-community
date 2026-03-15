// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  // 获取通知列表
  if (action === 'getNotifications') {
    try {
      const result = await db.collection('notifications')
        .where({
          userId: wxContext.OPENID
        })
        .orderBy('createdAt', 'desc')
        .get()
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '获取通知列表失败'
      }
    }
  }

  // 提交反馈
  if (action === 'submitFeedback') {
    const { type, content, contact } = event
    try {
      await db.collection('feedbacks').add({
        data: {
          userId: wxContext.OPENID,
          type,
          content,
          contact,
          createdAt: new Date().toISOString()
        }
      })
      return {
        code: 200,
        message: '提交成功'
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '提交反馈失败'
      }
    }
  }

  // 发送订阅消息（需在微信公众平台配置模板，并将 templateId 配置到云函数或调用方传入）
  if (action === 'sendSubscribeMessage') {
    const { templateId, touser, data, page } = event
    if (!templateId || !touser || !data) {
      return { code: 400, message: '缺少 templateId、touser 或 data' }
    }
    try {
      await cloud.openapi.subscribeMessage.send({
        touser,
        templateId,
        page: page || '',
        data: typeof data === 'object' ? data : {},
        miniprogramState: 'formal'
      })
      return { code: 200, message: '发送成功' }
    } catch (err) {
      console.error('发送订阅消息失败', err)
      return {
        code: 500,
        message: err.message || '发送失败，请确认用户已订阅且模板有效'
      }
    }
  }

  return {
    code: 400,
    message: '未知的操作'
  }
}
