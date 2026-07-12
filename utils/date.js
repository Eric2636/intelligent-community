function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDateTime(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const isoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
  const localLike = /^\d{4}-\d{2}-\d{2}[ /]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
  if (!isoLike.test(text) && !localLike.test(text)) return null;

  const normalized = localLike.test(text) ? text.replace(/\//g, '-').replace(' ', 'T') : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDateTimeYmdHm(value) {
  const date = parseDateTime(value);
  if (!date) return value == null ? '' : String(value);
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function formatDateTimeFields(value) {
  if (Array.isArray(value)) return value.map(formatDateTimeFields);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? formatDateTimeYmdHm(value) : value;
  }

  return Object.keys(value).reduce((acc, key) => {
    acc[key] = formatDateTimeFields(value[key]);
    return acc;
  }, {});
}
