// 云函数入口文件
const cloud = require('wx-server-sdk')
const { createHandlers } = require('./handlers')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const handlers = createHandlers(db)

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event
  const fn = handlers[action]
  if (!fn) {
    return {
      code: 400,
      message: '未知的操作'
    }
  }
  return fn(event, wxContext)
}
