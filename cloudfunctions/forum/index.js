// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeMediaIds(arr, max) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const x of arr) {
    if (typeof x !== 'string' || x.indexOf('cloud://') !== 0) continue
    out.push(x)
    if (out.length >= max) break
  }
  return out
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  // 获取帖子列表（支持关键词搜索、排序：time=时间, hot=热度）
  if (action === 'getPosts') {
    try {
      const { page = 1, pageSize = 10, keyword, orderBy = 'time' } = event
      const skip = (page - 1) * pageSize
      const _ = db.command

      const baseWhere = keyword && keyword.trim()
        ? _.and([
            { pinned: false },
            { title: db.RegExp({ regexp: keyword.trim(), options: 'i' }) },
          ])
        : { pinned: false }

      // 置顶帖子（无关键词时查全部置顶；有关键词时也查置顶且匹配）
      const pinnedWhere = keyword && keyword.trim()
        ? _.and([
            { pinned: true },
            { title: db.RegExp({ regexp: keyword.trim(), options: 'i' }) },
          ])
        : { pinned: true }
      const pinnedResult = await db.collection('posts')
        .where(pinnedWhere)
        .orderBy('createdAt', 'desc')
        .get()

      const countResult = await db.collection('posts').where(baseWhere).count()
      let normalQuery = db.collection('posts').where(baseWhere)
      if (orderBy === 'hot') {
        normalQuery = normalQuery.orderBy('replyCount', 'desc').orderBy('createdAt', 'desc')
      } else {
        normalQuery = normalQuery.orderBy('createdAt', 'desc')
      }
      const normalResult = await normalQuery.skip(skip).limit(pageSize).get()

      console.log('普通帖子查询结果:', normalResult.data)

      // 格式化数据，添加 id 和 createTime 字段（保证 id 为字符串，便于前端 data-id 和详情查询）
      const formatPost = (post) => {
        const id = post._id != null ? String(post._id) : ''
        return {
          ...post,
          id,
          createTime: post.createdAt,
          likeCount: post.likeCount || 0
        }
      }

      const pinned = pinnedResult.data.map(formatPost)
      const list = normalResult.data.map(formatPost)

      console.log('格式化后的置顶帖子:', pinned)
      console.log('格式化后的普通帖子:', list)

      return {
        code: 200,
        data: {
          pinned,
          list,
          total: countResult.total
        }
      }
    } catch (err) {
      console.error('获取帖子列表失败:', err)
      // 如果集合不存在，返回空数组
      if (err.message && err.message.includes('collection not exists')) {
        return {
          code: 200,
          data: {
            pinned: [],
            list: [],
            total: 0
          },
          message: '帖子集合尚未创建，请先发布帖子'
        }
      }
      return {
        code: 500,
        message: '获取帖子列表失败'
      }
    }
  }

  // 获取帖子详情
  if (action === 'getPostDetail') {
    const { postId } = event
    console.log('获取帖子详情, postId:', postId)

    // 参数校验
    if (!postId) {
      return {
        code: 400,
        message: '帖子ID不能为空'
      }
    }

    try {
      // 获取帖子信息
      const postResult = await db.collection('posts')
        .doc(postId)
        .get()

      console.log('帖子查询结果:', postResult)

      // 检查帖子是否存在
      if (!postResult.data) {
        console.log('帖子不存在')
        return {
          code: 404,
          message: '帖子不存在或已被删除'
        }
      }

      // 获取回复列表
      let replyResult
      try {
        replyResult = await db.collection('replies')
          .where({
            postId: postId
          })
          .orderBy('createdAt', 'desc')
          .get()
        console.log('回复查询结果:', replyResult)
      } catch (replyErr) {
        // 如果 replies 集合不存在，返回空数组
        console.warn('获取回复失败，可能是集合不存在:', replyErr.message)
        replyResult = { data: [] }
      }

      const postData = postResult.data
      const openid = wxContext.OPENID
      let isLiked = false
      let isFavorited = false
      try {
        const [likeRes, favRes] = await Promise.all([
          db.collection('post_likes').where({ postId, userId: openid }).count(),
          db.collection('post_favorites').where({ postId, userId: openid }).count()
        ])
        isLiked = (likeRes.total || 0) > 0
        isFavorited = (favRes.total || 0) > 0
      } catch (_) {}
      return {
        code: 200,
        data: {
          ...postData,
          id: postData._id,
          createTime: postData.createdAt,
          likeCount: postData.likeCount || 0,
          isLiked,
          isFavorited,
          replies: replyResult.data.map(reply => ({
            ...reply,
            id: reply._id,
            createTime: reply.createdAt
          }))
        }
      }
    } catch (err) {
      console.error('获取帖子详情失败:', err)
      console.error('错误详情:', JSON.stringify(err))

      // 区分帖子不存在的错误和其他错误
      if (err.message && err.message.includes('doc not exists')) {
        return {
          code: 404,
          message: '帖子不存在或已被删除'
        }
      }
      if (err.message && err.message.includes('collection not exists')) {
        return {
          code: 500,
          message: 'posts 集合不存在，请先在云开发控制台创建 posts 集合'
        }
      }
      if (err.errCode === -502001) {
        return {
          code: 500,
          message: '数据库权限不足，请检查数据库安全规则配置'
        }
      }
      return {
        code: 500,
        message: '获取帖子详情失败: ' + (err.message || '未知错误'),
        error: err.errCode ? `错误码: ${err.errCode}` : undefined
      }
    }
  }

  // 发布帖子
  if (action === 'publishPost') {
    const { title, content, authorName } = event
    const images = normalizeMediaIds(event.images, 9)
    const videos = normalizeMediaIds(event.videos, 2)
    const titleTrim = (title || '').trim()
    const contentTrim = (content || '').trim()
    if (!titleTrim) {
      return { code: 400, message: '请输入标题' }
    }
    if (!contentTrim && images.length === 0 && videos.length === 0) {
      return { code: 400, message: '请输入内容或添加图片/视频' }
    }
    try {
      const result = await db.collection('posts').add({
        data: {
          title: titleTrim,
          content: contentTrim,
          images,
          videos,
          authorId: wxContext.OPENID,
          authorName,
          authorAvatar: '',
          replyCount: 0,
          viewCount: 0,
          likeCount: 0,
          pinned: false,
          createdAt: new Date().toISOString()
        }
      })
      return {
        code: 200,
        data: {
          id: result._id,
          title: titleTrim,
          content: contentTrim,
          images,
          videos,
          authorName,
          createdAt: new Date().toISOString(),
          createTime: new Date().toISOString()
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '发布帖子失败'
      }
    }
  }

  // 发布回复
  if (action === 'publishReply') {
    const { postId, content, authorName } = event
    const images = normalizeMediaIds(event.images, 6)
    const videos = normalizeMediaIds(event.videos, 2)
    const contentTrim = (content || '').trim()
    if (!contentTrim && images.length === 0 && videos.length === 0) {
      return { code: 400, message: '请输入回复或添加图片/视频' }
    }
    try {
      // 添加回复
      const replyResult = await db.collection('replies').add({
        data: {
          postId,
          authorName,
          content: contentTrim,
          images,
          videos,
          createdAt: new Date().toISOString()
        }
      })

      // 更新帖子回复数
      await db.collection('posts')
        .doc(postId)
        .update({
          data: {
            replyCount: db.command.inc(1)
          }
        })

      return {
        code: 200,
        data: {
          id: replyResult._id,
          postId,
          authorName,
          content: contentTrim,
          images,
          videos,
          createdAt: new Date().toISOString(),
          createTime: new Date().toISOString()
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '发布回复失败'
      }
    }
  }

  // 点赞帖子
  if (action === 'likePost') {
    const { postId } = event
    const userId = wxContext.OPENID
    if (!postId) return { code: 400, message: '缺少 postId' }
    try {
      const exist = await db.collection('post_likes').where({ postId, userId }).get()
      if (exist.data.length > 0) return { code: 200, data: { liked: true } }
      await db.collection('post_likes').add({ data: { postId, userId } })
      const post = await db.collection('posts').doc(postId).get()
      const likeCount = ((post.data && post.data.likeCount) || 0) + 1
      await db.collection('posts').doc(postId).update({ data: { likeCount } })
      return { code: 200, data: { liked: true, likeCount } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '点赞失败' }
    }
  }

  // 取消点赞
  if (action === 'unlikePost') {
    const { postId } = event
    const userId = wxContext.OPENID
    if (!postId) return { code: 400, message: '缺少 postId' }
    try {
      const list = await db.collection('post_likes').where({ postId, userId }).get()
      if (list.data.length > 0) {
        await db.collection('post_likes').doc(list.data[0]._id).remove()
        const post = await db.collection('posts').doc(postId).get()
        const likeCount = Math.max(0, ((post.data && post.data.likeCount) || 1) - 1)
        await db.collection('posts').doc(postId).update({ data: { likeCount } })
      }
      return { code: 200, data: { liked: false } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '取消点赞失败' }
    }
  }

  // 收藏帖子
  if (action === 'favoritePost') {
    const { postId } = event
    const userId = wxContext.OPENID
    if (!postId) return { code: 400, message: '缺少 postId' }
    try {
      const exist = await db.collection('post_favorites').where({ postId, userId }).get()
      if (exist.data.length > 0) return { code: 200, data: { favorited: true } }
      await db.collection('post_favorites').add({
        data: { postId, userId, createdAt: new Date().toISOString() }
      })
      return { code: 200, data: { favorited: true } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '收藏失败' }
    }
  }

  // 取消收藏
  if (action === 'unfavoritePost') {
    const { postId } = event
    const userId = wxContext.OPENID
    if (!postId) return { code: 400, message: '缺少 postId' }
    try {
      const list = await db.collection('post_favorites').where({ postId, userId }).get()
      if (list.data.length > 0) await db.collection('post_favorites').doc(list.data[0]._id).remove()
      return { code: 200, data: { favorited: false } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '取消收藏失败' }
    }
  }

  // 获取我的收藏帖子
  if (action === 'getMyFavoritePosts') {
    const userId = wxContext.OPENID
    try {
      const favs = await db.collection('post_favorites').where({ userId }).orderBy('createdAt', 'desc').get()
      if (favs.data.length === 0) return { code: 200, data: [] }
      const postIds = favs.data.map((f) => f.postId)
      const posts = await db.collection('posts').where({ _id: db.command.in(postIds) }).get()
      const map = {}
      posts.data.forEach((p) => { map[p._id] = p })
      const list = postIds.map((id) => map[id]).filter(Boolean)
      return {
        code: 200,
        data: list.map((p) => ({ ...p, id: p._id, createTime: p.createdAt }))
      }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '获取收藏列表失败' }
    }
  }

  // 获取我的帖子
  if (action === 'getMyPosts') {
    const openid = wxContext.OPENID
    try {
      const result = await db.collection('posts')
        .where({
          authorId: openid
        })
        .orderBy('createdAt', 'desc')
        .get()

      // 格式化数据，添加 id 和 createTime 字段
      const formatPost = (post) => ({
        ...post,
        id: post._id,
        createTime: post.createdAt
      })

      return {
        code: 200,
        data: result.data.map(formatPost)
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '获取我的帖子失败'
      }
    }
  }

  return {
    code: 400,
    message: '未知的操作'
  }
}
