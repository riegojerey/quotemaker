import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, lineQty, lineTotal, payItemTotals, quoteTotals, fmtPeso, fmtNum } from '../src/calc.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`);
const L = (id, kind, price, qty, extra = {}) => ({ id, kind, name: id, unit: 'unit', variantLabel: '', price, qty, mult: 1, remark: '', follows: null, override: false, ...extra });
const pi = (lines, extra = {}) => ({ description: 'x', um: 'unit', prerequisite: '', cpOcm: 0.15, lumpSum: false, lumpPrice: 0, enabled: true, lines, ...extra });

// Made-up prices (real ones never go in the public repo); same shape as a Smart Climate pay item.
const climate = () => pi([
  L('rm4c', 'material', 1000, 10),
  L('psu', 'material', 200, 10),
  L('elec', 'labor', 500, 0, { follows: ['rm4c'] }),
  L('tech', 'labor', 500, 0, { follows: ['rm4c'] }),
  L('tools', 'equipment', 600, 5),
]);

test('pay item totals: materials, follow-labor, equipment, CP,OCM', () => {
  const t = payItemTotals(climate());
  assert.equal(t.materials, 12000);
  assert.equal(t.labor, 10000);
  assert.equal(t.equipment, 3000);
  assert.equal(t.subtotal, 25000);
  close(t.cpOcm, 3750);
  close(t.total, 28750);
});

test('line multiplier applies to any line kind', () => {
  const t = payItemTotals(pi([
    L('fuel', 'material', 25, 40, { mult: 50 }),
    L('import', 'material', 5000, 1.5),
    L('toll', 'material', 100, 50),
    L('vehicle', 'equipment', 150, 50, { mult: 2 }),
  ]));
  assert.equal(t.materials, 62500);
  assert.equal(t.equipment, 15000);
  close(t.total, 89125);
});

test('zero CP,OCM leaves total equal to subtotal', () => {
  const t = payItemTotals(pi([L('cam', 'material', 5000, 11)], { cpOcm: 0 }));
  assert.equal(t.total, t.subtotal);
  assert.equal(t.total, 55000);
});

test('lump sum pay item totals its lump price', () => {
  const t = payItemTotals(pi([], { lumpSum: true, lumpPrice: 4000 }));
  assert.equal(t.total, 4000);
  assert.equal(t.materials, 0);
});

test('follow line tracks source qty until overridden', () => {
  const p = climate();
  p.lines[0].qty = 20;
  assert.equal(lineQty(p.lines[2], p.lines), 20);
  p.lines[2].override = true;
  p.lines[2].qty = 5;
  p.lines[0].qty = 30;
  assert.equal(lineQty(p.lines[2], p.lines), 5);
  p.lines[2].override = false;
  assert.equal(lineQty(p.lines[2], p.lines), 30);
});

test('blank or invalid numbers count as zero', () => {
  assert.equal(num(''), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num('abc'), 0);
  assert.equal(num('12.5'), 12.5);
  const line = L('a', 'material', '', 3);
  assert.equal(lineTotal(line, [line]), 0);
  const t = payItemTotals(pi([line, L('b', 'material', 10, '')]));
  assert.ok(Number.isFinite(t.total));
  assert.equal(t.total, 0);
});

test('quoteTotals numbers included items and sums only enabled ones', () => {
  const q = {
    services: [
      { title: 'A', payItems: [pi([L('a', 'material', 100, 1)], { cpOcm: 0 })] },
      { title: 'Off', payItems: [pi([L('z', 'material', 999, 1)], { enabled: false })] },
      { title: 'B', payItems: [pi([L('b', 'material', 900, 1)], { cpOcm: 0, enabled: false }), pi([L('c', 'material', 900, 1)], { cpOcm: 0 })] },
    ],
    paymentTerms: [{ label: 'DP', pct: 0.3, due: '' }, { label: 'Rest', pct: 0.7, due: '' }],
  };
  const r = quoteTotals(q);
  assert.equal(r.grandTotal, 1000);
  assert.deepEqual(r.items.map(i => i.no), ['1.1', '2.1']);
  assert.deepEqual(r.items.map(i => [i.serviceIdx, i.payItemIdx]), [[0, 0], [2, 1]]);
  close(r.terms[0].amount, 300);
  close(r.terms[1].amount, 700);
  close(r.termsPct, 100);
});

test('money formatting', () => {
  assert.equal(fmtPeso(1234), '₱1,234.00');
  assert.equal(fmtNum(1234567.5), '1,234,567.50');
  assert.equal(fmtNum(NaN), '0.00');
});
