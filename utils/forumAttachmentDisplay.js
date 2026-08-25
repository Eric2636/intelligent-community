function readableFileSize(sizeBytes) {
  const bytes = Math.max(0, Number(sizeBytes) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
}

function forumAttachmentDisplayMeta(attachment) {
  const filename = String(attachment && attachment.name || '').trim();
  const separator = filename.lastIndexOf('.');
  const formatLabel = separator >= 0 && separator < filename.length - 1
    ? filename.slice(separator + 1).toUpperCase()
    : '文件';
  const sizeLabel = readableFileSize(attachment && attachment.sizeBytes);
  return { formatLabel, sizeLabel, secondaryText: `${formatLabel} · ${sizeLabel}` };
}

module.exports = { forumAttachmentDisplayMeta, readableFileSize };
