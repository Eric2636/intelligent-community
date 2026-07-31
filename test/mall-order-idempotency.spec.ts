import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMallOrderClientRequestId,
  createMallOrderWithIdempotency,
} from '../utils/mallOrderIntent.js';

function memoryStorage() {
  const values = new Map<string, unknown>();
  return {
    getStorageSync(key: string) {
      return values.get(key);
    },
    setStorageSync(key: string, value: unknown) {
      values.set(key, value);
    },
    removeStorageSync(key: string) {
      values.delete(key);
    },
  };
}

test('generated mall order request id is valid and contains no token material', () => {
  const id = createMallOrderClientRequestId(() => 1_721_952_000_000, () => 0.123456789);
  assert.match(id, /^[A-Za-z0-9_-]{16,64}$/);
  assert.doesNotMatch(id, /Bearer|token/i);
  assert.match(createMallOrderClientRequestId(() => 0, () => 0), /^[A-Za-z0-9_-]{16,64}$/);
});

test('double click and failed retry reuse one stable request id until success', async () => {
  const storage = memoryStorage();
  const sent: Array<Record<string, unknown>> = [];
  let mode: 'pending' | 'fail' | 'success' = 'pending';
  let releasePending!: () => void;
  const pending = new Promise<void>((resolve) => {
    releasePending = resolve;
  });
  const send = async (payload: Record<string, unknown>) => {
    sent.push(payload);
    if (mode === 'pending') await pending;
    if (mode === 'fail') throw new Error('network down');
    return { code: 200, data: { orderId: 'order-1' } };
  };
  const data = { itemId: ' item-1 ', buyerContact: ' buyer_wechat ' };

  const first = createMallOrderWithIdempotency(data, send, storage as never);
  const second = createMallOrderWithIdempotency(data, send, storage as never);
  mode = 'fail';
  releasePending();
  await Promise.allSettled([first, second]);

  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.clientRequestId, sent[1]?.clientRequestId);
  assert.deepEqual(
    { itemId: sent[0]?.itemId, buyerContact: sent[0]?.buyerContact },
    { itemId: 'item-1', buyerContact: 'buyer_wechat' },
  );

  mode = 'success';
  await createMallOrderWithIdempotency(data, send, storage as never);
  assert.equal(sent[2]?.clientRequestId, sent[0]?.clientRequestId);

  await createMallOrderWithIdempotency(data, send, storage as never);
  assert.notEqual(sent[3]?.clientRequestId, sent[0]?.clientRequestId);
});

test('a distinct user intent receives a distinct key even while another intent is pending', async () => {
  const storage = memoryStorage();
  const ids: unknown[] = [];
  const send = async (payload: Record<string, unknown>) => {
    ids.push(payload.clientRequestId);
    throw new Error('offline');
  };
  await assert.rejects(
    createMallOrderWithIdempotency({ itemId: 'item-1' }, send, storage as never),
    /offline/,
  );
  await assert.rejects(
    createMallOrderWithIdempotency({ itemId: 'item-2' }, send, storage as never),
    /offline/,
  );
  assert.notEqual(ids[0], ids[1]);

  await assert.rejects(
    createMallOrderWithIdempotency({ itemId: 'item-1' }, send, storage as never),
    /offline/,
  );
  assert.equal(ids[2], ids[0]);
});

test('corrupted persisted intent data is never reused as a request key', async () => {
  const storage = memoryStorage();
  storage.setStorageSync('mall_order_pending_intent_v1', {
    fingerprint: JSON.stringify(['item-1', '']),
    clientRequestId: 'Bearer stolen-token',
  });
  let sentId = '';
  await createMallOrderWithIdempotency(
    { itemId: 'item-1' },
    async (payload: Record<string, unknown>) => {
      sentId = String(payload.clientRequestId);
      return { code: 200 };
    },
    storage as never,
  );
  assert.match(sentId, /^[A-Za-z0-9_-]{16,64}$/);
  assert.doesNotMatch(sentId, /Bearer|token/i);
});
