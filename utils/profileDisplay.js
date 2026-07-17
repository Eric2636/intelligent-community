const DEFAULT_BRIEF = '这个人很懒, 什么都没有写';

function text(value) {
  return String(value || '').trim();
}

export function defaultPhoneUserName(phoneNumber) {
  const phone = text(phoneNumber);
  return phone.length >= 4 ? `用户${phone.slice(-4)}` : '用户';
}

export function resolveProfileName(user = {}) {
  const name = text(user.name);
  return name && name !== '微信用户' ? name : defaultPhoneUserName(user.phoneNumber || user.phone);
}

export function buildProfileDisplay(user = {}) {
  const avatar = text(user.avatar || user.avatarUrl || user.image);
  const displayName = resolveProfileName(user);
  const displayBrief = text(user.brief || user.introduction) || DEFAULT_BRIEF;

  return { displayName, displayBrief, displayAvatar: avatar };
}
