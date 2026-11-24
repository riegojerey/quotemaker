import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debounce, flushAll } from '../src/ui/dom.js';

test('flushAll runs pending debounced calls immediately, once', async () => {
  const calls = [];
  const f = debounce(x => calls.push(x), 10_000);
  f(1); f(2);
  await flushAll();
  assert.deepEqual(calls, [2]);
  await flushAll();
  assert.deepEqual(calls, [2]);
});

test('cancel drops a pending call (e.g. the record was just deleted)', async () => {
  const calls = [];
  const f = debounce(x => calls.push(x), 10_000);
  f(1);
  f.cancel();
  await flushAll();
  assert.deepEqual(calls, []);
});
