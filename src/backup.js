// Backup files: how prices, templates and quotes move between people.

export function makeBackup(data, { includeQuotes = false, includeSignature = false } = {}) {
  const settings = structuredClone(data.settings);
  if (!includeSignature) delete settings.preparer;
  const b = {
    app: 'quotemaker', version: 1, exportedAt: new Date().toISOString(),
    catalogue: data.catalogue, services: data.services, tiers: data.tiers, settings,
  };
  if (includeQuotes) {
    b.quotes = structuredClone(data.quotes);
    if (!includeSignature) b.quotes.forEach(q => { if (q.preparer) q.preparer.signature = null; });
  }
  return structuredClone(b);
}

export function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { b = null; }
  // Every record needs a string id: IndexedDB would throw mid-restore and leave a store half-written.
  const records = list => Array.isArray(list) && list.every(r => r && typeof r === 'object' && typeof r.id === 'string' && r.id);
  const ok = b && b.app === 'quotemaker' && ['catalogue', 'services', 'tiers'].every(k => records(b[k]))
    && (b.quotes === undefined || records(b.quotes));
  if (!ok) throw new Error('Not a Quote Maker backup file');
  return normalize(b);
}

// ---- repair restored data into the shapes the views and PDF expect (files can be hand-edited or old) ----
const arr = v => (Array.isArray(v) ? v : []);
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const SIGNATURE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;
const signature = v => (typeof v === 'string' && SIGNATURE.test(v) ? v : null);
const HEADINGS = { material: 'MATERIALS', labor: 'LABOR', equipment: 'EQUIPMENT' };
const terms = v => arr(v).filter(t => t && typeof t === 'object').map(t => ({ label: str(t.label), pct: Number(t.pct) || 0, due: str(t.due) }));
const preparer = v => { const p = obj(v); return { name: str(p.name), title: str(p.title), signature: signature(p.signature) }; };
const payItem = p => ({ ...p, lines: arr(p.lines).filter(l => l && typeof l === 'object'), headings: { ...HEADINGS, ...obj(p.headings) } });

function settingsOf(raw) {
  const s = { ...obj(raw) };
  if ('company' in s) {
    const c = { ...obj(s.company) };
    if ('address' in c) c.address = Array.isArray(c.address) ? c.address.map(str) : str(c.address).split('\n');
    if ('logo' in c) c.logo = signature(c.logo); // same rule as signatures: embedded PNG/JPEG only
    s.company = c;
  }
  if ('bank' in s && !Object.keys(obj(s.bank)).length) delete s.bank;
  if ('paymentTerms' in s && !Array.isArray(s.paymentTerms)) delete s.paymentTerms; else if (s.paymentTerms) s.paymentTerms = terms(s.paymentTerms);
  for (const k of ['cpOcmDefault', 'validityMonths']) if (k in s && !Number.isFinite(Number(s[k]))) delete s[k];
  if ('coworkers' in s) s.coworkers = arr(s.coworkers).map(str);
  if ('preparer' in s) s.preparer = preparer(s.preparer);
  return s;
}

function quoteOf(q) {
  return {
    ...q,
    client: { owner: '', address: '', project: '', email: '', ...obj(q.client) },
    contractor: { enterprise: '', rep: '', contact: '', email: '', ...obj(q.contractor) },
    conforme: { name: '', title: '', ...obj(q.conforme) },
    preparer: preparer(q.preparer),
    paymentTerms: terms(q.paymentTerms),
    services: arr(q.services).filter(s => s && typeof s === 'object').map(s => ({ ...s, payItems: arr(s.payItems).filter(p => p && typeof p === 'object').map(payItem) })),
  };
}

function normalize(b) {
  const out = {
    ...b,
    catalogue: b.catalogue.map(c => ({ ...c, variants: arr(c.variants).filter(v => v && typeof v === 'object') })),
    services: b.services.map(s => ({ ...s, payItems: arr(s.payItems).filter(p => p && typeof p === 'object').map(payItem) })),
    tiers: b.tiers.map(t => ({ ...t, serviceIds: arr(t.serviceIds).map(str) })),
    settings: settingsOf(b.settings),
  };
  if (b.quotes) out.quotes = b.quotes.map(quoteOf);
  return out;
}

const upsert = (cur, inc) => {
  const out = cur.map(c => inc.find(i => i.id === c.id) ?? c);
  return [...out, ...inc.filter(i => !cur.some(c => c.id === i.id))];
};

export function mergeBackup(current, incoming, mode) {
  // Restoring never deletes my quotes, and never replaces my own name/signature unless I have none.
  const quotes = upsert(current.quotes, incoming.quotes ?? []);
  if (mode === 'merge') {
    return {
      ...current, quotes,
      catalogue: upsert(current.catalogue, incoming.catalogue),
      services: upsert(current.services, incoming.services),
      tiers: upsert(current.tiers, incoming.tiers),
    };
  }
  const settings = { ...current.settings, ...incoming.settings };
  if (current.settings.preparer?.name || !incoming.settings?.preparer) settings.preparer = current.settings.preparer;
  return { catalogue: incoming.catalogue, services: incoming.services, tiers: incoming.tiers, settings, quotes };
}

export function downloadJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
