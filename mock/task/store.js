/**
 * 任务模块 Mock - 状态：待领取、进行中、待确认、已完成、已取消
 * 当前用户 mock 为 user1，用于区分我发布的/我领取的
 */

const STATUS = {
  PENDING_TAKE: 'pending_take',   // 待领取
  IN_PROGRESS: 'in_progress',     // 进行中
  PENDING_CONFIRM: 'pending_confirm', // 待确认
  COMPLETED: 'completed',         // 已完成
  CANCELLED: 'cancelled',         // 已取消
};

let taskIdSeed = 100;

const tasks = [
  { id: '1', title: '帮忙取快递', desc: '3 个件，在菜鸟驿站。', reward: '5', location: '小区南门', status: STATUS.PENDING_TAKE, publisherId: 'user2', publisherName: '李阿姨', takerId: '', takerName: '', proofText: '', proofImages: [], createdAt: '2025-03-01 09:00', claimedAt: '', completedAt: '', confirmedAt: '' },
  { id: '2', title: '上门换灯泡', desc: '客厅吸顶灯，自备灯泡。', reward: '20', location: '3 栋 2 单元 501', status: STATUS.IN_PROGRESS, publisherId: 'user2', publisherName: '王先生', takerId: 'user1', takerName: '我', proofText: '', proofImages: [], createdAt: '2025-02-28 14:00', claimedAt: '2025-03-01 08:00', completedAt: '', confirmedAt: '' },
  { id: '3', title: '代买蔬菜', desc: '清单发微信，送到家门口。', reward: '10', location: '1 栋 101', status: STATUS.PENDING_CONFIRM, publisherId: 'user1', publisherName: '我', takerId: 'user2', takerName: '张师傅', proofText: '已送到，放门口了', proofImages: [], createdAt: '2025-02-27 10:00', claimedAt: '2025-02-27 11:00', completedAt: '2025-03-01 12:00', confirmedAt: '' },
  { id: '4', title: '临时看护宠物', desc: '出差两天，猫咪在家。', reward: '50', location: '2 栋 302', status: STATUS.COMPLETED, publisherId: 'user2', publisherName: '赵女士', takerId: 'user1', takerName: '我', proofText: '猫咪状态良好', proofImages: [], createdAt: '2025-02-25 09:00', claimedAt: '2025-02-25 10:00', completedAt: '2025-02-27 18:00', confirmedAt: '2025-02-27 19:00' },
];

function getCurrentUserId() {
  try {
    const app = getApp();
    if (app.globalData && app.globalData.userId) return app.globalData.userId;
  } catch (e) {}
  return 'user1';
}

function getTaskList() {
  return tasks.filter((t) => t.status === STATUS.PENDING_TAKE).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getTaskDetail(id) {
  return tasks.find((t) => t.id === id) || null;
}

function getMyPublished() {
  const uid = getCurrentUserId();
  return tasks.filter((t) => t.publisherId === uid && t.status !== STATUS.CANCELLED).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getMyTaken() {
  const uid = getCurrentUserId();
  return tasks.filter((t) => t.takerId === uid).sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));
}

function createTask({ title, desc, reward, location, publisherName }) {
  const id = String(++taskIdSeed);
  const createdAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  const task = { id, title, desc, reward: String(reward), location, status: STATUS.PENDING_TAKE, publisherId: getCurrentUserId(), publisherName: publisherName || '我', takerId: '', takerName: '', proofText: '', proofImages: [], createdAt, claimedAt: '', completedAt: '', confirmedAt: '' };
  tasks.push(task);
  return task;
}

function claimTask(id, takerName) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.status !== STATUS.PENDING_TAKE) return null;
  task.status = STATUS.IN_PROGRESS;
  task.takerId = getCurrentUserId();
  task.takerName = takerName || '接单用户';
  task.claimedAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  return task;
}

function submitComplete(id, proofText, proofImages = []) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.status !== STATUS.IN_PROGRESS) return null;
  task.status = STATUS.PENDING_CONFIRM;
  task.proofText = proofText || '';
  task.proofImages = proofImages;
  task.completedAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  return task;
}

function confirmComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.status !== STATUS.PENDING_CONFIRM) return null;
  task.status = STATUS.COMPLETED;
  task.confirmedAt = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  return task;
}

function cancelTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  if (task.status !== STATUS.PENDING_TAKE && task.status !== STATUS.IN_PROGRESS) return null;
  task.status = STATUS.CANCELLED;
  return task;
}

export default {
  STATUS,
  getTaskList,
  getTaskDetail,
  getMyPublished,
  getMyTaken,
  createTask,
  claimTask,
  submitComplete,
  confirmComplete,
  cancelTask,
  getCurrentUserId,
};
