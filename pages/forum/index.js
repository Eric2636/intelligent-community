import { getPostList } from '~/mock/forum/api';

Page({
  data: {
    pinned: [],
    list: [],
    loading: true,
  },

  onLoad() {
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  async loadPosts() {
    this.setData({ loading: true });
    const res = await getPostList();
    if (res.code === 200 && res.data) {
      this.setData({
        pinned: res.data.pinned || [],
        list: res.data.list || [],
        loading: false,
      });
    }
  },

  goPost(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${id}`,
    });
  },

  goPublish() {
    wx.navigateTo({
      url: '/packageForum/publish/index',
    });
  },
});
