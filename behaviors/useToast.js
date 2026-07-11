const useToastBehavior = Behavior({
  methods: {
    onShowToast(_selector, message) {
      wx.showToast({ title: message || '', icon: 'none' });
    },

    onHideToast() {
      wx.hideToast();
    },
  },
});

export default useToastBehavior;
