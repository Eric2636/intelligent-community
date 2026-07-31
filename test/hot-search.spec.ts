import assert from 'node:assert/strict';
import test from 'node:test';
import { Subject } from 'rxjs';

import { createHotSearch } from '../utils/hotSearch.js';

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

test('hot search trims, debounces and deduplicates keywords', async () => {
  const input$ = new Subject();
  const calls = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword), 20);

  input$.next(' a ');
  input$.next('a');
  await delay(30);
  input$.next('a');
  await delay(30);

  stop();
  assert.deepEqual(calls, ['a']);
});

test('blank input restores the default list without emitting the pending keyword', async () => {
  const input$ = new Subject();
  const calls = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword), 20);

  input$.next('pending keyword');
  input$.next('   ');
  await delay(30);

  stop();
  assert.deepEqual(calls, ['']);
});

test('hot search waits 500ms by default', async () => {
  const input$ = new Subject();
  const calls = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword));

  input$.next('keyword');
  await delay(450);
  assert.deepEqual(calls, []);
  await delay(100);

  stop();
  assert.deepEqual(calls, ['keyword']);
});

test('stop cancels pending and future searches', async () => {
  const input$ = new Subject();
  const calls = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword), 20);

  input$.next('pending');
  stop();
  input$.next('future');
  await delay(30);

  assert.deepEqual(calls, []);
});

test('returning to a previous keyword within debounce emits a replacement search', async () => {
  const input$ = new Subject();
  const calls = [];
  const stop = createHotSearch(input$, (keyword) => calls.push(keyword), 20);

  input$.next('a');
  await delay(30);
  input$.next('b');
  input$.next(' a ');
  await delay(30);

  stop();
  assert.deepEqual(calls, ['a', 'a']);
});
