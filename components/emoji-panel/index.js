const DEFAULT_EMOJIS = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '😍', '😘',
  '😎', '🥳', '😅', '😭', '😡', '😴', '🤔', '😳',
  '👍', '👎', '👏', '🙏', '💪', '👌', '🤝', '🙌',
  '❤️', '💔', '🔥', '🌹', '🎉', '⭐', '✅', '💯',
  '🍎', '🍵', '☕', '🍚', '🍜', '🍰', '🎁', '🚗',
];

Component({
  properties: {
    emojis: {
      type: Array,
      value: DEFAULT_EMOJIS,
    },
  },

  methods: {
    onEmojiTap(e) {
      const emoji = String((e.currentTarget.dataset && e.currentTarget.dataset.emoji) || '');
      if (!emoji) return;
      this.triggerEvent('select', { emoji });
    },
  },
});
