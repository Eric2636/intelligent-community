// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  // 获取商品列表（支持分类、关键词搜索、排序：time=时间, price_asc/price_desc=价格）
  if (action === 'getItems') {
    const { categoryId, keyword, orderBy = 'time' } = event
    try {
      const _ = db.command
      const conditions = []
      if (categoryId && categoryId !== 'all') {
        conditions.push({ categoryId })
      }
      if (keyword && keyword.trim()) {
        const reg = db.RegExp({ regexp: keyword.trim(), options: 'i' })
        conditions.push(_.or([{ title: reg }, { desc: reg }]))
      }
      let query = conditions.length
        ? db.collection('items').where(_.and(conditions))
        : db.collection('items')

      if (orderBy === 'price_asc') {
        query = query.orderBy('price', 'asc').orderBy('createdAt', 'desc')
      } else if (orderBy === 'price_desc') {
        query = query.orderBy('price', 'desc').orderBy('createdAt', 'desc')
      } else {
        query = query.orderBy('createdAt', 'desc')
      }
      const result = await query.get()

      return {
        code: 200,
        data: result.data
      }
    } catch (err) {
      console.error('获取商品列表失败:', err)
      // 如果集合不存在，返回空数组
      if (err.message && err.message.includes('collection not exists')) {
        return {
          code: 200,
          data: [],
          message: '商品集合尚未创建，请先发布商品'
        }
      }
      return {
        code: 500,
        message: '获取商品列表失败'
      }
    }
  }

  // 获取商品详情（含是否已收藏）
  if (action === 'getItemDetail') {
    const { itemId } = event
    try {
      const result = await db.collection('items').doc(itemId).get()
      if (!result.data) return { code: 404, message: '商品不存在' }
      let isFavorited = false
      try {
        const fav = await db.collection('item_favorites').where({ itemId, userId: wxContext.OPENID }).count()
        isFavorited = (fav.total || 0) > 0
      } catch (_) {}
      return {
        code: 200,
        data: { ...result.data, isFavorited }
      }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '获取商品详情失败' }
    }
  }

  // 收藏商品
  if (action === 'favoriteItem') {
    const { itemId } = event
    const userId = wxContext.OPENID
    if (!itemId) return { code: 400, message: '缺少 itemId' }
    try {
      const exist = await db.collection('item_favorites').where({ itemId, userId }).get()
      if (exist.data.length > 0) return { code: 200, data: { favorited: true } }
      await db.collection('item_favorites').add({
        data: { itemId, userId, createdAt: new Date().toISOString() }
      })
      return { code: 200, data: { favorited: true } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '收藏失败' }
    }
  }

  // 取消收藏商品
  if (action === 'unfavoriteItem') {
    const { itemId } = event
    const userId = wxContext.OPENID
    if (!itemId) return { code: 400, message: '缺少 itemId' }
    try {
      const list = await db.collection('item_favorites').where({ itemId, userId }).get()
      if (list.data.length > 0) await db.collection('item_favorites').doc(list.data[0]._id).remove()
      return { code: 200, data: { favorited: false } }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '取消收藏失败' }
    }
  }

  // 获取我收藏的商品
  if (action === 'getMyFavoriteItems') {
    const userId = wxContext.OPENID
    try {
      const favs = await db.collection('item_favorites').where({ userId }).orderBy('createdAt', 'desc').get()
      if (favs.data.length === 0) return { code: 200, data: [] }
      const itemIds = favs.data.map((f) => f.itemId)
      const items = await db.collection('items').where({ _id: db.command.in(itemIds) }).get()
      const map = {}
      items.data.forEach((i) => { map[i._id] = i })
      const list = itemIds.map((id) => map[id]).filter(Boolean)
      return { code: 200, data: list }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '获取收藏列表失败' }
    }
  }

  // 发布商品
  if (action === 'publishItem') {
    const { categoryId, title, price, unit, desc, contact } = event
    try {
      const result = await db.collection('items').add({
        data: {
          categoryId,
          title,
          price: price || '',
          unit: unit || '元',
          desc,
          contact,
          images: [],
          publisherId: wxContext.OPENID,
          createdAt: new Date().toISOString()
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
        message: '发布商品失败'
      }
    }
  }

  // 获取我的商品
  if (action === 'getMyItems') {
    const openid = wxContext.OPENID
    try {
      const result = await db.collection('items')
        .where({
          publisherId: openid
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
        message: '获取我的商品失败'
      }
    }
  }

  // 创建订单（购买）
  if (action === 'createOrder') {
    const { itemId, itemTitle, itemPrice, itemUnit, sellerId, contact } = event
    const buyerId = wxContext.OPENID
    if (!itemId || !sellerId) {
      return { code: 400, message: '缺少商品或卖家信息' }
    }
    if (buyerId === sellerId) {
      return { code: 400, message: '不能购买自己发布的商品' }
    }
    try {
      const res = await db.collection('orders').add({
        data: {
          itemId,
          itemTitle: itemTitle || '',
          itemPrice: itemPrice || '',
          itemUnit: itemUnit || '元',
          sellerId,
          buyerId,
          contact: contact || '',
          status: 'pending', // pending=待沟通, completed=已完成, cancelled=已取消
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      })
      return {
        code: 200,
        data: { orderId: res._id }
      }
    } catch (err) {
      console.error(err)
      if (err.message && err.message.includes('collection not exists')) {
        return { code: 500, message: '订单集合不存在，请先在设置中初始化数据库' }
      }
      return { code: 500, message: '创建订单失败' }
    }
  }

  // 获取我的订单（买到的 + 卖出的）
  if (action === 'getMyOrders') {
    const openid = wxContext.OPENID
    try {
      const [buyList, sellList] = await Promise.all([
        db.collection('orders').where({ buyerId: openid }).orderBy('createdAt', 'desc').get(),
        db.collection('orders').where({ sellerId: openid }).orderBy('createdAt', 'desc').get()
      ])
      return {
        code: 200,
        data: {
          buy: buyList.data,
          sell: sellList.data
        }
      }
    } catch (err) {
      console.error(err)
      if (err.message && err.message.includes('collection not exists')) {
        return { code: 200, data: { buy: [], sell: [] } }
      }
      return { code: 500, message: '获取订单失败' }
    }
  }

  // 获取订单详情
  if (action === 'getOrderDetail') {
    const { orderId } = event
    if (!orderId) return { code: 400, message: '缺少订单ID' }
    try {
      const res = await db.collection('orders').doc(orderId).get()
      if (!res.data) return { code: 404, message: '订单不存在' }
      return { code: 200, data: res.data }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '获取订单详情失败' }
    }
  }

  // 更新订单状态（确认完成、取消）
  if (action === 'updateOrderStatus') {
    const { orderId, status } = event
    const openid = wxContext.OPENID
    if (!orderId || !status) return { code: 400, message: '参数不完整' }
    const allow = ['completed', 'cancelled']
    if (!allow.includes(status)) return { code: 400, message: '无效状态' }
    try {
      const order = await db.collection('orders').doc(orderId).get()
      if (!order.data) return { code: 404, message: '订单不存在' }
      const { buyerId, sellerId } = order.data
      const canUpdate = openid === buyerId || openid === sellerId
      if (!canUpdate) return { code: 403, message: '无权限操作' }
      await db.collection('orders').doc(orderId).update({
        data: {
          status,
          updatedAt: new Date().toISOString()
        }
      })
      return { code: 200, data: {} }
    } catch (err) {
      console.error(err)
      return { code: 500, message: '更新失败' }
    }
  }

  return {
    code: 400,
    message: '未知的操作'
  }
}
