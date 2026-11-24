import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup, mergeBackup } from '../src/backup.js';

const data = () => ({
  catalogue: [{ id: 'a', name: 'A', unit: 'unit', variants: [{ id: 'v', label: '', price: 10 }] }],
  services: [{ id: 's', title: 'S', order: 1, payItems: [] }],
  tiers: [{ id: 't', name: 'Premium', serviceIds: ['s'] }],
  quotes: [{ id: 'q1' }],
  settings: { cpOcmDefault: 0.15, preparer: { name: 'Me', title: 'Eng', signature: 'data:image/png;base64,xx' } },
});

test('parseBackup rejects files that are not Quote Maker backups', () => {
  for (const text of ['not json', '{"a":1}', '{"app":"quotemaker","catalogue":"x","services":[],"tiers":[]}', 'null']) {
    assert.throws(() => parseBackup(text), { message: 'Not a Quote Maker backup file' });
  }
});

test('default backup drops quotes and preparer and round-trips', () => {
  const b = parseBackup(JSON.stringify(makeBackup(data(), {})));
  assert.equal(b.app, 'quotemaker');
  assert.equal(b.catalogue[0].name, 'A');
  assert.equal(b.quotes, undefined);
  assert.equal(b.settings.preparer, undefined);
  assert.equal(b.settings.cpOcmDefault, 0.15);
});

test('backup can include quotes and signature', () => {
  const b = makeBackup(data(), { includeQuotes: true, includeSignature: true });
  assert.equal(b.quotes.length, 1);
  assert.equal(b.settings.preparer.name, 'Me');
});

test('merge upserts templates and quotes, leaves settings alone', () => {
  const cur = data();
  const inc = { catalogue: [{ id: 'a', name: 'A2', unit: 'unit', variants: [] }, { id: 'b', name: 'B', unit: 'm', variants: [] }], services: [], tiers: [], settings: { cpOcmDefault: 0.2 }, quotes: [{ id: 'q2' }] };
  const r = mergeBackup(cur, inc, 'merge');
  assert.deepEqual(r.catalogue.map(c => c.name), ['A2', 'B']);
  assert.equal(r.services.length, 1);
  assert.equal(r.settings.cpOcmDefault, 0.15);
  assert.deepEqual(r.quotes.map(q => q.id), ['q1', 'q2']);
});

test('replace keeps my preparer and quotes when the file has none', () => {
  const r = mergeBackup(data(), { catalogue: [], services: [], tiers: [], settings: { cpOcmDefault: 0.2 } }, 'replace');
  assert.equal(r.catalogue.length, 0);
  assert.equal(r.settings.cpOcmDefault, 0.2);
  assert.equal(r.settings.preparer.name, 'Me');
  assert.deepEqual(r.quotes.map(q => q.id), ['q1']);
});


test('parseBackup rejects records without a string id (would half-wipe a store on restore)', () => {
  const ok = { app: 'quotemaker', catalogue: [], services: [], tiers: [] };
  for (const bad of [{ catalogue: [{ name: 'x' }] }, { services: [null] }, { tiers: ['t'] }, { quotes: [{ id: 5 }] }]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...ok, ...bad })), { message: 'Not a Quote Maker backup file' });
  }
});

test('backup without signature strips it from quotes too', () => {
  const d = data();
  d.quotes = [{ id: 'q1', preparer: { name: 'Me', title: 'Eng', signature: 'data:image/png;base64,xx' } }];
  const b = makeBackup(d, { includeQuotes: true });
  assert.equal(b.quotes[0].preparer.signature, null);
  assert.equal(b.quotes[0].preparer.name, 'Me');
  assert.equal(d.quotes[0].preparer.signature, 'data:image/png;base64,xx');
});

test('restoring never deletes my quotes: quotes are upserted in both modes', () => {
  for (const mode of ['merge', 'replace']) {
    const r = mergeBackup(data(), { catalogue: [], services: [], tiers: [], settings: {}, quotes: [{ id: 'q2' }] }, mode);
    assert.deepEqual(r.quotes.map(q => q.id), ['q1', 'q2'], mode);
  }
});

test('replace keeps my own name and signature even if the file carries someone else\'s', () => {
  const r = mergeBackup(data(), { catalogue: [], services: [], tiers: [], settings: { preparer: { name: 'Other', signature: 'x' } } }, 'replace');
  assert.equal(r.settings.preparer.name, 'Me');
  const empty = data();
  empty.settings.preparer = { name: '', title: '', signature: null };
  assert.equal(mergeBackup(empty, { catalogue: [], services: [], tiers: [], settings: { preparer: { name: 'Other' } } }, 'replace').settings.preparer.name, 'Other');
});

const base = extra => JSON.stringify({ app: 'quotemaker', catalogue: [], services: [], tiers: [], ...extra });

test('restored data is repaired into the shapes the app expects', () => {
  const b = parseBackup(base({
    catalogue: [{ id: 'a', name: 'A' }],
    services: [{ id: 's', title: 'S', payItems: [{ id: 'p' }] }],
    tiers: [{ id: 't', name: 'T' }],
    settings: { company: { name: 'X', address: 'Line 1\nLine 2' }, paymentTerms: 'oops', cpOcmDefault: 'abc' },
    quotes: [{ id: 'q', services: [{ serviceId: 's', title: 'S', payItems: [{ id: 'p' }] }] }],
  }));
  assert.deepEqual(b.catalogue[0].variants, []);
  assert.deepEqual(b.services[0].payItems[0].lines, []);
  assert.deepEqual(b.services[0].payItems[0].headings, { material: 'MATERIALS', labor: 'LABOR', equipment: 'EQUIPMENT' });
  assert.deepEqual(b.tiers[0].serviceIds, []);
  assert.deepEqual(b.settings.company.address, ['Line 1', 'Line 2']);
  // invalid settings are dropped (so Replace keeps my current value), never filled with defaults
  assert.ok(!('paymentTerms' in b.settings));
  assert.ok(!('cpOcmDefault' in b.settings));
  assert.ok(!('bank' in b.settings));
  assert.deepEqual(b.quotes[0].services[0].payItems[0].lines, []);
  assert.deepEqual(b.quotes[0].client, { owner: '', address: '', project: '', email: '' });
  assert.ok(Array.isArray(b.quotes[0].paymentTerms));
});

test('only embedded PNG/JPEG signatures survive a restore', () => {
  const sig = s => ({ settings: { preparer: { name: 'A', signature: s } }, quotes: [{ id: 'q', preparer: { name: 'A', signature: s } }] });
  const ok = 'data:image/png;base64,iVBORw0KGgo=';
  let b = parseBackup(base(sig(ok)));
  assert.equal(b.settings.preparer.signature, ok);
  assert.equal(b.quotes[0].preparer.signature, ok);
  for (const bad of ['https://evil.example/pixel.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 42]) {
    b = parseBackup(base(sig(bad)));
    assert.equal(b.settings.preparer.signature, null, String(bad));
    assert.equal(b.quotes[0].preparer.signature, null, String(bad));
  }
});

test('company logo survives restore only as an embedded image', () => {
  const ok = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(parseBackup(base({ settings: { company: { logo: ok } } })).settings.company.logo, ok);
  assert.equal(parseBackup(base({ settings: { company: { logo: 'https://x.example/l.png' } } })).settings.company.logo, null);
});
