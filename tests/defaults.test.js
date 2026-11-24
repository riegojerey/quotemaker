import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBackup } from '../src/backup.js';

// defaults.json is public: the company's services and selling prices, nothing else.
const text = readFileSync(new URL('../defaults.json', import.meta.url), 'utf8');

test('built-in defaults restore cleanly and include General Requirements', () => {
  const b = parseBackup(text);
  assert.ok(b.catalogue.length > 0 && b.services.length > 0);
  assert.ok(b.services.some(s => /general requirements/i.test(s.title)));
});

test('built-in defaults carry no quotes, settings, signatures or contact details', () => {
  const raw = JSON.parse(text);
  for (const k of ['quotes', 'settings', '_expected']) assert.ok(!(k in raw), k);
  assert.doesNotMatch(text, /@|\+63|\b09\d{9}\b|data:image|signature|accountNo/i);
});
