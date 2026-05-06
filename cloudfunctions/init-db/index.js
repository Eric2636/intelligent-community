// 云函数入口文件 - 测试数据库连接
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const DEFAULT_MODULE_TABS = [
  { key: 'task', label: '业主互助', icon: 'file-copy', enabled: true, always: false, order: 1 },
  { key: 'errand', label: '小区跑腿', icon: 'service', enabled: false, always: false, order: 2 },
  { key: 'forum', label: '小区留言', icon: 'chat', enabled: true, always: false, order: 3 },
  { key: 'mall', label: '小区市场', icon: 'cart', enabled: true, always: false, order: 4 },
  { key: 'my', label: '我的', icon: 'user', enabled: true, always: true, order: 5 },
]

async function resetModuleEntryTabs(inputTabs) {
  const tabs = Array.isArray(inputTabs) && inputTabs.length ? inputTabs : DEFAULT_MODULE_TABS
  const now = new Date().toISOString()

  // 清理旧的 tab 列表文档，避免保留历史脏数据
  const old = await db.collection('app_settings').where({ kind: 'tab' }).limit(100).get()
  const oldList = (old && Array.isArray(old.data)) ? old.data : []
  if (oldList.length) {
    await Promise.all(oldList.map((d) => db.collection('app_settings').doc(d._id).remove()))
  }

  const tasks = tabs.map((t, idx) => {
    const key = t && t.key
    if (!key) return null
    return db.collection('app_settings').doc(`tab_${key}`).set({
      data: {
        kind: 'tab',
        order: typeof t.order === 'number' ? t.order : idx + 1,
        key: t.key,
        icon: t.icon || '',
        enabled: t.enabled !== false,
        always: t.always === true,
        labelEnc: t.labelEnc,
        // 兼容：如果传了 label 明文也会写入（不推荐）
        label: t.label,
        updatedAt: now,
      },
    })
  }).filter(Boolean)
  await Promise.all(tasks)
  return tasks.length
}

async function resetAppSettingsCollection(options = {}) {
  const keepAdminAuth = options.keepAdminAuth !== false
  const keepIds = new Set(keepAdminAuth ? ['admin_auth'] : [])
  const pageSize = 100
  let offset = 0
  const allDocs = []

  // 分页读取，避免一次 limit 太小漏掉历史脏数据
  // 注意：该集合通常规模很小，skip 在这里可接受
  while (true) {
    const res = await db.collection('app_settings').skip(offset).limit(pageSize).get()
    const list = (res && Array.isArray(res.data)) ? res.data : []
    if (!list.length) break
    allDocs.push(...list)
    if (list.length < pageSize) break
    offset += pageSize
  }

  const removeTasks = allDocs
    .filter((d) => d && d._id && !keepIds.has(d._id))
    .map((d) => db.collection('app_settings').doc(d._id).remove())
  if (removeTasks.length) {
    await Promise.all(removeTasks)
  }

  const tabsCount = await resetModuleEntryTabs()
  return {
    removedCount: removeTasks.length,
    tabsCount,
    keptIds: Array.from(keepIds).filter((id) => allDocs.some((d) => d && d._id === id)),
  }
}

exports.main = async (event, context) => {
  try {
    const { action } = event || {}

    // 写入管理后台账号（app_settings/admin_auth，与云函数 admin 读取方式一致；生产环境建议改用云函数环境变量）
    if (action === 'initAdminAuth') {
      const { username, password } = event || {}
      if (!username || !password) {
        return { code: 400, message: '缺少 username 或 password' }
      }
      try {
        await db.collection('app_settings').doc('admin_auth').set({
          data: {
            username: String(username),
            password: String(password),
            updatedAt: new Date().toISOString(),
          },
        })
        return { code: 200, message: 'admin_auth 已写入，请尽快修改默认密码并优先使用环境变量 ADMIN_USERNAME / ADMIN_PASSWORD' }
      } catch (err) {
        console.error('initAdminAuth 失败:', err)
        return { code: 500, message: '写入 admin_auth 失败', error: err.message }
      }
    }

    // 初始化 app_settings tab 列表文档（用于底部 Tab 入口配置）
    if (action === 'initModuleEntryTabs') {
      try {
        const { tabs } = event || {}
        const count = await resetModuleEntryTabs(tabs)
        return { code: 200, message: 'tab 列表初始化成功（已覆盖为当前模块）', data: { tabsCount: count } }
      } catch (err) {
        console.error('tab 列表初始化失败:', err)
        return { code: 500, message: 'tab 列表初始化失败', error: err.message }
      }
    }

    // 重置 app_settings（清理历史配置并按当前模块重建）
    if (action === 'resetAppSettings') {
      try {
        const keepAdminAuth = !(event && event.keepAdminAuth === false)
        const data = await resetAppSettingsCollection({ keepAdminAuth })
        return {
          code: 200,
          message: 'app_settings 重置成功',
          data: {
            ...data,
            moduleKeys: DEFAULT_MODULE_TABS.map((t) => t.key),
          },
        }
      } catch (err) {
        console.error('重置 app_settings 失败:', err)
        return { code: 500, message: '重置 app_settings 失败', error: err.message }
      }
    }

    const collections = [
      'tasks',
      'posts',
      'replies',
      'post_likes',
      'post_favorites',
      'errand_posts',
      'errand_replies',
      'errand_likes',
      'errand_favorites',
      'items',
      'orders',
      'users',
      'notifications',
      'feedbacks',
      'item_favorites',
      'task_ratings'
    ]

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

    // 普通“数据库初始化”也同步重置 tab，保证 app_settings 与当前模块一致
    let tabInit = { success: true, tabsCount: 0 }
    try {
      const count = await resetModuleEntryTabs()
      tabInit = { success: true, tabsCount: count }
    } catch (err) {
      tabInit = { success: false, tabsCount: 0, error: err.message }
      console.error('自动重置 tab 配置失败:', err.message)
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length
    const hasError = failedCount > 0 || !tabInit.success

    return {
      code: hasError ? 206 : 200,
      message: hasError ? '部分初始化未完成，请查看详情' : '初始化成功（含模块 tab 配置重置）',
      data: {
        total: collections.length,
        success: successCount,
        failed: failedCount,
        results,
        tabInit,
      },
      guide: hasError ? {
        action: '请在云开发控制台手动创建缺失集合后重试',
        missingCollections: [
          ...results.filter(r => !r.success).map(r => r.collection),
          ...(!tabInit.success ? ['app_settings'] : []),
        ],
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
