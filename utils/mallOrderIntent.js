const MALL_ORDER_INTENT_STORAGE_KEY = 'mall_order_pending_intent_v1';
let volatilePendingIntents = [];
let requestSequence = 0;

function normalizeOrderIntent(data = {}) {
  const itemId = String(data.itemId || '').trim();
  const buyerContact =
    data.buyerContact === undefined ? '' : String(data.buyerContact).trim();
  return {
    itemId,
    ...(buyerContact ? { buyerContact } : {}),
  };
}

function intentFingerprint(data) {
  return JSON.stringify([
    data.itemId,
    data.buyerContact || '',
  ]);
}

function isValidPendingIntent(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.fingerprint === 'string' &&
      typeof value.clientRequestId === 'string' &&
      /^[A-Za-z0-9_-]{16,64}$/.test(value.clientRequestId),
  );
}

export function createMallOrderClientRequestId(
  now = () => Date.now(),
  random = () => Math.random(),
) {
  requestSequence = (requestSequence + 1) % 1679616;
  const entropy = Math.floor(random() * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .slice(0, 12)
    .padEnd(12, '0');
  const timestamp = now().toString(36).padStart(10, '0');
  const sequence = requestSequence.toString(36).padStart(4, '0');
  return `mall_${timestamp}_${sequence}_${entropy}`;
}

function normalizePendingIntents(value) {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(isValidPendingIntent).slice(-20);
}

function readPendingIntents(storage) {
  try {
    const stored = storage.getStorageSync(MALL_ORDER_INTENT_STORAGE_KEY);
    const persisted = normalizePendingIntents(stored);
    if (persisted.length) return persisted;
    return normalizePendingIntents(volatilePendingIntents);
  } catch (e) {
    return normalizePendingIntents(volatilePendingIntents);
  }
}

function writePendingIntents(storage, intents) {
  volatilePendingIntents = normalizePendingIntents(intents);
  try {
    storage.setStorageSync(MALL_ORDER_INTENT_STORAGE_KEY, volatilePendingIntents);
  } catch (e) {
    // 内存兜底仍可保证当前进程内双击和网络重试复用同一幂等键。
  }
}

function clearPendingIntent(storage, clientRequestId) {
  const current = readPendingIntents(storage);
  const retained = current.filter((entry) => entry.clientRequestId !== clientRequestId);
  if (retained.length === current.length) return;
  volatilePendingIntents = retained;
  try {
    if (retained.length) {
      storage.setStorageSync(MALL_ORDER_INTENT_STORAGE_KEY, retained);
    } else {
      storage.removeStorageSync(MALL_ORDER_INTENT_STORAGE_KEY);
    }
  } catch (e) {
    // ignore
  }
}

export function createMallOrderWithIdempotency(
  data,
  send,
  storage = wx,
) {
  const normalized = normalizeOrderIntent(data);
  const fingerprint = intentFingerprint(normalized);
  const stored = readPendingIntents(storage);
  const matching = stored.find((entry) => entry.fingerprint === fingerprint);
  const pending = matching || {
    fingerprint,
    clientRequestId: createMallOrderClientRequestId(),
  };
  if (!matching) writePendingIntents(storage, [...stored, pending]);

  const payload = {
    ...normalized,
    clientRequestId: pending.clientRequestId,
  };
  return Promise.resolve()
    .then(() => send(payload))
    .then((response) => {
      if (response && response.code === 200) {
        clearPendingIntent(storage, pending.clientRequestId);
      }
      return response;
    });
}
