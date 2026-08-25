function list(value) {
  return Array.isArray(value) ? value : [];
}

function buildForumPostEditPayload(params) {
  return {
    title: String(params.title || '').trim(),
    content: String(params.content || '').trim(),
    images: list(params.mediaImages),
    videos: list(params.mediaVideos),
    attachments: list(params.attachments).map((item) => ({ mediaAssetId: item.mediaAssetId })),
  };
}

module.exports = { buildForumPostEditPayload };
