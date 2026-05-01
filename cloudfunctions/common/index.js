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

  // 小程序底部 Tab 入口配置（集合 app_settings：以“列表文档”方式存储）
  if (action === 'getModuleEntryTabs') {
    const empty = { tabs: [] }
    try {
      // 新结构：app_settings 中每个 tab 一条文档（kind='tab'），按 order 升序
      const listRes = await db.collection('app_settings')
        .where({ kind: 'tab' })
        .orderBy('order', 'asc')
        .limit(50)
        .get()
      const list = (listRes && Array.isArray(listRes.data)) ? listRes.data : []
      if (list.length) {
        const tabs = list.map((d) => ({
          key: d.key,
          icon: d.icon,
          enabled: d.enabled,
          always: d.always,
          labelEnc: d.labelEnc,
          // 兼容：如果数据库里仍有 label 明文，也透传（客户端会优先 labelEnc）
          label: d.label,
        }))
        return { code: 200, data: { tabs } }
      }

      // 旧结构兼容：app_settings/module_entry.tabs
      const { data } = await db.collection('app_settings').doc('module_entry').get()
      if (data && Array.isArray(data.tabs)) {
        return { code: 200, data: { tabs: data.tabs } }
      }
      return { code: 200, data: empty }
    } catch (err) {
      console.warn('getModuleEntryTabs: 获取失败，返回空配置', err.message || err)
      return { code: 200, data: empty }
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
