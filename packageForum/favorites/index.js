import { forumAPI } from '~/api/cloud';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    const res = await forumAPI.getMyFavoritePosts();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
    else this.setData({ loading: false });
  },

  goPost(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageForum/post/index?postId=${id}` });
  },
});
