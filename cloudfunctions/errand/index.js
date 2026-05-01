const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

const COLLECTIONS = {
  posts: 'errand_posts',
  replies: 'errand_replies',
  likes: 'errand_likes',
  favorites: 'errand_favorites'
}

function hasUnsupportedEmoji(text) {
  return /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text || '')
}

function validatePlainText(fields) {
  for (const text of fields) {
    if (hasUnsupportedEmoji(text)) {
      return { code: 400, message: '请修改内容后重试' }
    }
  }
  return null
}

function getErrorText(err) {
  return [
    err && err.message,
    err && err.errMsg,
    err && err.errCode,
    err && err.code
  ].filter(Boolean).join(' ')
}

function isCollectionNotExists(err) {
  const text = getErrorText(err)
  return /collection.*not.*exist|collection not exists|集合不存在/i.test(text)
}

function errandStatusText(status) {
  const s = status || 'pending_take'
  if (s === 'pending_take') return '待领取'
  if (s === 'in_progress') return '进行中'
  if (s === 'completed') return '已完成'
  return '待领取'
}

function parseRewardYuan(raw) {
  const s = (raw != null ? String(raw) : '').trim()
  if (!s) return { error: '请输入佣金（元）' }
  const n = parseFloat(s)
  if (Number.isNaN(n) || n <= 0) return { error: '请输入有效佣金（元）' }
  if (n > 99999) return { error: '佣金金额过大' }
  return { value: String(n) }
}

function formatErrand(item) {
  const id = item._id != null ? String(item._id) : ''
  const status = item.status || 'pending_take'
  const reward = item.reward != null && item.reward !== '' ? String(item.reward) : '0'
  return {
    ...item,
    id,
    createTime: item.createdAt,
    replyCount: item.replyCount || 0,
    viewCount: item.viewCount || 0,
    likeCount: item.likeCount || 0,
    status,
    reward,
    statusText: errandStatusText(status),
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event || {}

  if (action === 'getErrandList') {
    const keyword = (event.keyword || '').trim()
    const { page = 1, pageSize = 10, orderBy = 'time' } = event
    const skip = (page - 1) * pageSize
    try {
      const _ = db.command
      const baseWhere = keyword
        ? _.and([
            { pinned: false },
            _.or([
              { title: db.RegExp({ regexp: keyword, options: 'i' }) },
              { content: db.RegExp({ regexp: keyword, options: 'i' }) }
            ])
          ])
        : { pinned: false }
      const pinnedWhere = keyword
        ? _.and([
            { pinned: true },
            _.or([
              { title: db.RegExp({ regexp: keyword, options: 'i' }) },
              { content: db.RegExp({ regexp: keyword, options: 'i' }) }
            ])
          ])
        : { pinned: true }

      const pinnedResult = await db.collection(COLLECTIONS.posts)
        .where(pinnedWhere)
        .orderBy('createdAt', 'desc')
        .get()
      const countResult = await db.collection(COLLECTIONS.posts).where(baseWhere).count()
      let normalQuery = db.collection(COLLECTIONS.posts).where(baseWhere)
      if (orderBy === 'hot') {
        normalQuery = normalQuery.orderBy('replyCount', 'desc').orderBy('createdAt', 'desc')
      } else {
        normalQuery = normalQuery.orderBy('createdAt', 'desc')
      }
      const normalResult = await normalQuery.skip(skip).limit(pageSize).get()
      return {
        code: 200,
        data: {
          pinned: (pinnedResult.data || []).map(formatErrand),
          list: (normalResult.data || []).map(formatErrand),
          total: countResult.total
        }
      }
    } catch (err) {
      console.error('getErrandList error', err)
      if (isCollectionNotExists(err)) {
        return { code: 200, data: { pinned: [], list: [], total: 0 } }
      }
      return { code: 500, message: '获取跑腿列表失败', error: getErrorText(err) }
    }
  }

  if (action === 'publishErrand') {
    const title = (event.title || '').trim()
    const content = (event.content || '').trim()
    if (!title) return { code: 400, message: '请输入跑腿标题' }
    if (!content) return { code: 400, message: '请输入跑腿内容' }
    const rewardParsed = parseRewardYuan(event.reward)
    if (rewardParsed.error) return { code: 400, message: rewardParsed.error }
    const textError = validatePlainText([title, content])
    if (textError) return textError
    try {
      const now = new Date().toISOString()
      const addRes = await db.collection(COLLECTIONS.posts).add({
        data: {
          title,
          content,
          reward: rewardParsed.value,
          status: 'pending_take',
          claimerId: '',
          claimerName: '',
          claimedAt: '',
          completedAt: '',
          authorId: wxContext.OPENID,
          authorName: event.authorName || '匿名用户',
          authorAvatar: '',
          replyCount: 0,
          viewCount: 0,
          likeCount: 0,
          pinned: false,
          createdAt: now
        }
      })
      return {
        code: 200,
        data: {
          id: addRes._id,
          title,
          content,
          reward: rewardParsed.value,
          status: 'pending_take',
          authorName: event.authorName || '匿名用户',
          createdAt: now,
          createTime: now
        }
      }
    } catch (err) {
      console.error('publishErrand error', err)
      return { code: 500, message: '发布跑腿失败' }
    }
  }

  if (action === 'getErrandDetail') {
    const { errandId } = event
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const res = await db.collection(COLLECTIONS.posts).doc(errandId).get()
      if (!res.data) return { code: 404, message: '跑腿不存在或已被删除' }

      let replyResult
      try {
        replyResult = await db.collection(COLLECTIONS.replies)
          .where({ errandId })
          .orderBy('createdAt', 'desc')
          .get()
      } catch (replyErr) {
        console.warn('获取跑腿回复失败，可能是集合不存在:', replyErr.message)
        replyResult = { data: [] }
      }

      const openid = wxContext.OPENID
      let isLiked = false
      let isFavorited = false
      try {
        const [likeRes, favRes] = await Promise.all([
          db.collection(COLLECTIONS.likes).where({ errandId, userId: openid }).count(),
          db.collection(COLLECTIONS.favorites).where({ errandId, userId: openid }).count()
        ])
        isLiked = (likeRes.total || 0) > 0
        isFavorited = (favRes.total || 0) > 0
      } catch (_) {}

      const raw = res.data
      const data = formatErrand(raw)
      const authorId = raw.authorId || ''
      const status = data.status || 'pending_take'
      const canClaim = status === 'pending_take' && authorId && authorId !== openid
      const isAuthor = authorId === openid
      const canComplete = status === 'in_progress' && isAuthor
      return {
        code: 200,
        data: {
          ...data,
          isLiked,
          isFavorited,
          canClaim,
          isAuthor,
          canComplete,
          replies: (replyResult.data || []).map((reply) => ({
            ...reply,
            id: reply._id,
            createTime: reply.createdAt
          }))
        }
      }
    } catch (err) {
      console.error('getErrandDetail error', err)
      if (getErrorText(err).includes('doc not exists')) {
        return { code: 404, message: '跑腿不存在或已被删除' }
      }
      return { code: 500, message: '获取跑腿详情失败', error: getErrorText(err) }
    }
  }

  if (action === 'publishErrandReply') {
    const { errandId, authorName } = event
    const content = (event.content || '').trim()
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    if (!content) return { code: 400, message: '请输入回复' }
    const textError = validatePlainText([content])
    if (textError) return textError
    try {
      const now = new Date().toISOString()
      const replyResult = await db.collection(COLLECTIONS.replies).add({
        data: {
          errandId,
          authorName: authorName || '匿名用户',
          content,
          createdAt: now
        }
      })
      await db.collection(COLLECTIONS.posts).doc(errandId).update({
        data: { replyCount: db.command.inc(1) }
      })
      return {
        code: 200,
        data: {
          id: replyResult._id,
          errandId,
          authorName: authorName || '匿名用户',
          content,
          createdAt: now,
          createTime: now
        }
      }
    } catch (err) {
      console.error('publishErrandReply error', err)
      return { code: 500, message: '发布回复失败' }
    }
  }

  if (action === 'likeErrand') {
    const { errandId } = event
    const userId = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const exist = await db.collection(COLLECTIONS.likes).where({ errandId, userId }).get()
      if (exist.data.length > 0) return { code: 200, data: { liked: true } }
      await db.collection(COLLECTIONS.likes).add({ data: { errandId, userId } })
      const errand = await db.collection(COLLECTIONS.posts).doc(errandId).get()
      const likeCount = ((errand.data && errand.data.likeCount) || 0) + 1
      await db.collection(COLLECTIONS.posts).doc(errandId).update({
        data: { likeCount }
      })
      return { code: 200, data: { liked: true, likeCount } }
    } catch (err) {
      console.error('likeErrand error', err)
      return { code: 500, message: '点赞失败' }
    }
  }

  if (action === 'unlikeErrand') {
    const { errandId } = event
    const userId = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const list = await db.collection(COLLECTIONS.likes).where({ errandId, userId }).get()
      let likeCount
      if (list.data.length > 0) {
        await db.collection(COLLECTIONS.likes).doc(list.data[0]._id).remove()
        const errand = await db.collection(COLLECTIONS.posts).doc(errandId).get()
        likeCount = Math.max(0, ((errand.data && errand.data.likeCount) || 1) - 1)
        await db.collection(COLLECTIONS.posts).doc(errandId).update({ data: { likeCount } })
      }
      return { code: 200, data: { liked: false, likeCount } }
    } catch (err) {
      console.error('unlikeErrand error', err)
      return { code: 500, message: '取消点赞失败' }
    }
  }

  if (action === 'favoriteErrand') {
    const { errandId } = event
    const userId = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const exist = await db.collection(COLLECTIONS.favorites).where({ errandId, userId }).get()
      if (exist.data.length > 0) return { code: 200, data: { favorited: true } }
      await db.collection(COLLECTIONS.favorites).add({
        data: { errandId, userId, createdAt: new Date().toISOString() }
      })
      return { code: 200, data: { favorited: true } }
    } catch (err) {
      console.error('favoriteErrand error', err)
      return { code: 500, message: '收藏失败' }
    }
  }

  if (action === 'unfavoriteErrand') {
    const { errandId } = event
    const userId = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const list = await db.collection(COLLECTIONS.favorites).where({ errandId, userId }).get()
      if (list.data.length > 0) await db.collection(COLLECTIONS.favorites).doc(list.data[0]._id).remove()
      return { code: 200, data: { favorited: false } }
    } catch (err) {
      console.error('unfavoriteErrand error', err)
      return { code: 500, message: '取消收藏失败' }
    }
  }

  if (action === 'claimErrand') {
    const { errandId, claimerName } = event
    const openid = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const docRes = await db.collection(COLLECTIONS.posts).doc(errandId).get()
      const row = docRes.data
      if (!row) return { code: 404, message: '跑腿不存在或已被删除' }
      if (row.authorId === openid) return { code: 400, message: '不能领取自己发布的跑腿' }
      if ((row.status || 'pending_take') !== 'pending_take') return { code: 400, message: '该跑腿已被领取或已结束' }
      const _ = db.command
      const now = new Date().toISOString()
      const upd = await db.collection(COLLECTIONS.posts).where({
        _id: errandId,
        status: 'pending_take',
        authorId: _.neq(openid),
      }).update({
        data: {
          status: 'in_progress',
          claimerId: openid,
          claimerName: claimerName || '邻居',
          claimedAt: now,
        },
      })
      if (!upd.stats || upd.stats.updated === 0) {
        return { code: 400, message: '领取失败，请稍后重试' }
      }
      return {
        code: 200,
        data: {
          status: 'in_progress',
          claimerId: openid,
          claimerName: claimerName || '邻居',
          claimedAt: now,
        },
      }
    } catch (err) {
      console.error('claimErrand error', err)
      return { code: 500, message: '领取失败' }
    }
  }

  if (action === 'completeErrand') {
    const { errandId } = event
    const openid = wxContext.OPENID
    if (!errandId) return { code: 400, message: '缺少跑腿 ID' }
    try {
      const now = new Date().toISOString()
      const upd = await db.collection(COLLECTIONS.posts).where({
        _id: errandId,
        authorId: openid,
        status: 'in_progress',
      }).update({
        data: {
          status: 'completed',
          completedAt: now,
        },
      })
      if (!upd.stats || upd.stats.updated === 0) {
        return { code: 400, message: '仅发布者可确认完成，且需为进行中状态' }
      }
      return { code: 200, data: { status: 'completed', completedAt: now } }
    } catch (err) {
      console.error('completeErrand error', err)
      return { code: 500, message: '确认完成失败' }
    }
  }

  if (action === 'getMyErrands') {
    const openid = wxContext.OPENID
    const role = (event.role || 'published').trim()
    try {
      let query
      if (role === 'claimed') {
        query = db.collection(COLLECTIONS.posts).where({ claimerId: openid })
      } else {
        query = db.collection(COLLECTIONS.posts).where({ authorId: openid })
      }
      const result = await query.orderBy('createdAt', 'desc').get()
      return { code: 200, data: (result.data || []).map(formatErrand) }
    } catch (err) {
      console.error('getMyErrands error', err)
      if (isCollectionNotExists(err)) {
        return { code: 200, data: [] }
      }
      return { code: 500, message: '获取我的跑腿失败', error: getErrorText(err) }
    }
  }

  return { code: 400, message: '未知的操作' }
}
