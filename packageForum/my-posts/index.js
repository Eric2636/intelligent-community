import { getMyPosts } from '~/mock/forum/api';

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {},
  onShow() {
    this.loadList();
  },
  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    const res = await getMyPosts();
    if (res.code === 200) this.setData({ list: res.data || [], loading: false });
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/packageForum/post/index?postId=${id}` });
  },
});
