function rowId(row) {
  if (!row) return '';
  if (row.id != null) return String(row.id);
  if (row._id != null) return String(row._id);
  return '';
}

export function applyListMutation(list, mutation) {
  if (!Array.isArray(list) || !mutation || !mutation.type) return list;
  const id = String(mutation.id || rowId(mutation.data) || '');
  if (!id) return list;
  if (mutation.type === 'remove') {
    const next = list.filter((row) => rowId(row) !== id);
    return next.length === list.length ? list : next;
  }
  const index = list.findIndex((row) => rowId(row) === id);
  if (index < 0 || !mutation.data || typeof mutation.data !== 'object') return list;
  const next = [...list];
  next[index] = mutation.type === 'upsert'
    ? { ...mutation.data, id: mutation.data.id || mutation.data._id || id }
    : { ...list[index], ...mutation.data };
  return next;
}

export function applyMutationToPageLists(page, listKeys, mutation, normalize) {
  if (!page || !page.data || !page.setData) return false;
  const data = mutation && mutation.data && normalize
    ? normalize(mutation.data)
    : mutation && mutation.data;
  const normalized = mutation ? { ...mutation, data } : mutation;
  const updates = {};
  let changed = false;
  (Array.isArray(listKeys) ? listKeys : [listKeys]).forEach((key) => {
    const current = page.data[key];
    if (!Array.isArray(current)) return;
    const next = applyListMutation(current, normalized);
    if (next !== current) {
      updates[key] = next;
      changed = true;
    }
  });
  if (changed) page.setData(updates);
  return changed;
}

export function navigateToWithListMutation(page, url, listKeys, normalize, transform) {
  if (page) page._listMutationHandled = false;
  wx.navigateTo({
    url,
    events: {
      listMutation: (mutation) => {
        if (page) page._listMutationHandled = true;
        const nextMutation = typeof transform === 'function' ? transform(mutation) : mutation;
        applyMutationToPageLists(page, listKeys, nextMutation, normalize);
      },
    },
  });
}

export function emitListMutation(page, mutation) {
  if (!page || typeof page.getOpenerEventChannel !== 'function') return;
  const channel = page.getOpenerEventChannel();
  if (channel && typeof channel.emit === 'function') channel.emit('listMutation', mutation);
}
