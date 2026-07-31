export const DEFAULT_AVATAR_ICON = 'user';

export function normalizeAvatar(value) {
  return typeof value === 'string' ? value.trim() : '';
}
