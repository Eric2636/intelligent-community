// 云函数入口文件 - 测试数据库连接
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const collections = ['tasks', 'posts', 'replies', 'items', 'orders', 'users', 'notifications', 'feedbacks', 'post_likes', 'post_favorites', 'item_favorites', 'task_ratings']

    const results = []

    // 测试每个集合是否存在并尝试添加数据
    for (const collectionName of collections) {
      try {
        // 先尝试查询集合，如果集合不存在会报错
        const testQuery = await db.collection(collectionName).limit(1).get()

        // 如果查询成功，说明集合存在，尝试添加测试数据
        const result = await db.collection(collectionName).add({
          data: {
            _init: true,
            createdAt: new Date().toISOString()
          }
        })
        results.push({
          collection: collectionName,
          success: true,
          id: result._id,
          message: '测试数据添加成功'
        })
        console.log(`集合 ${collectionName} 测试数据添加成功，ID: ${result._id}`)
      } catch (err) {
        results.push({
          collection: collectionName,
          success: false,
          error: err.message,
          message: '集合不存在或权限问题，请在云开发控制台手动创建集合'
        })
        console.error(`集合 ${collectionName} 测试失败:`, err.message)
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    return {
      code: failedCount === 0 ? 200 : 206,
      message: failedCount === 0 ? '所有集合测试成功' : '部分集合需要手动创建',
      data: {
        total: collections.length,
        success: successCount,
        failed: failedCount,
        results
      },
      guide: failedCount > 0 ? {
        action: '请在云开发控制台手动创建缺失的集合',
        missingCollections: results.filter(r => !r.success).map(r => r.collection),
        steps: [
          '1. 打开微信开发者工具的云开发控制台',
          '2. 进入数据库页面',
          '3. 点击"添加集合"',
          '4. 输入集合名称并确定'
        ]
      } : null
    }
  } catch (err) {
    console.error('测试失败:', err)
    return {
      code: 500,
      message: '数据库测试失败',
      error: err.message
    }
  }
}
