/**
 * 商城 Mock 数据 - 简单分类（日用品等）+ 信息列表，58 同城风格
 */

const categories = [
  { id: 'all', name: '全部' },
  { id: 'daily', name: '日用品' },
  { id: 'second', name: '二手闲置' },
  { id: 'wanted', name: '求购' },
];

let itemIdSeed = 100;

function getCurrentUserId() {
  try {
    const app = getApp();
    if (app.globalData && app.globalData.userId) return app.globalData.userId;
  } catch (e) {}
  return 'user1';
}

const items = [
  { id: '1', publisherId: '', categoryId: 'daily', title: '全新收纳箱 3 个装', price: '25', unit: '元', images: [], desc: '搬家多买的，未拆封。', createTime: '2025-03-01 10:30', contact: '张女士' },
  { id: '2', publisherId: '', categoryId: 'daily', title: '宜家小推车 九成新', price: '80', unit: '元', images: [], desc: '用了半年，很结实。', createTime: '2025-03-01 09:15', contact: '李先生' },
  { id: '3', publisherId: 'user1', categoryId: 'second', title: '儿童自行车 16 寸', price: '150', unit: '元', images: [], desc: '孩子长高了换大车，功能完好。', createTime: '2025-02-28 16:00', contact: '王女士' },
  { id: '4', publisherId: '', categoryId: 'second', title: '书桌+椅子 自提', price: '120', unit: '元', images: [], desc: '实木书桌，桌面有轻微使用痕迹。', createTime: '2025-02-28 14:20', contact: '刘先生' },
  { id: '5', publisherId: '', categoryId: 'wanted', title: '求购二手婴儿床', price: '', unit: '', images: [], desc: '希望无漆实木，预算 200 以内。', createTime: '2025-02-28 11:00', contact: '陈女士' },
  { id: '6', publisherId: '', categoryId: 'daily', title: '洗衣液 2 瓶 未开封', price: '30', unit: '元', images: [], desc: '买多了转，同城自提。', createTime: '2025-02-27 20:00', contact: '赵女士' },
];

function getCategories() {
  return categories;
}

function getItemList(categoryId) {
  let list = items;
  if (categoryId && categoryId !== 'all') {
    list = items.filter((i) => i.categoryId === categoryId);
  }
  return [...list].sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
}

function getItemDetail(id) {
  return items.find((i) => i.id === id) || null;
}

function getMyItems(userId) {
  const uid = userId || getCurrentUserId();
  return items.filter((i) => i.publisherId === uid).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
}

function addItem({ categoryId, title, price, unit, desc, contact, publisherId }) {
  const id = String(++itemIdSeed);
  const createTime = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  const newItem = { id, publisherId: publisherId || getCurrentUserId(), categoryId, title, price: price || '', unit: unit || '元', images: [], desc: desc || '', createTime, contact: contact || '保密' };
  items.push(newItem);
  return newItem;
}

export default {
  getCategories,
  getItemList,
  getItemDetail,
  getMyItems,
  addItem,
};
