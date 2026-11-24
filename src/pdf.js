// Quotation PDF (pdfmake document definition): BOQ, Proforma Invoice, one DUPA per pay item. Layout follows Casa.
import { quoteTotals, lineQty, lineTotal, fmtNum, num } from './calc.js';

const fmtDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};
const validity = q => `${fmtDate(q.validFrom)} ~ ${fmtDate(q.validTo)}`;
const pct = f => `${+(num(f) * 100).toFixed(2)}%`;
const s = v => (v == null ? '' : String(v));
const rule = () => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.7 }], margin: [0, 2, 0, 2] }); // fresh object each use: pdfmake mutates nodes during layout
const label = (k, v) => ({ columns: [{ text: k, width: 78, bold: true }, { text: s(v) }], margin: [0, 0, 0, 1] });

function header(q, settings, title) {
  const c = settings.company;
  return [
    {
      columns: [
        { width: '*', stack: [
          { text: c.name, bold: true, fontSize: 12 },
          ...c.address.filter(Boolean).map(a => ({ text: a })),
          { text: `Phone: ${s(c.phone)}` }, { text: `E-mail: ${s(c.email)}` }, { text: `Website: ${s(c.website)}` },
        ] },
        { width: 'auto', stack: [
          { text: title, bold: true, fontSize: 15, alignment: 'right' },
          { text: s(q.tierName).toUpperCase(), alignment: 'right', fontSize: 11, color: '#0f6c5c', bold: true },
          { text: `Contract Code: ${s(q.code)}`, alignment: 'right', margin: [0, 6, 0, 0] },
          { text: `Date: ${fmtDate(q.date)}`, alignment: 'right' },
        ] },
      ],
    },
    {
      columns: [
        { stack: [{ text: 'PROJECT INFORMATION', style: 'h' }, label('Owner Name:', q.client.owner), label('Address:', q.client.address),
          label('Project Name:', q.client.project), label('E-mail:', q.client.email)] },
        { stack: [{ text: 'CONTRACTOR INFORMATION', style: 'h' }, label('Enterprise:', q.contractor.enterprise), label('Representative:', q.contractor.rep),
          label('Contact Number:', q.contractor.contact), label('E-mail:', q.contractor.email)] },
        { width: 120, stack: [{ text: 'GENERAL CONTRACTOR', style: 'h' }, { text: s(q.generalContractor) }] },
      ],
      columnGap: 12, margin: [0, 12, 0, 10],
    },
  ];
}

function signature(q) {
  const p = q.preparer || {};
  return {
    unbreakable: true, margin: [0, 18, 0, 0],
    stack: [
      { columns: [
        { width: 220, stack: [
          { text: 'Prepared By:', bold: true },
          p.signature ? { image: p.signature, width: 110, margin: [20, 2, 0, -6] } : { text: ' ', margin: [0, 18, 0, 0] },
          rule(), { text: s(p.name), bold: true }, { text: s(p.title) },
        ] },
        { width: '*', text: '' },
        { width: 160, stack: [{ text: 'Validity', bold: true }, { text: validity(q) }] },
      ] },
      { width: 220, margin: [0, 16, 0, 0], stack: [
        { text: 'Conforme:', bold: true }, { text: ' ', margin: [0, 14, 0, 0] }, rule(),
        { text: s(q.conforme?.name), bold: true }, { text: s(q.conforme?.title) },
      ] },
    ],
  };
}

function boqTable(q, totals) {
  const body = [[
    'NO.', 'ITEM/DESCRIPTION', 'U.M.', 'QTY', 'UNIT PRICE (MATERIALS)', 'UNIT PRICE (LABOR)', 'UNIT PRICE (EQUIPMENT)', 'UNIT PRICE (TOTAL+CP,OCM)', 'REMARKS',
  ].map(t => ({ text: t, style: 'th' }))];
  let lastSection = 0;
  for (const it of totals.items) {
    const svc = q.services[it.serviceIdx];
    const p = svc.payItems[it.payItemIdx];
    if (it.section !== lastSection) {
      lastSection = it.section;
      body.push([{ text: `${it.section}.0`, bold: true }, { text: svc.title, bold: true, colSpan: 8 }, '', '', '', '', '', '', '']);
    }
    const t = it.totals;
    body.push([it.no, p.description, p.um, '1', ...[t.materials, t.labor, t.equipment, t.total].map(v => ({ text: fmtNum(v), alignment: 'right' })), '']);
  }
  body.push(
    [{ text: 'SUBTOTAL (PHP):', colSpan: 7, alignment: 'right', bold: true }, '', '', '', '', '', '', { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true }, ''],
    [{ text: 'GRAND TOTAL (PHP)', colSpan: 7, alignment: 'right', bold: true, fontSize: 10 }, '', '', '', '', '', '', { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true, fontSize: 10 }, ''],
  );
  return { table: { headerRows: 1, widths: [24, '*', 26, 20, 56, 50, 50, 64, 40], body }, layout: 'grid', fontSize: 7.5 };
}

const exhibitA = q => ({ text: 'BILL OF QUANTITIES (EXHIBIT A)', style: 'title2' });

function boqPage(q, settings, totals) {
  return [
    ...header(q, settings, 'BILL OF QUANTITIES'), exhibitA(q), boqTable(q, totals),
    q.remarks?.trim() ? { margin: [0, 10, 0, 0], stack: [{ text: 'Remarks:', bold: true }, { text: q.remarks }] } : '',
    settings.footerNote ? { margin: [0, 8, 0, 0], stack: [{ text: 'Note:', bold: true }, { text: settings.footerNote, italics: true }] } : '',
    signature(q),
  ];
}

function proformaPage(q, settings, totals) {
  const b = settings.bank;
  return [
    { text: '', pageBreak: 'before' },
    ...header(q, settings, 'PROFORMA INVOICE'), exhibitA(q), boqTable(q, totals),
    { text: 'PAYMENT TERMS', style: 'h', margin: [0, 12, 0, 4] },
    { table: { headerRows: 1, widths: ['*', 60, 90, '*'], body: [
      ['Payment Terms', 'Percentage', 'Amount', 'Due Date'].map(t => ({ text: t, style: 'th' })),
      ...totals.terms.map(t => [s(t.label), { text: pct(t.pct), alignment: 'right' }, { text: fmtNum(t.amount), alignment: 'right' }, s(t.due)]),
      [{ text: 'Total', bold: true }, { text: `${+totals.termsPct.toFixed(2)}%`, alignment: 'right', bold: true },
        { text: fmtNum(totals.terms.reduce((a, t) => a + t.amount, 0)), alignment: 'right', bold: true }, ''],
    ] }, layout: 'grid' },
    { margin: [0, 10, 0, 0], stack: [
      { text: 'PAYMENT CHANNEL', style: 'h' }, { text: s(b.name), bold: true },
      label('Account Number:', b.accountNo), label('Account Name:', b.accountName),
    ] },
    signature(q),
  ];
}

function dupaPage(q, svc, p, no, t) {
  // Casa: a section with one pay item is titled by the section, otherwise by the pay item.
  const name = (svc.payItems.length > 1 ? s(p.description) : s(svc.title)).toUpperCase();
  const lineRows = kind => p.lines.filter(l => l.kind === kind).map(l => {
    const qty = lineQty(l, p.lines);
    const mult = num(l.mult ?? 1);
    return ['', l.variantLabel ? `${l.name} (${l.variantLabel})` : s(l.name),
      { text: mult !== 1 ? `${fmtNum(mult)} × ${fmtNum(qty)}` : fmtNum(qty), alignment: 'right' }, s(l.unit),
      { text: fmtNum(l.price), alignment: 'right' }, { text: fmtNum(lineTotal(l, p.lines)), alignment: 'right' }, s(l.remark)];
  });
  const sub = (label, v, bold = false) => ['', { text: label, colSpan: 4, alignment: 'right', bold }, '', '', '', { text: fmtNum(v), alignment: 'right', bold }, ''];
  const body = [['ITEM', 'DESCRIPTION', 'QTY', 'U.M.', 'UNIT COST', 'TOTAL COST', 'REMARKS'].map(x => ({ text: x, style: 'th' }))];
  [['material', '1.0', t.materials], ['labor', '2.0', t.labor], ['equipment', '3.0', t.equipment]].forEach(([k, n, v]) => {
    body.push([{ text: n, bold: true }, { text: s(p.headings?.[k]), bold: true, colSpan: 6 }, '', '', '', '', '']);
    body.push(...lineRows(k));
    body.push(sub('SUBTOTAL', v));
  });
  body.push(sub('SUBTOTAL', t.subtotal, true));
  if (num(p.cpOcm)) body.push(sub(`CP,OCM ${pct(p.cpOcm)}`, t.cpOcm));
  body.push(sub(`TOTAL UNIT COST FOR ${name}`, t.total, true));
  return [
    { text: '', pageBreak: 'before' },
    { text: `${name}: DETAILED UNIT PRICE ANALYSIS (EXHIBIT B)`, style: 'title2' },
    { table: { widths: [70, '*', 30, 120], body: [
      ['PAY ITEM NO.', 'PAY ITEM DESCRIPTION', 'QTY', 'PREREQUISITE'].map(x => ({ text: x, style: 'th' })),
      [no, s(p.description).toUpperCase(), '1', s(p.prerequisite)],
    ] }, layout: 'grid', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: [28, '*', 50, 46, 60, 66, 80], body }, layout: 'grid', fontSize: 8 },
    signature(q),
  ];
}

export function buildDocDefinition(quote, settings) {
  const totals = quoteTotals(quote);
  const dupas = totals.items.flatMap(it => {
    const svc = quote.services[it.serviceIdx];
    const p = svc.payItems[it.payItemIdx];
    return p.lumpSum ? [] : dupaPage(quote, svc, p, it.no, it.totals);
  });
  return {
    pageSize: 'A4', pageMargins: [36, 36, 36, 40],
    info: { title: pdfFilename(quote).replace(/\.pdf$/, ''), author: settings.company.name },
    defaultStyle: { fontSize: 9, lineHeight: 1.1 },
    styles: {
      h: { bold: true, fontSize: 9, color: '#0f6c5c', margin: [0, 0, 0, 3] },
      th: { bold: true, fillColor: '#e3f1ee', fontSize: 7.5 },
      title2: { bold: true, fontSize: 11, alignment: 'center', margin: [0, 4, 0, 8] },
    },
    footer: (page, pages) => ({ text: `${s(quote.code)}   ·   Page ${page} of ${pages}`, alignment: 'right', fontSize: 7, color: '#888', margin: [36, 12, 36, 0] }),
    content: [...boqPage(quote, settings, totals), ...proformaPage(quote, settings, totals), ...dupas],
  };
}

export function pdfFilename(q) {
  const clean = v => s(v).replace(/[/\\:*?"<>|]/g, '-').trim();
  return [clean(q.code), clean(q.client?.project)].filter(Boolean).concat(clean(q.tierName) || 'Custom').join(' - ')
    .replace(/^/, q.code || q.client?.project ? '' : 'Quotation - ') + '.pdf';
}

// pdfmake reports some failures (e.g. a damaged image) as uncaught errors from its own async work,
// (thrown or as an unhandled promise rejection), so listen for both while it runs and reject instead.
export function downloadPdf(quote, settings) {
  return new Promise((resolve, reject) => {
    const stop = () => { removeEventListener('error', onError); removeEventListener('unhandledrejection', onError); };
    const fail = e => { stop(); reject(e instanceof Error ? e : new Error(String(e))); };
    const onError = e => { e.preventDefault(); fail(e.reason ?? e.error ?? e.message); };
    addEventListener('error', onError);
    addEventListener('unhandledrejection', onError);
    try {
      globalThis.pdfMake.createPdf(buildDocDefinition(quote, settings)).download(pdfFilename(quote), () => {
        stop();
        resolve();
      });
    } catch (e) { fail(e); }
  });
}
