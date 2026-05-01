/** 论坛帖子列表：图/视频槽位（最多 3 格，优先图片，未满则展示首个视频） */

function buildListMediaSlots(images, videos) {
  const slots = [];
  for (let i = 0; i < images.length && slots.length < 3; i += 1) {
    slots.push({ type: 'image', url: images[i] });
  }
  if (videos.length > 0 && slots.length < 3) {
    slots.push({ type: 'video', url: videos[0] });
  }
  const imageInSlots = slots.filter((s) => s.type === 'image').length;
  const moreCount =
    Math.max(0, images.length - imageInSlots) +
    Math.max(0, videos.length - (slots.some((s) => s.type === 'video') ? 1 : 0));
  const listMediaMoreLabel = moreCount > 0 ? (moreCount > 9 ? '9+' : `+${moreCount}`) : '';
  return { slots, listMediaMoreLabel };
}

export function normalizeForumListPost(p) {
  if (!p) return p;
  const images = Array.isArray(p.images) ? p.images : [];
  const videos = Array.isArray(p.videos) ? p.videos : [];
  const { slots, listMediaMoreLabel } = buildListMediaSlots(images, videos);
  return {
    ...p,
    images,
    videos,
    listMediaSlots: slots,
    listMediaMoreLabel,
  };
}

/** 是否含图/视频（用于关闭虚拟列表等） */
export function forumListPostHasMedia(p) {
  if (!p) return false;
  const images = Array.isArray(p.images) ? p.images : [];
  const videos = Array.isArray(p.videos) ? p.videos : [];
  return images.length > 0 || videos.length > 0;
}
