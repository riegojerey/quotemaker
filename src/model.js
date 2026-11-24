// Quote model helpers: defaults, snapshots, tiers.

export const newId = () => crypto.randomUUID();

export const DEFAULT_SETTINGS = {
  company: {
    name: 'Exoid Robotics Home Automation Services',
    address: ['SMART CITY TBI- ISU CAUAYAN CAMPUS', 'SAN FERMIN, CAUAYAN CITY,', 'ISABELA'],
    phone: '', // contact and bank details are filled in Settings and shared by backup, not published here
    email: '',
    website: 'www.exoidrobotics.com',
  },
  bank: { name: 'Union Bank of the Philippines', accountNo: '', accountName: 'EXOID ROBOTICS HOME AUTOMATION SERVICES' },
  cpOcmDefault: 0.15,
  paymentTerms: [
    { label: 'Downpayment', pct: 0.3, due: 'Upon contract signing' },
    { label: 'Project Initiation', pct: 0.2, due: 'Upon delivery and execution of project' },
    { label: 'Billing 1', pct: 0.1, due: 'Progress billing' },
    { label: 'Billing 2', pct: 0.1, due: 'Progress billing' },
    { label: 'Billing 3', pct: 0.1, due: 'Progress billing' },
    { label: 'Project Completion', pct: 0.2, due: 'Upon turnover' },
  ],
  validityMonths: 1,
  footerNote: 'Extra features requested by client, i.e, lighting scenes, curtain scenes, etc., are free to apply with the approved and installed smart home system hardware',
  preparer: { name: '', title: '', signature: null },
  coworkers: [],
};

export function snapshotPayItem(tpl, catalogue) {
  const { lines, ...rest } = structuredClone(tpl);
  return {
    ...rest,
    enabled: true,
    lines: lines.map(l => {
      const item = catalogue.find(c => c.id === l.itemId);
      const variant = item?.variants.find(v => v.id === l.variantId) ?? item?.variants[0];
      return {
        id: l.id, kind: l.kind, itemId: l.itemId, variantId: variant?.id ?? null,
        name: item?.name ?? '(missing item)', unit: item?.unit ?? '', variantLabel: variant?.label ?? '',
        price: variant?.price ?? 0, qty: l.qty, mult: l.mult ?? 1, remark: l.remark ?? '',
        follows: l.follows ?? null, override: false,
      };
    }),
  };
}

const snapshotService = (svc, catalogue) => ({
  serviceId: svc.id, title: svc.title, order: svc.order, about: svc.about ?? '',
  payItems: svc.payItems.map(p => snapshotPayItem(p, catalogue)),
});
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export function tierFor(serviceIds, tiers) {
  const set = new Set(serviceIds);
  if (!set.size) return 'Custom';
  const t = tiers.find(t => t.serviceIds.length === set.size && t.serviceIds.every(id => set.has(id)));
  return t ? t.name : 'Custom';
}

export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function suggestCode(isoDate, owner) {
  const [y, m, d] = isoDate.split('-');
  const initials = (owner || '').split(/\s+/).map(w => w.replace(/[^a-z]/gi, '')).filter(Boolean)
    .map(w => w[0].toUpperCase()).join('').slice(0, 4);
  return `${m}${d}${initials}${y.slice(2)}`;
}

export function buildQuote({ services, catalogue, settings, serviceIds, tierName, today }) {
  const now = new Date().toISOString();
  return {
    id: newId(), code: '', date: today, validFrom: today, validTo: addMonths(today, settings.validityMonths ?? 1),
    tierName,
    client: { owner: '', address: '', project: '', email: '' },
    contractor: { enterprise: '', rep: '', contact: '', email: '' },
    generalContractor: '', conforme: { name: '', title: 'Owner' },
    services: services.filter(s => serviceIds.includes(s.id)).sort(byOrder).map(s => snapshotService(s, catalogue)),
    remarks: '',
    paymentTerms: structuredClone(settings.paymentTerms),
    preparer: structuredClone(settings.preparer),
    createdAt: now, updatedAt: now,
  };
}

export function addService(quote, service, catalogue, tiers) {
  const services = [...quote.services.filter(s => s.serviceId !== service.id), snapshotService(service, catalogue)].sort(byOrder);
  return { ...quote, services, tierName: tierFor(services.map(s => s.serviceId), tiers) };
}

export function removeService(quote, serviceId, tiers) {
  const services = quote.services.filter(s => s.serviceId !== serviceId);
  return { ...quote, services, tierName: tierFor(services.map(s => s.serviceId), tiers) };
}

export function duplicateQuote(quote) {
  const now = new Date().toISOString();
  return { ...structuredClone(quote), id: newId(), createdAt: now, updatedAt: now };
}

// Clicking a tier: select exactly its services; services already on the quote keep their edits.
export function applyTier(quote, tier, services, catalogue, tiers) {
  const chosen = services.filter(s => tier.serviceIds.includes(s.id)).sort(byOrder)
    .map(s => quote.services.find(q => q.serviceId === s.id) ?? snapshotService(s, catalogue));
  return { ...quote, services: chosen, tierName: tierFor(chosen.map(s => s.serviceId), tiers) };
}
