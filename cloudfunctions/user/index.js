// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  // 获取用户信息
  if (action === 'getUserInfo') {
    try {
      const result = await db.collection('users')
        .where({
          _openid: wxContext.OPENID
        })
        .get()

      if (result.data.length === 0) {
        return {
          code: 200,
          data: null
        }
      }

      return {
        code: 200,
        data: result.data[0]
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '获取用户信息失败'
      }
    }
  }

  // 更新用户信息
  if (action === 'updateUserInfo') {
    const { name, gender, birth, address, introduction, photos } = event
    try {
      // 先检查用户是否存在
      const checkResult = await db.collection('users')
        .where({
          _openid: wxContext.OPENID
        })
        .get()

      let result
      if (checkResult.data.length === 0) {
        // 用户不存在，创建新用户记录
        result = await db.collection('users').add({
          data: {
            _openid: wxContext.OPENID,
            name: name || '用户' + Math.floor(Math.random() * 10000),
            gender: gender !== undefined ? gender : 2,
            birth: birth || '',
            address: address || [],
            introduction: introduction || '',
            photos: photos || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      } else {
        // 用户存在，更新信息
        result = await db.collection('users')
          .where({
            _openid: wxContext.OPENID
          })
          .update({
            data: {
              name,
              gender,
              birth,
              address,
              introduction,
              photos,
              updatedAt: new Date().toISOString()
            }
          })
      }

      return {
        code: 200,
        data: result.stats || result
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '更新用户信息失败'
      }
    }
  }

  // 登录/注册
  if (action === 'login') {
    try {
      // 检查用户是否存在
      const result = await db.collection('users')
        .where({
          _openid: wxContext.OPENID
        })
        .get()

      let userData

      if (result.data.length === 0) {
        // 新用户，创建用户记录
        userData = {
          _openid: wxContext.OPENID,
          name: '用户' + Math.floor(Math.random() * 10000),
          avatar: '',
          gender: 2,
          birth: '',
          address: [],
          brief: '',
          photos: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        await db.collection('users').add({
          data: userData
        })
      } else {
        userData = result.data[0]
      }

      return {
        code: 200,
        data: {
          openid: wxContext.OPENID,
          userInfo: {
            nickName: userData.name,
            avatarUrl: userData.avatar,
            ...userData
          },
          message: '登录成功'
        }
      }
    } catch (err) {
      console.error(err)
      return {
        code: 500,
        message: '登录失败'
      }
    }
  }

  return {
    code: 400,
    message: '未知的操作'
  }
}
