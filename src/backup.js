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
  return b;
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
