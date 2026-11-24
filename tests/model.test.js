import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, DEFAULT_SETTINGS, snapshotPayItem, buildQuote, addService, removeService, tierFor, suggestCode, duplicateQuote, addMonths, applyTier } from '../src/model.js';
import { quoteTotals } from '../src/calc.js';

const catalogue = [
  { id: 'rm4c', name: 'Smart Climate RM4C', unit: 'unit', variants: [{ id: 'v1', label: '', price: 1200 }] },
  { id: 'sw', name: 'Smart Switch', unit: 'unit', variants: [{ id: 'g1', label: '1 Gang', price: 1000 }, { id: 'g3', label: '3 Gang', price: 1200 }] },
];
const tpl = (id, itemId, variantId) => ({
  id, description: id, um: 'unit', prerequisite: '', cpOcm: 0.15, lumpSum: false, lumpPrice: 0,
  headings: { material: 'MATERIALS', labor: 'LABOR', equipment: 'EQUIPMENT' },
  lines: [{ id: 'l1', kind: 'material', itemId, variantId, qty: 16, mult: 1, remark: '', follows: null }],
});
const services = [
  { id: 'lighting', title: 'SMART LIGHTING', order: 2, payItems: [tpl('sw', 'sw', 'g3')] },
  { id: 'climate', title: 'SMART CLIMATE', order: 1, payItems: [tpl('ac', 'rm4c', 'v1')] },
  { id: 'gone', title: 'X', order: 3, payItems: [tpl('x', 'nope', 'nope')] },
];
const tiers = [{ id: 't1', name: 'Premium', serviceIds: ['climate', 'lighting'] }];

test('snapshot copies catalogue data and ignores later price edits', () => {
  const cat = structuredClone(catalogue);
  const q = buildQuote({ services, catalogue: cat, settings: DEFAULT_SETTINGS, serviceIds: ['climate'], tierName: 'Custom', today: '2026-11-24' });
  const line = q.services[0].payItems[0].lines[0];
  assert.equal(line.name, 'Smart Climate RM4C');
  assert.equal(line.price, 1200);
  assert.equal(line.override, false);
  const before = quoteTotals(q).grandTotal;
  cat[0].variants[0].price = 9999;
  assert.equal(quoteTotals(q).grandTotal, before);
});

test('snapshot uses variant label and handles missing items', () => {
  assert.equal(snapshotPayItem(tpl('s', 'sw', 'g3'), catalogue).lines[0].variantLabel, '3 Gang');
  const missing = snapshotPayItem(tpl('x', 'nope', 'nope'), catalogue).lines[0];
  assert.equal(missing.name, '(missing item)');
  assert.equal(missing.price, 0);
});

test('tierFor matches exact service sets regardless of order', () => {
  assert.equal(tierFor(['lighting', 'climate'], tiers), 'Premium');
  assert.equal(tierFor(['lighting', 'climate', 'gone'], tiers), 'Custom');
  assert.equal(tierFor(['climate'], tiers), 'Custom');
});

test('buildQuote orders services and sets validity and settings copies', () => {
  const q = buildQuote({ services, catalogue, settings: DEFAULT_SETTINGS, serviceIds: ['lighting', 'climate'], tierName: 'Premium', today: '2026-10-23' });
  assert.deepEqual(q.services.map(s => s.serviceId), ['climate', 'lighting']);
  assert.equal(q.validFrom, '2026-10-23');
  assert.equal(q.validTo, '2026-11-23');
  assert.equal(q.tierName, 'Premium');
  assert.notEqual(q.paymentTerms, DEFAULT_SETTINGS.paymentTerms);
  assert.deepEqual(q.paymentTerms, DEFAULT_SETTINGS.paymentTerms);
});

test('addService and removeService keep order and update tier name', () => {
  let q = buildQuote({ services, catalogue, settings: DEFAULT_SETTINGS, serviceIds: ['lighting'], tierName: 'Custom', today: '2026-10-23' });
  q = addService(q, services[1], catalogue, tiers);
  assert.deepEqual(q.services.map(s => s.serviceId), ['climate', 'lighting']);
  assert.equal(q.tierName, 'Premium');
  q = removeService(q, 'lighting', tiers);
  assert.equal(q.tierName, 'Custom');
});

test('suggestCode builds MMDD + initials + YY', () => {
  assert.equal(suggestCode('2026-10-09', 'Maria Clara Dela Cruz'), '1009MCDC26');
  assert.equal(suggestCode('2026-01-02', 'Ms. ana'), '0102MA26');
});

test('addMonths clamps to month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});

test('duplicateQuote is an independent copy', () => {
  const q = buildQuote({ services, catalogue, settings: DEFAULT_SETTINGS, serviceIds: ['climate'], tierName: 'Custom', today: '2026-10-23' });
  const d = duplicateQuote(q);
  assert.notEqual(d.id, q.id);
  d.services[0].payItems[0].lines[0].qty = 1;
  assert.equal(q.services[0].payItems[0].lines[0].qty, 16);
});

test('defaults: payment terms sum to 100% and ids are unique', () => {
  assert.equal(Math.round(DEFAULT_SETTINGS.paymentTerms.reduce((s, t) => s + t.pct, 0) * 100), 100);
  assert.equal(DEFAULT_SETTINGS.cpOcmDefault, 0.15);
  assert.notEqual(newId(), newId());
});

test('tierFor never matches an empty tier or an empty selection', () => {
  const withEmpty = [{ id: 'e', name: 'Standard', serviceIds: [] }, ...tiers];
  assert.equal(tierFor([], withEmpty), 'Custom');
  assert.equal(tierFor(['climate', 'lighting'], withEmpty), 'Premium');
});

test('applyTier selects exactly the tier services and keeps edits on ones already selected', () => {
  let q = buildQuote({ services, catalogue, settings: DEFAULT_SETTINGS, serviceIds: ['climate', 'gone'], tierName: 'Custom', today: '2026-10-23' });
  q.services[0].payItems[0].lines[0].qty = 3; // edited climate
  q = applyTier(q, tiers[0], services, catalogue, tiers);
  assert.deepEqual(q.services.map(s => s.serviceId), ['climate', 'lighting']);
  assert.equal(q.services[0].payItems[0].lines[0].qty, 3);
  assert.equal(q.tierName, 'Premium');
});

test('quotes keep the service description from the template', () => {
  const svc = [{ ...services[1], about: 'Climate words' }];
  const q = buildQuote({ services: svc, catalogue, settings: DEFAULT_SETTINGS, serviceIds: ['climate'], tierName: 'Custom', today: '2026-10-23' });
  assert.equal(q.services[0].about, 'Climate words');
});
