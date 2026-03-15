import { forumAPI } from '~/api/cloud';

Page({
  data: {
    postList: [],
    loading: true,
  },

  onLoad() {
    this.loadPosts();
  },

  onShow() {
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  async loadPosts() {
    this.setData({ loading: true });
    const res = await forumAPI.getMyPosts();
    if (res.code === 200) {
      this.setData({ postList: res.data || [], loading: false });
    }
  },

  goPost(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/packageForum/post/index?postId=${id}`,
    });
  },
});
