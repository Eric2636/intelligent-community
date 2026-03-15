// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  // 获取待领取的任务列表（支持关键词搜索）
  if (action === 'getPendingTasks') {
    const { keyword } = event
    try {
      let query = db.collection('tasks').where({ status: 'pending_take' })
      if (keyword && keyword.trim()) {
        const _ = db.command
        const reg = db.RegExp({ regexp: keyword.trim(), options: 'i' })
        query = db.collection('tasks').where(_.and([
          { status: 'pending_take' },
          _.or([{ title: reg }, { desc: reg }])
        ]))
      }
      const result = await query.orderBy('createdAt', 'desc').get()
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error('获取任务列表失败:', err)
      // 如果集合不存在，返回空数组而不是错误
      if (err.message && err.message.includes('collection not exists')) {
        return {
          code: 200,
          data: [],
          message: '任务集合尚未创建，请先发布任务'
        }
      }
      return {
        code: 500,
        message: '获取任务列表失败'
      }
    }
  }

  // 获取任务详情
  if (action === 'getTaskDetail') {
    const { taskId } = event
    try {
      const result = await db.collection('tasks')
        .doc(taskId)
        .get()
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '获取任务详情失败'
      }
    }
  }

  // 发布任务
  if (action === 'publishTask') {
    const { title, desc, reward, location, publisherName } = event
    try {
      const result = await db.collection('tasks').add({
        data: {
          title,
          desc,
          reward,
          location,
          status: 'pending_take',
          publisherId: wxContext.OPENID,
          publisherName,
          takerId: '',
          takerName: '',
          proofText: '',
          proofImages: [],
          createdAt: new Date().toISOString(),
          claimedAt: '',
          completedAt: '',
          confirmedAt: ''
        }
      })
      return {
        code: 200,
        data: {
          id: result._id,
          ...event
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '发布任务失败'
      }
    }
  }

  // 领取任务
  if (action === 'claimTask') {
    const { taskId, takerName } = event
    try {
      const result = await db.collection('tasks')
        .doc(taskId)
        .update({
          data: {
            status: 'in_progress',
            takerId: wxContext.OPENID,
            takerName,
            claimedAt: new Date().toISOString()
          }
        })
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '领取任务失败'
      }
    }
  }

  // 提交完成
  if (action === 'submitComplete') {
    const { taskId, proofText, proofImages } = event
    try {
      const result = await db.collection('tasks')
        .doc(taskId)
        .update({
          data: {
            status: 'pending_confirm',
            proofText,
            proofImages: proofImages || [],
            completedAt: new Date().toISOString()
          }
        })
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '提交完成失败'
      }
    }
  }

  // 确认完成
  if (action === 'confirmComplete') {
    const { taskId } = event
    try {
      const result = await db.collection('tasks')
        .doc(taskId)
        .update({
          data: {
            status: 'completed',
            confirmedAt: new Date().toISOString()
          }
        })
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '确认完成失败'
      }
    }
  }

  // 取消任务
  if (action === 'cancelTask') {
    const { taskId } = event
    try {
      const result = await db.collection('tasks')
        .doc(taskId)
        .update({
          data: {
            status: 'cancelled'
          }
        })
      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '取消任务失败'
      }
    }
  }

  // 提交评价（仅任务已完成时可评价对方）
  if (action === 'submitRating') {
    const { taskId, toUserId, rating, comment } = event
    const fromUserId = wxContext.OPENID
    if (!taskId || !toUserId || rating == null) return { code: 400, message: '缺少参数' }
    const r = Number(rating)
    if (r < 1 || r > 5) return { code: 400, message: '评分请填 1-5 星' }
    try {
      const task = await db.collection('tasks').doc(taskId).get()
      if (!task.data) return { code: 404, message: '任务不存在' }
      if (task.data.status !== 'completed') return { code: 400, message: '仅完成任务后可评价' }
      const { publisherId, takerId } = task.data
      const canRate = (fromUserId === publisherId && toUserId === takerId) || (fromUserId === takerId && toUserId === publisherId)
      if (!canRate) return { code: 403, message: '只能评价对方' }
      const exist = await db.collection('task_ratings').where({ taskId, fromUserId }).get()
      if (exist.data.length > 0) return { code: 400, message: '已评价过' }
      await db.collection('task_ratings').add({
        data: {
          taskId,
          fromUserId,
          toUserId,
          rating: r,
          comment: comment || '',
          taskTitle: task.data.title,
          createdAt: new Date().toISOString()
        }
      })
      return { code: 200, data: {} }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '评价失败' }
    }
  }

  // 获取收到的评价
  if (action === 'getMyRatings') {
    const openid = wxContext.OPENID
    try {
      const result = await db.collection('task_ratings')
        .where({ toUserId: openid })
        .orderBy('createdAt', 'desc')
        .get()
      return { code: 200, data: result.data }
    } catch (err) {
      console.error(err)
      if (err.message && err.message.includes('collection not exists')) return { code: 200, data: [] }
      return { code: 500, message: '获取评价失败' }
    }
  }

  // 获取我的任务
  if (action === 'getMyTasks') {
    const { type } = event
    const openid = wxContext.OPENID

    try {
      let result
      if (type === 'published') {
        result = await db.collection('tasks')
          .where({
            publisherId: openid,
            status: db.command.neq('cancelled')
          })
          .orderBy('createdAt', 'desc')
          .get()
      } else if (type === 'taken') {
        result = await db.collection('tasks')
          .where({
            takerId: openid
          })
          .orderBy('claimedAt', 'desc')
          .get()
      }

      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '获取我的任务失败'
      }
    }
  }

  return {
    code: 400,
    message: '未知的操作'
  }
}
