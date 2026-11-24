import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocDefinition, pdfFilename } from '../src/pdf.js';
import { quoteTotals, fmtNum } from '../src/calc.js';
import { DEFAULT_SETTINGS } from '../src/model.js';

// Collect every text string and node type in a pdfmake content tree.
function walk(node, out = { texts: [], images: 0 }) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.texts.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach(n => walk(n, out)); return out; }
  if (typeof node === 'object') {
    if (node.image) out.images++;
    for (const [k, v] of Object.entries(node)) if (!['image', 'images', 'styles', 'defaultStyle', 'pageSize', 'pageMargins', 'layout', 'widths'].includes(k)) walk(v, out);
  }
  return out;
}

const L = (id, kind, name, price, qty, extra = {}) => ({ id, kind, name, unit: 'unit', variantLabel: '', price, qty, mult: 1, remark: '', follows: null, override: false, ...extra });
const pi = (description, lines, extra = {}) => ({ id: description, description, um: 'unit', prerequisite: 'CONVENIENCE OUTLET', cpOcm: 0.15, lumpSum: false, lumpPrice: 0, enabled: true,
  headings: { material: 'MATERIALS', labor: 'LABOR', equipment: 'EQUIPMENT' }, lines, ...extra });

const fixture = (over = {}) => ({
  id: 'q', code: '1009TEST26', date: '2026-10-23', validFrom: '2026-10-23', validTo: '2026-11-23', tierName: 'Elite',
  client: { owner: 'MS. TEST OWNER', address: 'LOT 3\nBLK 5\nMAJORCA ST.', project: 'TEST HOME', email: '' },
  contractor: { enterprise: 'Builder Co.', rep: 'Ms. Rep', contact: '', email: 'rep@example.com' },
  generalContractor: 'BUILDER CO.', conforme: { name: 'MS. TEST OWNER', title: 'Owner' },
  services: [
    { serviceId: 'climate', title: 'SMART CLIMATE', payItems: [pi('AC Controller', [
      L('rm4c', 'material', 'AC Controller', 1000, 10), L('psu', 'material', 'Power Supply', 200, 10),
      L('elec', 'labor', 'Electrician', 500, 0, { follows: ['rm4c'] }), L('tools', 'equipment', 'Tools', 600, 5)])] },
    { serviceId: 'existing', title: 'EXISTING CONDITION', payItems: [pi('Property Assessment', [], { lumpSum: true, lumpPrice: 4000 })] },
  ],
  remarks: 'Smart Climate in all ten (10) AC units',
  paymentTerms: DEFAULT_SETTINGS.paymentTerms,
  preparer: { name: 'Engr. Test', title: 'R&D, Exoid Robotics', signature: 'data:image/png;base64,iVBORw0KGgo=' },
  createdAt: '', updatedAt: '', ...over,
});

test('document has BOQ, proforma and one DUPA per non-lump pay item', () => {
  const q = fixture();
  const { texts } = walk(buildDocDefinition(q, DEFAULT_SETTINGS));
  const all = texts.join('\n');
  assert.ok(all.includes('BILL OF QUANTITIES (EXHIBIT A)'));
  assert.ok(all.includes('PROFORMA INVOICE'));
  assert.equal(texts.filter(t => t.includes('DETAILED UNIT PRICE ANALYSIS')).length, 1);
  assert.ok(texts.includes(fmtNum(quoteTotals(q).grandTotal)));
  assert.ok(all.includes('Union Bank of the Philippines'));
  assert.ok(all.includes('10/23/2026 ~ 11/23/2026'));
  assert.ok(all.includes('CP,OCM 15%'));
  assert.ok(!all.includes('NaN') && !all.includes('undefined'));
});

test('signature appears on every page that has a Prepared By block', () => {
  const def = buildDocDefinition(fixture(), DEFAULT_SETTINGS);
  const { texts, images } = walk(def);
  assert.equal(images, texts.filter(t => t === 'Prepared By:').length);
  assert.equal(images, 3);
});

test('missing signature, empty remarks and a 30-line pay item still build', () => {
  const lines = Array.from({ length: 30 }, (_, i) => L(`m${i}`, 'material', `Item ${i}`, i ? 100 : '', i === 3 ? '' : 2));
  const q = fixture({ remarks: '', preparer: { name: '', title: '', signature: null },
    services: [{ serviceId: 'big', title: 'BIG', payItems: [pi('Big', lines, { cpOcm: 0 })] }] });
  const def = buildDocDefinition(q, DEFAULT_SETTINGS);
  const { texts, images } = walk(def);
  assert.equal(images, 0);
  assert.ok(!texts.join('').includes('NaN'));
  assert.ok(!texts.some(t => t.startsWith('CP,OCM')), 'no CP,OCM row when 0');
});

test('disabled pay items and services without enabled items are left out', () => {
  const q = fixture();
  q.services[1].payItems[0].enabled = false;
  const all = walk(buildDocDefinition(q, DEFAULT_SETTINGS)).texts.join('\n');
  assert.ok(!all.includes('EXISTING CONDITION'));
  assert.ok(!all.includes('Property Assessment'));
});

test('pdfFilename strips characters that are invalid in file names', () => {
  assert.equal(pdfFilename(fixture({ client: { project: 'A/B: "C"' } })), '1009TEST26 - A-B- -C- - Elite.pdf');
  assert.equal(pdfFilename(fixture({ code: '', client: { project: '' } })), 'Quotation - Elite.pdf');
});

test('DUPA title names the pay item when a section has several, else the section', () => {
  const q = fixture();
  q.services[0].payItems.push({ ...structuredClone(q.services[0].payItems[0]), id: 'b', description: 'Second Thing' });
  const texts = walk(buildDocDefinition(q, DEFAULT_SETTINGS)).texts;
  assert.ok(texts.includes('AC CONTROLLER: DETAILED UNIT PRICE ANALYSIS (EXHIBIT B)'));
  assert.ok(texts.includes('TOTAL UNIT COST FOR SECOND THING'));
  const single = walk(buildDocDefinition(fixture(), DEFAULT_SETTINGS)).texts;
  assert.ok(single.includes('SMART CLIMATE: DETAILED UNIT PRICE ANALYSIS (EXHIBIT B)'));
  assert.ok(single.includes('TOTAL UNIT COST FOR SMART CLIMATE'));
});
