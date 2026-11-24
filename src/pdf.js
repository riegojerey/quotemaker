// Quotation PDF (pdfmake document definition), client-facing:
// cover → what's included → BOQ → Proforma Invoice → one DUPA per pay item. Tables keep the Casa layout.
import { quoteTotals, lineQty, lineTotal, fmtNum, num } from './calc.js';
import { aboutFor, aboutTitle } from './about.js';
import { isAlways } from './model.js';

// Brand: navy #1D3B5C (headings, table heads, totals, icon badges), orange #D9741A (small accents), white pages.
const C = { navy: '#1D3B5C', orange: '#D9741A', soft: '#EAF0F6', warm: '#FBEFE3', zebra: '#F7F9FB', ink: '#1F2328', muted: '#667085', line: '#E3E8EE' };
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
const rule = (w = 190, color = C.ink) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.7, lineColor: color }], margin: [0, 2, 0, 2] }); // fresh object each use: pdfmake mutates nodes during layout
const label = (k, v, w = 78) => ({ columns: [{ text: k, width: w, color: C.muted }, { text: s(v) }], margin: [0, 0, 0, 1.5] });

// Table look: navy header row, soft horizontal rules, zebra rows. `pad` shrinks for long tables so a page holds them.
const table = (pad = 3.5) => ({
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => C.line,
  fillColor: (row, node) => (row >= (node.table.headerRows || 0) && row % 2 === 0 ? C.zebra : null),
  paddingTop: () => pad, paddingBottom: () => pad, paddingLeft: () => 4, paddingRight: () => 4,
});
const TABLE = table();
const th = t => ({ text: t, style: 'th' });

// ---------- graphics: filled flat vectors (no strokes) ----------
// Service icons: white solid glyphs (24×24) on an orange round badge.
const W = '#FFFFFF';
const ICONS = {
  bulb: `<circle cx="12" cy="9" r="6.2" fill="${W}"/><rect x="9" y="14.5" width="6" height="3.2" rx="1" fill="${W}"/><rect x="10" y="18.6" width="4" height="2.4" rx="1.2" fill="${W}"/>`,
  climate: `<g fill="${W}"><rect x="10.9" y="2" width="2.2" height="20" rx="1.1"/><rect x="10.9" y="2" width="2.2" height="20" rx="1.1" transform="rotate(60 12 12)"/><rect x="10.9" y="2" width="2.2" height="20" rx="1.1" transform="rotate(-60 12 12)"/><circle cx="12" cy="12" r="3.2"/></g>`,
  lock: `<g fill="${W}"><rect x="5" y="10" width="14" height="11" rx="2.2"/><path d="M7.6 10V7.2a4.4 4.4 0 0 1 8.8 0V10h-2.4V7.2a2 2 0 0 0-4 0V10z"/></g><circle cx="12" cy="15.2" r="1.6" fill="#1D3B5C"/>`,
  camera: `<path d="M2.5 7.5h11.5l4 3.2h3.5v3.6H18l-4 3.2H2.5z" fill="${W}"/><circle cx="8.5" cy="12.5" r="2.6" fill="#1D3B5C"/>`,
  wifi: `<g fill="${W}"><path d="M3.5 10.2a12 12 0 0 1 17 0l-1.8 1.8a9.5 9.5 0 0 0-13.4 0z"/><path d="M6.8 13.5a7.4 7.4 0 0 1 10.4 0l-1.8 1.8a4.9 4.9 0 0 0-6.8 0z"/><circle cx="12" cy="18.2" r="2"/></g>`,
  curtain: `<g fill="${W}"><rect x="3" y="3" width="18" height="2.4" rx="1.2"/><path d="M4.5 5.4h6.5c0 6-2.2 11.3-6.5 15.6z"/><path d="M19.5 5.4H13c0 6 2.2 11.3 6.5 15.6z"/></g>`,
  gate: `<g fill="${W}"><rect x="3" y="4" width="2.6" height="17" rx="1"/><rect x="18.4" y="4" width="2.6" height="17" rx="1"/><rect x="3" y="7" width="18" height="2.4"/><rect x="7.6" y="9" width="2" height="12"/><rect x="11" y="9" width="2" height="12"/><rect x="14.4" y="9" width="2" height="12"/></g>`,
  shield: `<path d="M12 2.2l8.2 3.1v6.1c0 5.4-3.5 9-8.2 10.9-4.7-1.9-8.2-5.5-8.2-10.9V5.3z" fill="${W}"/><path d="M10.6 15.2l-3-3 1.6-1.6 1.4 1.4 4.2-4.2 1.6 1.6z" fill="#1D3B5C"/>`,
  mic: `<g fill="${W}"><rect x="8.8" y="2" width="6.4" height="12.4" rx="3.2"/><path d="M5 11h2.2a4.8 4.8 0 0 0 9.6 0H19a7 7 0 0 1-5.9 6.9V20h3v2.2H7.9V20h3v-2.1A7 7 0 0 1 5 11z"/></g>`,
  panel: `<rect x="4" y="2.5" width="16" height="19" rx="2.4" fill="${W}"/><g fill="#1D3B5C"><rect x="7" y="6" width="10" height="2.2" rx="1"/><rect x="7" y="10.2" width="10" height="2.2" rx="1"/><circle cx="12" cy="17" r="1.8"/></g>`,
  film: `<rect x="4" y="3" width="16" height="18" rx="1.6" fill="${W}"/><g fill="#1D3B5C"><rect x="11.1" y="3" width="1.8" height="18"/><rect x="4" y="11.1" width="16" height="1.8"/></g>`,
  tools: `<path d="M21 7.6a5.4 5.4 0 0 1-7.4 5L6.4 19.8a2.1 2.1 0 0 1-3-3l7.2-7.2A5.4 5.4 0 0 1 17.4 2.6l-3.1 3.1.9 2.9 2.9.9z" fill="${W}"/>`,
  house: `<path d="M12 2.8l9.4 8.3H19v9.9h-5.2v-6.2h-3.6V21H5v-9.9H2.6z" fill="${W}"/>`,
};
const ICON_RULES = [
  [/light|switch|lamp/i, 'bulb'], [/climate|aircon|\bac\b|hvac/i, 'climate'], [/lock|door/i, 'lock'],
  [/camera|cctv|surveillance/i, 'camera'], [/server|network|wifi|wi-fi/i, 'wifi'], [/cover|curtain|blind|shade/i, 'curtain'],
  [/mobili[sz]|management|supervis/i, 'tools'], [/gate/i, 'gate'], [/presence|sensor|alarm|entry|security/i, 'shield'], [/voice|alexa|google|speaker/i, 'mic'],
  [/panel|control|tablet|screen/i, 'panel'], [/film|glass|window/i, 'film'], [/wiring|electrical|requirement|condition|assessment/i, 'tools'],
];
const iconFor = title => ICON_RULES.find(([re]) => re.test(title))?.[1] ?? 'house';
const icon = (name, size) => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1D3B5C"/><g transform="translate(4.8 4.8) scale(0.6)">${ICONS[name]}</g></svg>`,
  width: size,
});

// Cover illustration: a lit smart home with a phone and connected devices, flat filled shapes only.
const HOUSE_ART = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <circle cx="170" cy="118" r="108" fill="#EEF3F8"/>
  <ellipse cx="165" cy="214" rx="140" ry="12" fill="#E6ECF2"/>
  <circle cx="58" cy="168" r="30" fill="#FBC9A3"/><circle cx="44" cy="150" r="20" fill="#F8B587"/><rect x="54" y="176" width="8" height="36" rx="3" fill="#B98A6A"/>
  <rect x="96" y="40" width="18" height="56" fill="#16304B"/>
  <rect x="82" y="104" width="168" height="108" fill="#FFFFFF"/>
  <rect x="216" y="104" width="34" height="108" fill="#F7EDE6"/>
  <path d="M64 110 L166 34 L268 110 Z" fill="#D9741A"/>
  <path d="M64 110 L166 34 L170 37 L72 112 Z" fill="#E8893A"/>
  <rect x="62" y="108" width="208" height="8" rx="3" fill="#1D3B5C"/>
  <rect x="100" y="128" width="40" height="34" rx="3" fill="#FFC85C"/><rect x="118.5" y="128" width="3" height="34" fill="#FFFFFF"/><rect x="100" y="143.5" width="40" height="3" fill="#FFFFFF"/>
  <rect x="180" y="128" width="40" height="34" rx="3" fill="#FFC85C"/><rect x="198.5" y="128" width="3" height="34" fill="#FFFFFF"/><rect x="180" y="143.5" width="40" height="3" fill="#FFFFFF"/>
  <rect x="148" y="162" width="28" height="50" rx="3" fill="#1D3B5C"/><circle cx="170" cy="188" r="2.2" fill="#FFC85C"/>
  <circle cx="166" cy="80" r="11" fill="#FFFFFF"/><path d="M160 80 a6 6 0 0 1 12 0 l-2 0 a4 4 0 0 0 -8 0 z" fill="#1D3B5C"/><circle cx="166" cy="82" r="1.8" fill="#1D3B5C"/>
  <g transform="translate(266 120)"><rect x="0" y="0" width="38" height="66" rx="7" fill="#1D3B5C"/><rect x="4" y="8" width="30" height="48" rx="3" fill="#EEF3F8"/>
    <rect x="8" y="14" width="22" height="9" rx="2" fill="#1D3B5C"/><rect x="8" y="27" width="10" height="10" rx="2" fill="#FFC85C"/><rect x="20" y="27" width="10" height="10" rx="2" fill="#FBC9A3"/>
    <rect x="8" y="41" width="22" height="9" rx="2" fill="#F8B587"/></g>
  <g transform="translate(236 46)"><circle cx="16" cy="16" r="16" fill="#1D3B5C"/><circle cx="16" cy="14" r="6" fill="#FFFFFF"/><rect x="13" y="19" width="6" height="4" rx="1" fill="#FFFFFF"/></g>
  <g transform="translate(30 70)"><circle cx="16" cy="16" r="16" fill="#1D3B5C"/><circle cx="16" cy="16" r="9" fill="#FFFFFF"/><rect x="15" y="9" width="2" height="8" rx="1" fill="#1D3B5C"/><circle cx="16" cy="17" r="2.4" fill="#1D3B5C"/></g>
</svg>`;

// ---------- shared blocks ----------
function brand(settings, { color = C.ink, logoWidth = 110 } = {}) {
  const c = settings.company;
  return c.logo ? { image: c.logo, fit: [logoWidth, 46] } : { text: s(c.name), bold: true, fontSize: 12, color };
}

function header(q, settings, title, dense = false) {
  const c = settings.company;
  const lw = dense ? 60 : 78;
  return [
    {
      ...(dense ? { fontSize: 7.5, lineHeight: 1.05 } : {}),
      columns: [
        { width: '*', stack: [
          brand(settings),
          ...(c.logo ? [{ text: s(c.name), bold: true, margin: [0, 4, 0, 0] }] : []),
          ...arr(c.address).filter(Boolean).map(a => ({ text: a, color: C.muted })),
          { text: [c.phone && `Phone: ${c.phone}`, c.email && `E-mail: ${c.email}`].filter(Boolean).join('   ·   '), color: C.muted },
          { text: s(c.website), color: C.orange },
        ] },
        { width: 'auto', stack: [
          { text: title, bold: true, fontSize: 16, alignment: 'right', color: C.navy },
          pill(s(q.tierName).toUpperCase(), 'right'),
          { text: `Contract Code: ${s(q.code)}`, alignment: 'right', margin: [0, 6, 0, 0], color: C.muted },
          { text: `Date: ${fmtDate(q.date)}`, alignment: 'right', color: C.muted },
        ] },
      ],
    },
    {
      table: { widths: dense ? [215, '*', 100] : ['*', '*', 120], body: [[
        { stack: [{ text: 'PROJECT INFORMATION', style: 'h' }, label('Owner Name:', q.client.owner, lw), label('Address:', q.client.address, lw),
          label('Project Name:', q.client.project, lw), label('E-mail:', q.client.email, lw)] },
        { stack: [{ text: 'CONTRACTOR INFORMATION', style: 'h' }, label('Enterprise:', q.contractor.enterprise, lw), label('Representative:', q.contractor.rep, lw),
          label('Contact Number:', q.contractor.contact, lw), label('E-mail:', q.contractor.email, lw)] },
        { stack: [{ text: 'GENERAL CONTRACTOR', style: 'h' }, { text: s(q.generalContractor) }] },
      ]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.soft, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5 },
      margin: [0, 8, 0, dense ? 4 : 8], ...(dense ? { fontSize: 7.5, lineHeight: 1.05 } : {}),
    },
  ];
}
// Long quotes (Casa has 16 sections) tighten the BOQ/Proforma pages so each stays on one page.
const isDense = totals => totals.items.length + new Set(totals.items.map(it => it.section)).size > 26;
const arr = v => (Array.isArray(v) ? v : []);

// Soft filled label, e.g. the tier name.
const pill = (text, alignment = 'left') => ({
  table: { body: [[{ text, bold: true, fontSize: 8.5, color: C.orange, fillColor: C.warm, characterSpacing: 0.8, margin: [7, 2, 7, 2] }]] },
  layout: 'noBorders', alignment, margin: [0, 4, 0, 0],
  ...(alignment === 'right' ? { width: 'auto' } : {}),
});

function signature(q, dense = false) {
  const p = q.preparer || {};
  const block = (title, sig, name, sub) => ({ width: '*', stack: [
    { text: title, bold: true, color: C.orange },
    sig ? { image: sig, width: dense ? 80 : 100, margin: [16, 0, 0, -6] } : { text: ' ', margin: [0, dense ? 12 : 16, 0, 0] },
    rule(175), { text: s(name), bold: true }, { text: s(sub), color: C.muted },
  ] });
  return {
    unbreakable: true, margin: [0, dense ? 6 : 10, 0, 0], columnGap: 20,
    columns: [
      block('Prepared By:', p.signature, p.name, p.title),
      block('Conforme:', null, q.conforme?.name, q.conforme?.title),
      { width: 110, stack: [{ text: 'Validity', bold: true, color: C.orange }, { text: validity(q) }] },
    ],
  };
}

const sectionTitle = text => ({
  table: { widths: [3, '*'], body: [[{ text: '', fillColor: C.orange }, { text, bold: true, fontSize: 13, color: C.ink, margin: [6, 1, 0, 1] }]] },
  layout: 'noBorders', margin: [0, 0, 0, 10],
});

// ---------- cover ----------
function coverPage(q, settings) {
  const p = q.preparer || {};
  return [
    { margin: [0, 6, 0, 0], ...brand(settings, { logoWidth: 130 }) },
    { text: 'SMART HOME PROPOSAL', fontSize: 24, bold: true, color: C.navy, margin: [0, 122, 0, 6] },
    { text: s(q.client.project) || 'Smart Home', fontSize: 15, color: C.ink, margin: [0, 0, 200, 3] },
    { text: s(q.client.address), color: C.muted, margin: [0, 0, 220, 8] },
    pill(s(q.tierName).toUpperCase()),
    { svg: HOUSE_ART, width: 225, absolutePosition: { x: 340, y: 168 } },
    // Lower half sits on the white part of the cover at a fixed spot, whatever the title length.
    {
      absolutePosition: { x: 40, y: 478 },
      columns: [
        { width: 257, stack: [
          { text: 'PREPARED FOR', style: 'kicker' },
          { text: s(q.client.owner), bold: true, fontSize: 13, color: C.navy },
          { text: s(q.client.email), color: C.muted },
          q.contractor.enterprise ? { text: `with ${q.contractor.enterprise}`, color: C.muted, margin: [0, 2, 0, 0] } : '',
        ] },
        { width: 257, stack: [
          { text: 'PREPARED BY', style: 'kicker' },
          { text: s(p.name), bold: true, fontSize: 13, color: C.navy },
          { text: s(p.title), color: C.muted },
        ] },
      ],
    },
    {
      absolutePosition: { x: 40, y: 572 },
      columns: [
        { width: 171, stack: [{ text: 'DATE', style: 'kicker' }, { text: longDate(q.date) }] },
        { width: 171, stack: [{ text: 'VALID UNTIL', style: 'kicker' }, { text: longDate(q.validTo) }] },
        { width: 171, stack: [{ text: 'CONTRACT CODE', style: 'kicker' }, { text: s(q.code) }] },
      ],
    },
  ];
}

// ---------- what's included ----------
// One paragraph per included service: its own description, else the default for its kind. No counts or prices.
function includedPage(q, totals) {
  const sections = [...new Set(totals.items.map(it => it.serviceIdx))].map(i => q.services[i]);
  // Always-included services (General Requirements) list their own items: floorplan, mobilization, project management.
  const entries = sections.flatMap(svc => (isAlways(svc) && !s(svc.about).trim()
    ? svc.payItems.map(p => ({ svc, title: s(p.description), about: aboutFor(p.description) }))
    : [{ svc, title: svc.title, about: s(svc.about).trim() || aboutFor(svc.title) }])).filter(e => e.about);
  const dense = entries.length > 8; // keep a full Elite list on one page
  return [
    { text: '', pageBreak: 'before' },
    sectionTitle("WHAT'S INCLUDED"),
    { text: `Your ${s(q.tierName)} smart home package.`, color: C.muted, margin: [0, -4, 0, dense ? 10 : 16] },
    ...entries.map(({ svc, title, about }) => ({
      unbreakable: true, margin: [0, 0, 0, dense ? 9 : 14], columnGap: 12,
      columns: [
        { ...icon(iconFor(title), dense ? 20 : 24), width: dense ? 20 : 24 },
        { width: '*', fontSize: dense ? 8.6 : 9.5, lineHeight: 1.25, text: [{ text: `${isAlways(svc) ? title : aboutTitle(title)}: `, bold: true, color: C.navy }, about] },
      ],
    })),
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
      body.push([{ text: `${it.section}.0`, bold: true, color: C.orange }, { text: svc.title, bold: true, colSpan: 8, color: C.orange }, '', '', '', '', '', '', '']);
    }
    const t = it.totals;
    body.push([it.no, p.description, p.um, '1', ...[t.materials, t.labor, t.equipment, t.total].map(v => ({ text: fmtNum(v), alignment: 'right' })), '']);
  }
  body.push(
    [{ text: 'SUBTOTAL (PHP):', colSpan: 7, alignment: 'right', bold: true }, '', '', '', '', '', '', { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true }, ''],
    [{ text: 'GRAND TOTAL (PHP)', colSpan: 7, alignment: 'right', bold: true, fontSize: 9.5, color: '#FFFFFF', fillColor: C.navy }, '', '', '', '', '', '',
      { text: fmtNum(totals.grandTotal), alignment: 'right', bold: true, fontSize: 9.5, color: '#FFFFFF', fillColor: C.navy }, { text: '', fillColor: C.navy }],
  );
  const rows = body.length;
  return { table: { headerRows: 1, widths: [24, '*', 26, 20, 56, 50, 50, 64, 40], body }, layout: table(rows > 30 ? 0.5 : rows > 20 ? 2 : 3.2),
    fontSize: rows > 30 ? 6.5 : 7.5, lineHeight: rows > 30 ? 1 : 1.15 };
}

const exhibitA = () => ({ text: 'BILL OF QUANTITIES (EXHIBIT A)', style: 'title2' });

function remarksBlock(q, dense = false) {
  const lines = s(q.remarks).split('\n').map(x => x.trimEnd()).filter(x => x.trim());
  if (!lines.length) return '';
  const n = dense && lines.length > 9 ? 3 : lines.length > 6 ? 2 : 1, per = Math.ceil(lines.length / n);
  const body = n > 1
    ? { columns: Array.from({ length: n }, (_, i) => ({ text: lines.slice(i * per, (i + 1) * per).join('\n') })), columnGap: 12 }
    : { text: lines.join('\n') };
  return { margin: [0, dense ? 5 : 8, 0, 0], fontSize: dense ? 6.8 : lines.length > 6 ? 7.5 : 8.5, lineHeight: dense ? 1 : 1.15, stack: [{ text: 'Remarks:', bold: true, color: C.navy }, body] };
}

function boqPage(q, settings, totals) {
  return [
    { text: '', pageBreak: 'before' },
    ...header(q, settings, 'BILL OF QUANTITIES', isDense(totals)), exhibitA(), boqTable(q, totals),
    remarksBlock(q, isDense(totals)),
    settings.footerNote ? { margin: [0, 6, 0, 0], fontSize: 7.5, text: [{ text: 'Note: ', bold: true, color: C.navy }, { text: settings.footerNote, italics: true, color: C.muted }] } : '',
    signature(q, isDense(totals)),
  ];
}

function proformaPage(q, settings, totals) {
  const b = settings.bank || {};
  return [
    { text: '', pageBreak: 'before' },
    ...header(q, settings, 'PROFORMA INVOICE', isDense(totals)), exhibitA(), boqTable(q, totals),
    { columnGap: 16, margin: [0, isDense(totals) ? 6 : 10, 0, 0], columns: [
    { width: '*', stack: [{ text: 'PAYMENT TERMS', style: 'h' },
    { table: { headerRows: 1, widths: ['*', 40, 62, '*'], body: [
      ['Payment Terms', 'Percentage', 'Amount', 'Due Date'].map(th),
      ...totals.terms.map(t => [s(t.label), { text: pct(t.pct), alignment: 'right' }, { text: fmtNum(t.amount), alignment: 'right' }, s(t.due)]),
      [{ text: 'Total', bold: true, fillColor: C.soft }, { text: `${+totals.termsPct.toFixed(2)}%`, alignment: 'right', bold: true, fillColor: C.soft },
        { text: fmtNum(totals.terms.reduce((a, t) => a + t.amount, 0)), alignment: 'right', bold: true, fillColor: C.soft }, { text: '', fillColor: C.soft }],
    ] }, layout: table(isDense(totals) ? 0.6 : 2), fontSize: isDense(totals) ? 6.8 : 7.5, lineHeight: isDense(totals) ? 1 : 1.15 }] },
    { width: 150, stack: [
      { text: 'PAYMENT CHANNEL', style: 'h' }, { text: s(b.name), bold: true },
      { text: 'Account Number', color: C.muted, margin: [0, 4, 0, 0] }, { text: s(b.accountNo) },
      { text: 'Account Name', color: C.muted, margin: [0, 4, 0, 0] }, { text: s(b.accountName) },
    ] }] },
    signature(q, isDense(totals)),
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
    body.push([{ text: n, bold: true, color: C.orange }, { text: s(p.headings?.[k]), bold: true, colSpan: 6, color: C.orange }, '', '', '', '', '']);
    body.push(...lineRows(k));
    body.push(sub('SUBTOTAL', v, { color: C.muted }));
  });
  body.push(sub('SUBTOTAL', t.subtotal, { bold: true }));
  if (num(p.cpOcm)) body.push(sub(`CP,OCM ${pct(p.cpOcm)}`, t.cpOcm));
  body.push(sub(`TOTAL UNIT COST FOR ${name}`, t.total, { bold: true, color: '#FFFFFF', fillColor: C.navy }));
  return [
    { text: '', pageBreak: 'before' },
    { columnGap: 8, columns: [{ ...icon(iconFor(svc.title), 20), width: 20 }, { width: '*', text: `${name}: DETAILED UNIT PRICE ANALYSIS (EXHIBIT B)`, style: 'title2', alignment: 'left', margin: [0, 3, 0, 8] }] },
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
      h: { bold: true, fontSize: 9, color: C.orange, margin: [0, 0, 0, 4], characterSpacing: 0.5 },
      th: { bold: true, fillColor: C.navy, color: '#FFFFFF', fontSize: 7.5 },
      title2: { bold: true, fontSize: 11, alignment: 'center', margin: [0, 2, 0, 6], color: C.navy },
      kicker: { fontSize: 8, bold: true, color: C.orange, characterSpacing: 1, margin: [0, 0, 0, 2] },
    },
    // Navy band with a thin orange edge across the top of every page.
    background: (page, size) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: 6, color: C.navy }, { type: 'rect', x: 0, y: 6, w: size.width, h: 3, color: C.orange }] }),
    footer: (page, pages) => (page === 1 ? { text: contacts, alignment: 'center', fontSize: 7.5, color: C.muted, margin: [40, 16, 40, 0] } : {
      margin: [40, 10, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W - 80, y2: 0, lineWidth: 0.8, lineColor: C.orange }] },
        { columns: [{ text: contacts, fontSize: 7, color: C.muted }, { text: `${s(quote.code)}  ·  Page ${page} of ${pages}`, alignment: 'right', fontSize: 7, color: C.muted, width: 'auto' }], margin: [0, 5, 0, 0] },
      ],
    }),
    content: [
      ...coverPage(quote, settings),
      ...includedPage(quote, totals),
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
