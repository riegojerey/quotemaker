import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseBackup } from '../src/backup.js';
import { quoteTotals } from '../src/calc.js';

const FILE = new URL('../private/casa-backup.json', import.meta.url);

// Expected numbers come from the workbook itself (written by the importer), so no real prices live in the repo.
test('imported quote reproduces the workbook totals', t => {
  if (!existsSync(FILE)) return t.skip('no private Casa data');
  const b = parseBackup(readFileSync(FILE, 'utf8'));
  const r = quoteTotals(b.quotes[0]);
  const exp = b._expected;
  assert.ok(Math.abs(r.grandTotal - exp.grandTotal) < 0.01, `grand total ${r.grandTotal} vs ${exp.grandTotal}`);
  assert.equal(r.items.length, exp.items.length);
  r.items.forEach((it, i) => assert.ok(Math.abs(it.totals.total - exp.items[i]) < 0.01, `${it.no}: ${it.totals.total} vs ${exp.items[i]}`));
});

test('imported ids are unique', t => {
  if (!existsSync(FILE)) return t.skip('no private Casa data');
  const b = parseBackup(readFileSync(FILE, 'utf8'));
  for (const list of [b.catalogue, b.services, b.services.flatMap(s => s.payItems)]) {
    const ids = list.map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  }
});
