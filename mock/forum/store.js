/**
 * 论坛 Mock 数据 - 内存 store，仅帖子和回复，支持置顶
 */

let postIdSeed = 100;
let replyIdSeed = 1000;

function getCurrentUserId() {
  try {
    const app = getApp();
    if (app.globalData && app.globalData.userId) return app.globalData.userId;
  } catch (e) {}
  return 'user1';
}

const posts = [
  { id: '1', authorId: '', title: '【公告】社区论坛发帖须知', authorName: '管理员', authorAvatar: '', content: '请文明发言，友善交流。', createTime: '2025-02-20 10:00', replyCount: 28, viewCount: 1200, pinned: true },
  { id: '2', authorId: '', title: '本周活动：晒出你家门口的春天', authorName: '管理员', authorAvatar: '', content: '拍照发帖即可参与抽奖～', createTime: '2025-02-25 09:00', replyCount: 156, viewCount: 3200, pinned: true },
  { id: '3', authorId: 'user1', title: '小区门口新开了一家早餐店，味道不错', authorName: '我', authorAvatar: '', content: '包子豆浆都挺实惠，推荐大家试试。', createTime: '2025-03-01 08:30', replyCount: 12, viewCount: 380, pinned: false },
  { id: '4', authorId: '', title: '有没有一起夜跑的？', authorName: '跑步达人', authorAvatar: '', content: '晚上八点南门集合，跑5公里。', createTime: '2025-03-01 07:15', replyCount: 8, viewCount: 256, pinned: false },
  { id: '5', authorId: '', title: '谁家有多余的儿童推车？', authorName: '新手妈妈', authorAvatar: '', content: '想临时借用两天，可以付押金。', createTime: '2025-02-28 14:20', replyCount: 5, viewCount: 120, pinned: false },
  { id: '6', authorId: '', title: '周末团购草莓，有人拼单吗', authorName: '团购小能手', authorAvatar: '', content: '郊区直送，一箱 3 斤 30 元。', createTime: '2025-02-28 12:00', replyCount: 23, viewCount: 450, pinned: false },
];

const replies = [
  { id: '1', postId: '1', authorName: '路人甲', content: '已读，遵守。', createTime: '2025-02-20 11:00' },
  { id: '2', postId: '1', authorName: '路人乙', content: '支持！', createTime: '2025-02-20 12:30' },
  { id: '3', postId: '3', authorName: '邻居A', content: '在哪条路？明天去尝尝。', createTime: '2025-03-01 09:00' },
  { id: '4', postId: '3', authorName: '吃货小明', content: '南门往东 100 米，红色招牌。', createTime: '2025-03-01 09:15' },
];

function getPosts() {
  const pinned = posts.filter((p) => p.pinned);
  const normal = posts.filter((p) => !p.pinned).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
  return { pinned, list: normal };
}

function getPostDetail(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return null;
  const postReplies = replies.filter((r) => r.postId === postId);
  return { ...post, replies: postReplies };
}

function getMyPosts(userId) {
  const uid = userId || getCurrentUserId();
  return posts.filter((p) => p.authorId === uid).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
}

function addPost({ title, content, authorName = '热心网友', authorId }) {
  const id = String(++postIdSeed);
  const createTime = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  const newPost = { id, authorId: authorId || getCurrentUserId(), title, content, authorName, authorAvatar: '', createTime, replyCount: 0, viewCount: 0, pinned: false };
  posts.push(newPost);
  return newPost;
}

function addReply(postId, { content, authorName = '热心网友' }) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return null;
  const id = String(++replyIdSeed);
  const createTime = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
  const newReply = { id, postId, authorName, content, createTime };
  replies.push(newReply);
  post.replyCount += 1;
  return newReply;
}

export default {
  getPosts,
  getPostDetail,
  getMyPosts,
  addPost,
  addReply,
};
