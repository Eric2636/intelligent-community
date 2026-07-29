export const DEFAULT_AVATAR = '/static/avatar1.png';

export function withDefaultAvatar(value) {
  return (typeof value === 'string' && value.trim()) || DEFAULT_AVATAR;
}
