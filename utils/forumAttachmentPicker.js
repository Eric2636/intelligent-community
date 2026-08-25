const FORUM_ATTACHMENT_MIME_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
});

function inferForumAttachmentMimeType(filename) {
  const normalized = String(filename || '').trim();
  const separator = normalized.lastIndexOf('.');
  const extension = separator >= 0 ? normalized.slice(separator + 1).toLowerCase() : '';
  const contentType = FORUM_ATTACHMENT_MIME_TYPES[extension];
  if (!contentType) throw new Error('不支持该附件格式');
  return contentType;
}

async function runForumAttachmentPicker({ wxApi = wx, hash, check, upload }) {
  if (!this.data.canManageForumPosts || this.data.attachmentUploading) return;
  const remain = 5 - this.data.attachments.length;
  if (remain <= 0) { wxApi.showToast({ title: '每篇帖子最多5个附件', icon: 'none' }); return; }
  if (typeof wxApi.chooseMessageFile !== 'function') {
    wxApi.showToast({ title: '当前微信版本不支持选择附件', icon: 'none' });
    return;
  }
  this.setData({ attachmentUploading: true, attachmentStage: 'selecting' });
  try {
    const { tempFiles = [] } = await new Promise((resolve, reject) => wxApi.chooseMessageFile({
      count: remain,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
      success: resolve,
      fail: reject,
    }));
    if (!tempFiles.length) { wxApi.showToast({ title: '未选择任何附件', icon: 'none' }); return; }
    for (const file of tempFiles) {
      if (Number(file.size) > 20 * 1024 * 1024) throw new Error('单个附件不能超过20MB');
      const filename = file.name || String(file.path || '').split('/').pop() || '附件';
      const contentType = inferForumAttachmentMimeType(filename);
      this.setData({ attachmentStage: 'hashing' });
      const sha256 = await hash(file.path);
      this.setData({ attachmentStage: 'checking' });
      const checked = await check({ sha256, filename, contentType, sizeBytes: Number(file.size) });
      const payload = checked && checked.data ? checked.data : checked;
      if (!payload?.exists) this.setData({ attachmentStage: 'uploading' });
      const uploaded = payload?.exists ? payload : await upload(file.path, { sha256, filename, contentType, sizeBytes: Number(file.size) });
      const attachment = { mediaAssetId: uploaded.mediaAssetId || uploaded.id, name: uploaded.name || filename, sizeBytes: uploaded.sizeBytes || file.size, contentType: uploaded.contentType || contentType };
      this.setData({ attachments: this.data.attachments.concat(attachment) });
    }
  } catch (error) {
    const cancelled = /cancel/i.test(String(error?.errMsg || error?.message || ''));
    wxApi.showToast({ title: cancelled ? '已取消选择文件' : (error?.message || '附件上传失败'), icon: 'none' });
  } finally {
    this.setData({ attachmentUploading: false, attachmentStage: '' });
  }
}

module.exports = { inferForumAttachmentMimeType, runForumAttachmentPicker };
