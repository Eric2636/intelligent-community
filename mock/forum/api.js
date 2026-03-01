/**
 * 论坛 Mock API - 基于 store 的异步封装
 */
import store from './store';

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export function getPostList() {
  return delay().then(() => ({ code: 200, data: store.getPosts() }));
}

export function getMyPosts() {
  return delay().then(() => {
    const uid = (getApp().globalData && getApp().globalData.userId) || 'user1';
    return { code: 200, data: store.getMyPosts(uid) };
  });
}

export function getPostDetail(postId) {
  return delay().then(() => {
    const data = store.getPostDetail(postId);
    if (!data) return { code: 404, data: null };
    return { code: 200, data };
  });
}

export function publishPost({ title, content, authorName }) {
  return delay().then(() => {
    const uid = (getApp().globalData && getApp().globalData.userId) || 'user1';
    const data = store.addPost({ title, content, authorName: authorName || '我', authorId: uid });
    return { code: 200, data };
  });
}

export function publishReply(postId, { content, authorName }) {
  return delay().then(() => {
    const data = store.addReply(postId, { content, authorName });
    return { code: 200, data };
  });
}
