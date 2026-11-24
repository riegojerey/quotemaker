// Pricing math. Mirrors the Casa workbook: full precision, round only for display.

export const num = v => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function lineQty(line, lines) {
  if (line.follows?.length && !line.override) {
    return line.follows.reduce((s, id) => s + num(lines.find(l => l.id === id)?.qty), 0);
  }
  return num(line.qty);
}

export const lineTotal = (line, lines) => num(line.mult ?? 1) * lineQty(line, lines) * num(line.price);

export function payItemTotals(pi) {
  if (pi.lumpSum) {
    const p = num(pi.lumpPrice);
    return { materials: 0, labor: 0, equipment: 0, subtotal: p, cpOcm: 0, total: p };
  }
  const sum = kind => pi.lines.filter(l => l.kind === kind).reduce((s, l) => s + lineTotal(l, pi.lines), 0);
  const materials = sum('material'), labor = sum('labor'), equipment = sum('equipment');
  const subtotal = materials + labor + equipment;
  const cpOcm = subtotal * num(pi.cpOcm);
  return { materials, labor, equipment, subtotal, cpOcm, total: subtotal + cpOcm };
}

export function quoteTotals(quote) {
  const items = [];
  let section = 0;
  quote.services.forEach((svc, serviceIdx) => {
    const included = svc.payItems.map((p, i) => [p, i]).filter(([p]) => p.enabled !== false);
    if (!included.length) return;
    section++;
    included.forEach(([p, payItemIdx], n) =>
      items.push({ serviceIdx, payItemIdx, no: `${section}.${n + 1}`, section, totals: payItemTotals(p) }));
  });
  const grandTotal = items.reduce((s, i) => s + i.totals.total, 0);
  const terms = (quote.paymentTerms || []).map(t => ({ ...t, amount: grandTotal * num(t.pct) }));
  const termsPct = terms.reduce((s, t) => s + num(t.pct), 0) * 100;
  return { grandTotal, items, terms, termsPct };
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const plain = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPeso = n => peso.format(num(n));
export const fmtNum = n => plain.format(num(n));
