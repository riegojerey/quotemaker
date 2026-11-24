// Quotation PDF (pdfmake document definition), client-facing:
// cover → what's included → BOQ → Proforma Invoice → one DUPA per pay item. Tables keep the Casa layout.
import { quoteTotals, lineQty, lineTotal, fmtNum, num } from './calc.js';

// Orange is an accent only (rules, labels, icons); pages stay white and text dark so the document reads as formal.
const C = { orange: '#F26B1D', deep: '#C2410C', soft: '#FFF4EC', zebra: '#FAFAFA', ink: '#1F2328', muted: '#6B6F76', line: '#E6E1DC' };
const PAGE_W = 595.28;

const fmtDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};
const longDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const validity = q => `${fmtDate(q.validFrom)} ~ ${fmtDate(q.validTo)}`;
const pct = f => `${+(num(f) * 100).toFixed(2)}%`;
const s = v => (v == null ? '' : String(v));
const qtyText = n => (Number.isInteger(num(n)) ? String(num(n)) : fmtNum(n));
const peso = n => `₱${fmtNum(n)}`;
const rule = (w = 190, color = C.ink) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.7, lineColor: color }], margin: [0, 2, 0, 2] }); // fresh object each use: pdfmake mutates nodes during layout
const label = (k, v) => ({ columns: [{ text: k, width: 78, color: C.muted }, { text: s(v) }], margin: [0, 0, 0, 1.5] });

// Table look: orange header row, soft horizontal rules, zebra rows.
const TABLE = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => C.line,
  fillColor: (row, node) => (row >= (node.table.headerRows || 0) && row % 2 === 0 ? C.zebra : null),
  paddingTop: () => 3.5, paddingBottom: () => 3.5, paddingLeft: () => 4, paddingRight: () => 4,
};
const th = t => ({ text: t, style: 'th' });

// ---------- icons (24×24 line icons, stroke color filled in) ----------
const ICONS = {
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  climate: '<path d="M12 2v20M4.9 6l14.2 12M4.9 18L19.1 6M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>',
  camera: '<path d="M3 7h12l3 3h3v4h-3l-3 3H3z"/><circle cx="9" cy="12" r="2.5"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  curtain: '<path d="M3 3h18M5 3v18M19 3v18M5 3c0 6 4 9 6 18M19 3c0 6-4 9-6 18"/>',
  gate: '<path d="M3 21V5M21 21V5M3 9h18M3 15h18M8 9v12M13 9v12M18 9v12"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  panel: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/>',
  film: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  house: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6"/>',
};
const ICON_RULES = [
  [/light|switch|lamp/i, 'bulb'], [/climate|aircon|\bac\b|hvac/i, 'climate'], [/lock|door/i, 'lock'],
  [/camera|cctv|surveillance/i, 'camera'], [/server|network|wifi|wi-fi/i, 'wifi'], [/cover|curtain|blind|shade/i, 'curtain'],
  [/gate/i, 'gate'], [/presence|sensor|alarm|entry|security/i, 'shield'], [/voice|alexa|google|speaker/i, 'mic'],
  [/panel|control|tablet|screen/i, 'panel'], [/film|glass|window/i, 'film'], [/wiring|electrical|requirement|condition|assessment/i, 'tools'],
];
const iconFor = title => ICON_RULES.find(([re]) => re.test(title))?.[1] ?? 'house';
const icon = (name, color, size) => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  width: size,
});

const HOUSE_ART = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="200" viewBox="0 0 240 200" fill="none" stroke="#F26B1D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M30 100 L120 30 L210 100"/><path d="M48 86 V180 H192 V86"/><path d="M104 180 V136 H136 V180"/>
  <rect x="62" y="108" width="28" height="24" rx="2"/><rect x="150" y="108" width="28" height="24" rx="2"/>
  <path d="M76 108 V132 M62 120 H90 M164 108 V132 M150 120 H178"/>
  <path d="M96 64 a34 34 0 0 1 48 0" opacity=".9"/><path d="M104 74 a22 22 0 0 1 32 0" opacity=".9"/><circle cx="120" cy="84" r="3" fill="#F26B1D"/>
  <path d="M10 180 H230" opacity=".6"/>
</svg>`;

// ---------- shared blocks ----------
function brand(settings, { color = C.ink, logoWidth = 110 } = {}) {
  const c = settings.company;
  return c.logo ? { image: c.logo, fit: [logoWidth, 46] } : { text: s(c.name), bold: true, fontSize: 12, color };
}

function header(q, settings, title) {
  const c = settings.company;
  return [
    {
      columns: [
        { width: '*', stack: [
          brand(settings),
          ...(c.logo ? [{ text: s(c.name), bold: true, margin: [0, 4, 0, 0] }] : []),
          ...arr(c.address).filter(Boolean).map(a => ({ text: a, color: C.muted })),
          { text: [c.phone && `Phone: ${c.phone}`, c.email && `E-mail: ${c.email}`].filter(Boolean).join('   ·   '), color: C.muted },
          { text: s(c.website), color: C.deep },
        ] },
        { width: 'auto', stack: [
          { text: title, bold: true, fontSize: 16, alignment: 'right', color: C.ink },
          pill(s(q.tierName).toUpperCase(), 'right'),
          { text: `Contract Code: ${s(q.code)}`, alignment: 'right', margin: [0, 6, 0, 0], color: C.muted },
          { text: `Date: ${fmtDate(q.date)}`, alignment: 'right', color: C.muted },
        ] },
      ],
    },
    {
      table: { widths: ['*', '*', 120], body: [[
        { stack: [{ text: 'PROJECT INFORMATION', style: 'h' }, label('Owner Name:', q.client.owner), label('Address:', q.client.address),
          label('Project Name:', q.client.project), label('E-mail:', q.client.email)] },
        { stack: [{ text: 'CONTRACTOR INFORMATION', style: 'h' }, label('Enterprise:', q.contractor.enterprise), label('Representative:', q.contractor.rep),
          label('Contact Number:', q.contractor.contact), label('E-mail:', q.contractor.email)] },
        { stack: [{ text: 'GENERAL CONTRACTOR', style: 'h' }, { text: s(q.generalContractor) }] },
      ]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.soft, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 7, paddingBottom: () => 7 },
      margin: [0, 12, 0, 12],
    },
  ];
}
const arr = v => (Array.isArray(v) ? v : []);

// Outlined label, e.g. the tier name.
const OUTLINE = { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => C.orange, vLineColor: () => C.orange };
const pill = (text, alignment = 'left') => ({
  table: { body: [[{ text, bold: true, fontSize: 8.5, color: C.deep, characterSpacing: 0.8, margin: [5, 0.5, 5, 0.5] }]] },
  layout: OUTLINE, alignment, margin: [0, 4, 0, 0],
  ...(alignment === 'right' ? { width: 'auto' } : {}),
});

function signature(q) {
  const p = q.preparer || {};
  return {
    unbreakable: true, margin: [0, 18, 0, 0],
    stack: [
      { columns: [
        { width: 220, stack: [
          { text: 'Prepared By:', bold: true, color: C.deep },
          p.signature ? { image: p.signature, width: 110, margin: [20, 2, 0, -6] } : { text: ' ', margin: [0, 18, 0, 0] },
          rule(), { text: s(p.name), bold: true }, { text: s(p.title), color: C.muted },
        ] },
        { width: '*', text: '' },
        { width: 160, stack: [{ text: 'Validity', bold: true, color: C.deep }, { text: validity(q) }] },
      ] },
      { width: 220, margin: [0, 16, 0, 0], stack: [
        { text: 'Conforme:', bold: true, color: C.deep }, { text: ' ', margin: [0, 14, 0, 0] }, rule(),
        { text: s(q.conforme?.name), bold: true }, { text: s(q.conforme?.title), color: C.muted },
      ] },
    ],
  };
}

const sectionTitle = text => ({
  table: { widths: [3, '*'], body: [[{ text: '', fillColor: C.orange }, { text, bold: true, fontSize: 13, color: C.ink, margin: [6, 1, 0, 1] }]] },
  layout: 'noBorders', margin: [0, 0, 0, 10],
});

// ---------- cover ----------
function coverPage(q, settings, totals) {
  const p = q.preparer || {};
  return [
    { margin: [0, 6, 0, 0], ...brand(settings, { logoWidth: 130 }) },
    { text: 'SMART HOME PROPOSAL', fontSize: 24, bold: true, color: C.ink, margin: [0, 122, 0, 6] },
    { text: s(q.client.project) || 'Smart Home', fontSize: 15, color: C.ink, margin: [0, 0, 200, 3] },
    { text: s(q.client.address), color: C.muted, margin: [0, 0, 220, 8] },
    pill(s(q.tierName).toUpperCase()),
    { svg: HOUSE_ART, width: 150, absolutePosition: { x: 400, y: 170 } },
    // Lower half sits on the white part of the cover at a fixed spot, whatever the title length.
    {
      absolutePosition: { x: 40, y: 478 },
      columns: [
        { width: 257, stack: [
          { text: 'PREPARED FOR', style: 'kicker' },
          { text: s(q.client.owner), bold: true, fontSize: 13 },
          { text: s(q.client.email), color: C.muted },
          q.contractor.enterprise ? { text: `with ${q.contractor.enterprise}`, color: C.muted, margin: [0, 2, 0, 0] } : '',
        ] },
        { width: 257, stack: [
          { text: 'PREPARED BY', style: 'kicker' },
          { text: s(p.name), bold: true, fontSize: 13 },
          { text: s(p.title), color: C.muted },
        ] },
      ],
    },
    {
      absolutePosition: { x: 40, y: 570 },
      columns: [
        { width: 257, stack: [
          { text: 'DATE', style: 'kicker' }, { text: longDate(q.date) },
          { text: 'VALID UNTIL', style: 'kicker', margin: [0, 10, 0, 0] }, { text: longDate(q.validTo) },
          { text: 'CONTRACT CODE', style: 'kicker', margin: [0, 10, 0, 0] }, { text: s(q.code) },
        ] },
        { width: 257, table: { widths: ['*'], body: [[{
          stack: [{ text: 'TOTAL INVESTMENT', style: 'kicker' },
            { text: peso(totals.grandTotal), color: C.ink, bold: true, fontSize: 20, margin: [0, 2, 0, 2] },
            { text: 'Full breakdown and payment terms on the following pages', color: C.muted, fontSize: 8 }],
          margin: [12, 10, 12, 10],
        }]] }, layout: OUTLINE },
      ],
    },
  ];
}

// ---------- what's included ----------
function includedPage(q, settings, totals) {
  const bySection = new Map();
  for (const it of totals.items) {
    const list = bySection.get(it.serviceIdx) ?? [];
    list.push(it);
    bySection.set(it.serviceIdx, list);
  }
  const cards = [...bySection].map(([si, items]) => {
    const svc = q.services[si];
    const bullets = items.flatMap(it => {
      const p = svc.payItems[it.payItemIdx];
      const devices = p.lumpSum ? [] : p.lines.filter(l => l.kind === 'material' && num(lineQty(l, p.lines)) > 0);
      return devices.length
        ? devices.map(l => ({ text: [`${qtyText(lineQty(l, p.lines))} × ${s(l.name)}`, l.variantLabel ? { text: ` (${l.variantLabel})`, color: C.muted } : ''] }))
        : [s(p.description)];
    }).map(b => (typeof b === 'string' ? b : b.text[1] ? b : b.text[0]));
    const total = items.reduce((a, it) => a + it.totals.total, 0);
    return {
      unbreakable: true, margin: [0, 0, 0, 8],
      table: { widths: [34, '*', 90], body: [[
        { ...icon(iconFor(svc.title), C.orange, 18), margin: [2, 1, 0, 0] },
        { stack: [{ text: s(svc.title), bold: true, fontSize: 10 }, { ul: bullets, markerColor: C.muted, color: C.ink, margin: [0, 3, 0, 0] }] },
        { text: peso(total), alignment: 'right', bold: true, color: C.ink },
      ]] },
      layout: { hLineWidth: (i, node) => (i === node.table.body.length ? 0.5 : 0), hLineColor: () => C.line, vLineWidth: i => (i === 0 ? 2 : 0), vLineColor: () => C.orange,
        paddingTop: () => 7, paddingBottom: () => 9, paddingLeft: () => 8, paddingRight: () => 4 },
    };
  });
  const remarks = s(q.remarks).split('\n').map(x => x.trim()).filter(Boolean);
  return [
    { text: '', pageBreak: 'before' },
    sectionTitle("WHAT'S INCLUDED"),
    { text: `Your ${s(q.tierName)} smart home package, service by service.`, color: C.muted, margin: [0, -4, 0, 12] },
    ...cards,
    remarks.length ? { margin: [0, 6, 0, 0], stack: [{ text: 'HIGHLIGHTS', style: 'kicker' }, { ul: remarks, markerColor: C.muted, margin: [0, 4, 0, 0] }] } : '',
    {
      margin: [0, 14, 0, 0], unbreakable: true,
      table: { widths: ['*', 'auto'], body: [[
        { text: 'TOTAL INVESTMENT', bold: true, color: C.ink, margin: [0, 7, 0, 7] },
        { text: peso(totals.grandTotal), bold: true, fontSize: 14, color: C.deep, alignment: 'right', margin: [0, 4, 0, 4] },
      ]] },
      layout: { hLineWidth: i => (i === 0 ? 1.2 : 0.5), hLineColor: i => (i === 0 ? C.orange : C.line), vLineWidth: () => 0 },
    },
    settings.footerNote ? { text: settings.footerNote, italics: true, color: C.muted, fontSize: 8, margin: [0, 10, 0, 0] } : '',
  ];
}

// ---------- BOQ / proforma / DUPA ----------
function boqTable(q, totals) {
  const body = [[
    'NO.', 'ITEM/DESCRIPTION', 'U.M.', 'QTY', 'UNIT PRICE (MATERIALS)', 'UNIT PRICE (LABOR)', 'UNIT PRICE (EQUIPMENT)', 'UNIT PRICE (TOTAL+CP,OCM)', 'REMARKS',
  ].map(th)];
  let lastSection = 0;
  for (const it of totals.items) {
    const svc = q.services[it.serviceIdx];
    const p = svc.payItems[it.payItemIdx];
    if (it.section !== lastSection) {
      lastSection = it.section;
      body.push([{ text: `${it.section}.0`, bold: true, color: C.deep }, { text: svc.title, bold: true, colSpan: 8, color: C.deep }, '', '', '', '', '', '', '']);
    }
    const t = it.totals;
    body.push([it.no, p.description, p.um, '1', ...[t.materials, t.labor, t.equipment, t.total].map(v => ({ text: fmtNum(v), alignment: 'right' })), '']);
  }
  body.push(
    [{ text: 'SUBTOTAL (PHP):', colSpan: 7, alignment: 'right', bold: true }, '', '', '', '', '', '', { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true }, ''],
    [{ text: 'GRAND TOTAL (PHP)', colSpan: 7, alignment: 'right', bold: true, fontSize: 10, color: C.deep, fillColor: C.soft }, '', '', '', '', '', '',
      { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true, fontSize: 10, color: C.deep, fillColor: C.soft }, { text: '', fillColor: C.soft }],
  );
  return { table: { headerRows: 1, widths: [24, '*', 26, 20, 56, 50, 50, 64, 40], body }, layout: TABLE, fontSize: 7.5 };
}

const exhibitA = () => ({ text: 'BILL OF QUANTITIES (EXHIBIT A)', style: 'title2' });

function boqPage(q, settings, totals) {
  return [
    { text: '', pageBreak: 'before' },
    ...header(q, settings, 'BILL OF QUANTITIES'), exhibitA(), boqTable(q, totals),
    q.remarks?.trim() ? { margin: [0, 10, 0, 0], stack: [{ text: 'Remarks:', bold: true, color: C.deep }, { text: q.remarks }] } : '',
    settings.footerNote ? { margin: [0, 8, 0, 0], stack: [{ text: 'Note:', bold: true, color: C.deep }, { text: settings.footerNote, italics: true, color: C.muted }] } : '',
    signature(q),
  ];
}

function proformaPage(q, settings, totals) {
  const b = settings.bank || {};
  return [
    { text: '', pageBreak: 'before' },
    ...header(q, settings, 'PROFORMA INVOICE'), exhibitA(), boqTable(q, totals),
    { text: 'PAYMENT TERMS', style: 'h', margin: [0, 14, 0, 4] },
    { table: { headerRows: 1, widths: ['*', 60, 90, '*'], body: [
      ['Payment Terms', 'Percentage', 'Amount', 'Due Date'].map(th),
      ...totals.terms.map(t => [s(t.label), { text: pct(t.pct), alignment: 'right' }, { text: fmtNum(t.amount), alignment: 'right' }, s(t.due)]),
      [{ text: 'Total', bold: true, fillColor: C.soft }, { text: `${+totals.termsPct.toFixed(2)}%`, alignment: 'right', bold: true, fillColor: C.soft },
        { text: fmtNum(totals.terms.reduce((a, t) => a + t.amount, 0)), alignment: 'right', bold: true, fillColor: C.soft }, { text: '', fillColor: C.soft }],
    ] }, layout: TABLE },
    { margin: [0, 12, 0, 0], stack: [
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
      { text: fmtNum(l.price), alignment: 'right' }, { text: fmtNum(lineTotal(l, p.lines)), alignment: 'right' }, { text: s(l.remark), color: C.muted }];
  });
  const sub = (label, v, opts = {}) => ['', { text: label, colSpan: 4, alignment: 'right', ...opts }, '', '', '', { text: fmtNum(v), alignment: 'right', ...opts }, { text: '', fillColor: opts.fillColor }];
  const body = [['ITEM', 'DESCRIPTION', 'QTY', 'U.M.', 'UNIT COST', 'TOTAL COST', 'REMARKS'].map(th)];
  [['material', '1.0', t.materials], ['labor', '2.0', t.labor], ['equipment', '3.0', t.equipment]].forEach(([k, n, v]) => {
    body.push([{ text: n, bold: true, color: C.deep }, { text: s(p.headings?.[k]), bold: true, colSpan: 6, color: C.deep }, '', '', '', '', '']);
    body.push(...lineRows(k));
    body.push(sub('SUBTOTAL', v, { color: C.muted }));
  });
  body.push(sub('SUBTOTAL', t.subtotal, { bold: true }));
  if (num(p.cpOcm)) body.push(sub(`CP,OCM ${pct(p.cpOcm)}`, t.cpOcm));
  body.push(sub(`TOTAL UNIT COST FOR ${name}`, t.total, { bold: true, color: C.deep, fillColor: C.soft }));
  return [
    { text: '', pageBreak: 'before' },
    { columnGap: 8, columns: [{ ...icon(iconFor(svc.title), C.orange, 20), width: 20 }, { width: '*', text: `${name}: DETAILED UNIT PRICE ANALYSIS (EXHIBIT B)`, style: 'title2', alignment: 'left', margin: [0, 3, 0, 8] }] },
    { table: { widths: [70, '*', 30, 120], body: [
      ['PAY ITEM NO.', 'PAY ITEM DESCRIPTION', 'QTY', 'PREREQUISITE'].map(th),
      [no, s(p.description).toUpperCase(), '1', s(p.prerequisite)],
    ] }, layout: TABLE, margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: [28, '*', 50, 46, 60, 66, 80], body }, layout: TABLE, fontSize: 8 },
    signature(q),
  ];
}

export function buildDocDefinition(quote, settings) {
  const totals = quoteTotals(quote);
  const c = settings.company;
  const dupas = totals.items.flatMap(it => {
    const svc = quote.services[it.serviceIdx];
    const p = svc.payItems[it.payItemIdx];
    return p.lumpSum ? [] : dupaPage(quote, svc, p, it.no, it.totals);
  });
  const contacts = [c.name, c.phone, c.email, c.website].filter(Boolean).join('   ·   ');
  return {
    pageSize: 'A4', pageMargins: [40, 44, 40, 46],
    info: { title: pdfFilename(quote).replace(/\.pdf$/, ''), author: c.name },
    defaultStyle: { fontSize: 9, lineHeight: 1.15, color: C.ink },
    styles: {
      h: { bold: true, fontSize: 9, color: C.deep, margin: [0, 0, 0, 4], characterSpacing: 0.5 },
      th: { bold: true, fillColor: C.soft, color: C.deep, fontSize: 7.5 },
      title2: { bold: true, fontSize: 11.5, alignment: 'center', margin: [0, 4, 0, 8], color: C.ink },
      kicker: { fontSize: 8, bold: true, color: C.orange, characterSpacing: 1, margin: [0, 0, 0, 2] },
    },
    // A thin orange band on every page; the cover adds a rule above its details.
    background: (page, size) => ({ canvas: [
      { type: 'rect', x: 0, y: 0, w: size.width, h: 5, color: C.orange },
      ...(page === 1 ? [{ type: 'line', x1: 40, y1: 452, x2: size.width - 40, y2: 452, lineWidth: 0.6, lineColor: C.line }] : []),
    ] }),
    footer: (page, pages) => (page === 1 ? { text: contacts, alignment: 'center', fontSize: 7.5, color: C.muted, margin: [40, 16, 40, 0] } : {
      margin: [40, 10, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W - 80, y2: 0, lineWidth: 0.6, lineColor: C.line }] },
        { columns: [{ text: contacts, fontSize: 7, color: C.muted }, { text: `${s(quote.code)}  ·  Page ${page} of ${pages}`, alignment: 'right', fontSize: 7, color: C.muted, width: 'auto' }], margin: [0, 5, 0, 0] },
      ],
    }),
    content: [
      ...coverPage(quote, settings, totals),
      ...includedPage(quote, settings, totals),
      ...boqPage(quote, settings, totals),
      ...proformaPage(quote, settings, totals),
      ...dupas,
    ],
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
