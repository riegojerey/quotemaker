import { esc, field, bindInputs, debounce, money, showValue, readInput } from './dom.js';
import { mountTerms } from './settings.js';
import { addService, removeService, applyTier, suggestCode, addMonths } from '../model.js';
import { quoteTotals, payItemTotals, lineQty, lineTotal, fmtNum, num } from '../calc.js';
import { downloadPdf } from '../pdf.js';

const KINDS = [['material', 'Materials'], ['labor', 'Labor'], ['equipment', 'Equipment']];

export function render(main, ctx, id) {
  const stored = ctx.data.quotes.find(q => q.id === id);
  if (!stored) { main.innerHTML = '<div class="card">Quote not found. <a href="#/quotes">Back to quotes</a></div>'; return; }
  const q = structuredClone(stored); // one object for the whole view: inputs are bound to it
  const { services, catalogue, settings } = ctx.data;
  const tiers = [...ctx.data.tiers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let status;
  const persist = async () => {
    q.updatedAt = new Date().toISOString();
    await ctx.save('quotes', structuredClone(q));
    status.textContent = 'Saved';
  };
  const saveLater = debounce(persist, 500);
  const changed = () => { status.textContent = 'Saving…'; saveLater(); refreshTotals(); };

  main.innerHTML = `
    <div class="spread"><h1>Quote <span class="tag" data-tier-label>${esc(q.tierName)}</span></h1><a href="#/quotes">← All quotes</a></div>
    <section class="card" data-client>
      <h2>Client &amp; project</h2>
      <div class="row" style="margin-bottom:10px" data-prepared></div>
      <div class="cols">
        <label class="field"><span>Contract code</span><div class="row" style="flex-wrap:nowrap">
          <input data-path="code" value="${esc(q.code)}"><button class="ghost" data-suggest title="Suggest from date and owner">Suggest</button></div></label>
        ${field('Date', q, 'date', { type: 'date' })}
        ${field('Valid from', q, 'validFrom', { type: 'date' })}
        ${field('Valid to', q, 'validTo', { type: 'date' })}
      </div>
      <h3>Project information</h3>
      <div class="cols">
        ${field('Owner name', q, 'client.owner')}${field('Project name', q, 'client.project')}${field('E-mail', q, 'client.email', { type: 'email' })}
      </div>
      ${field('Address', q, 'client.address', { type: 'textarea', attrs: 'rows="2"' })}
      <h3>Contractor information</h3>
      <div class="cols">
        ${field('Enterprise', q, 'contractor.enterprise')}${field('Representative', q, 'contractor.rep')}
        ${field('Contact number', q, 'contractor.contact')}${field('E-mail', q, 'contractor.email', { type: 'email' })}
        ${field('General contractor', q, 'generalContractor')}
      </div>
    </section>
    <section class="card" data-pick></section>
    <section data-services></section>
    <section class="card" data-end>
      <h2>Remarks &amp; terms</h2>
      ${field('Remarks (printed under the BOQ)', q, 'remarks', { type: 'textarea', attrs: 'rows="5" placeholder="e.g. Smart Climate in all sixteen (16) AC units"' })}
      <div class="cols">${field('Conforme name', q, 'conforme.name')}${field('Conforme title', q, 'conforme.title')}</div>
      <h3>Payment terms</h3><div data-terms></div>
    </section>
    <div class="footer-bar"><div class="inner">
      <div><span class="muted">Grand total</span> <span class="total" data-grand></span> <span class="muted" data-status></span></div>
      <div class="row"><button class="ghost" data-save>Save</button><button data-pdf>Download PDF</button></div>
    </div></div>`;
  status = main.querySelector('[data-status]');

  // ---------- client fields ----------
  const client = main.querySelector('[data-client]');
  let lastOwner = q.client.owner;
  bindInputs(client, q, el => {
    const path = el.dataset.path;
    if (path === 'date' && q.date) {
      q.validFrom = q.date;
      q.validTo = addMonths(q.date, settings.validityMonths ?? 1);
      client.querySelector('[data-path="validFrom"]').value = q.validFrom;
      client.querySelector('[data-path="validTo"]').value = q.validTo;
    }
    if (path === 'client.owner') {
      if (!q.conforme.name || q.conforme.name === lastOwner) {
        q.conforme.name = q.client.owner;
        main.querySelector('[data-path="conforme.name"]').value = q.conforme.name;
      }
      lastOwner = q.client.owner;
    }
    changed();
  });
  // Prepared by: kept as saved on the quote; switching to the current Settings identity is explicit.
  const prepared = client.querySelector('[data-prepared]');
  const drawPrepared = () => {
    const mine = settings.preparer || {};
    const same = mine.name === q.preparer?.name && mine.signature === q.preparer?.signature;
    prepared.innerHTML = `<span class="muted">Prepared by:</span> <b>${esc(q.preparer?.name) || '<span class="bad">nobody yet</span>'}</b>
      ${q.preparer?.signature ? '<span class="tag">signed</span>' : ''}
      ${mine.name && !same ? '<button class="ghost" data-use-mine>Use my name &amp; signature</button>' : ''}
      ${mine.name ? '' : '<a href="#/settings">Set up your name &amp; signature</a>'}`;
  };
  drawPrepared();
  prepared.addEventListener('click', e => {
    if (!e.target.closest('[data-use-mine]')) return;
    q.preparer = structuredClone(settings.preparer);
    drawPrepared();
    changed();
  });
  client.querySelector('[data-suggest]').onclick = () => {
    q.code = suggestCode(q.date, q.client.owner);
    client.querySelector('[data-path="code"]').value = q.code;
    changed();
  };

  // ---------- remarks, conforme, terms ----------
  const end = main.querySelector('[data-end]');
  bindInputs(end, q, changed);
  mountTerms(end.querySelector('[data-terms]'), q.paymentTerms, changed);

  // ---------- tier + service picker ----------
  const pick = main.querySelector('[data-pick]');
  const drawPick = () => {
    const on = new Set(q.services.map(s => s.serviceId));
    pick.innerHTML = `
      <h2>Services</h2>
      <div class="row" style="margin-bottom:10px">${tiers.map(t => `<button class="chip ${q.tierName === t.name ? 'on' : ''}" data-tier="${esc(t.id)}"
        ${t.serviceIds.length ? '' : 'disabled title="No services in this tier yet (Services & Tiers)"'}>${esc(t.name)}</button>`).join('')}
        <span class="muted">or tick services below (makes it Custom)</span></div>
      <div class="checks">${[...services].sort((a, b) => a.order - b.order).map(s => `<label><input type="checkbox" data-svc="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}> ${esc(s.title)}</label>`).join('')}
        ${q.services.filter(s => !services.some(x => x.id === s.serviceId)).map(s => `<label><input type="checkbox" data-svc="${esc(s.serviceId)}" checked> ${esc(s.title)} <span class="muted">(no longer in templates)</span></label>`).join('')}</div>`;
    main.querySelector('[data-tier-label]').textContent = q.tierName;
  };
  pick.addEventListener('click', e => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    const tier = tiers.find(t => t.id === b.dataset.tier);
    const leaving = q.services.filter(s => !tier.serviceIds.includes(s.serviceId));
    if (leaving.length && !confirm(`Switch to ${tier.name}? This removes: ${leaving.map(s => s.title).join(', ')}.`)) return;
    Object.assign(q, applyTier(q, tier, services, catalogue, tiers), { paymentTerms: q.paymentTerms });
    afterServicesChanged();
  });
  pick.addEventListener('input', e => {
    const box = e.target.closest('[data-svc]');
    if (!box) return;
    const sid = box.dataset.svc;
    if (box.checked) Object.assign(q, addService(q, services.find(s => s.id === sid), catalogue, tiers));
    else {
      const title = q.services.find(s => s.serviceId === sid)?.title;
      if (!confirm(`Remove ${title} from this quote? Its quantities will be lost.`)) { box.checked = true; return; }
      Object.assign(q, removeService(q, sid, tiers));
    }
    afterServicesChanged();
  });
  const afterServicesChanged = () => { drawPick(); drawServices(); changed(); };

  // ---------- service cards ----------
  const svcEl = main.querySelector('[data-services]');
  const open = new Set();
  // Options show today's catalogue; the selected one shows what the quote saved (its price may be older).
  const variantOptions = (item, l) => {
    const saved = `${l.variantLabel ? `${l.variantLabel} · ` : ''}saved ${money(l.price)}`;
    const current = item.variants.some(v => v.id === l.variantId);
    return (current ? '' : `<option value="" selected>${esc(saved)} (no longer in catalogue)</option>`) + item.variants.map(v => {
      const sel = v.id === l.variantId;
      const text = sel && num(v.price) !== num(l.price) ? saved : v.label || money(v.price);
      return `<option value="${esc(v.id)}" ${sel ? 'selected' : ''}>${esc(text)}</option>`;
    }).join('');
  };
  const lineRow = (svcI, piI, l, p) => {
    const item = catalogue.find(c => c.id === l.itemId);
    const follows = l.follows?.length;
    const qty = lineQty(l, p.lines);
    return `<tr data-line="${svcI}.${piI}.${esc(l.id)}">
      <td>${esc(l.name)}${item && item.variants.length > 1 ? ` <select data-variant>${variantOptions(item, l)}</select>`
        : l.variantLabel ? ` <span class="muted">(${esc(l.variantLabel)})</span>` : ''}
        ${l.remark ? `<div class="muted small">${esc(l.remark)}</div>` : ''}</td>
      <td class="w-qty"><div class="row" style="flex-wrap:nowrap"><input class="n ${follows && !l.override ? 'auto' : ''}" data-f="qty" data-type="num" inputmode="decimal" value="${esc(follows ? qty : l.qty)}">
        ${follows ? `<button class="icon" data-reset title="Follow device count again" ${l.override ? '' : 'hidden'}>↺</button>` : ''}</div></td>
      <td>${esc(l.unit)}</td>
      <td class="w-mult"><input class="n" data-f="mult" data-type="num" inputmode="decimal" value="${esc(l.mult ?? 1)}"></td>
      <td class="w-price"><input class="n" data-f="price" data-type="num" inputmode="decimal" value="${esc(l.price)}"></td>
      <td class="n" data-lt>${fmtNum(lineTotal(l, p.lines))}</td></tr>`;
  };
  const payItemHtml = (svcI, p, piI) => `<div class="payitem ${p.enabled === false ? 'off' : ''}" data-pi="${svcI}.${piI}">
      <div class="spread"><label class="row"><input type="checkbox" data-enabled ${p.enabled === false ? '' : 'checked'}> <b>${esc(p.description)}</b>
        <span class="muted">${esc(p.um)}</span></label>
        ${p.lumpSum ? '' : `<label class="row muted">CP,OCM % <input class="n" data-cp data-type="pct" inputmode="decimal" value="${showValue(p.cpOcm, 'pct')}" style="width:70px"></label>`}
        <b data-pt>${money(payItemTotals(p).total)}</b></div>
      ${p.lumpSum ? `<label class="field" style="max-width:220px"><span>Lump price (PHP)</span><input class="n" data-lump data-type="num" value="${esc(p.lumpPrice)}"></label>` : `
      <div class="scroll"><table class="grid">
        <thead><tr><th>Item</th><th class="n">Qty</th><th>Unit</th><th class="n">×</th><th class="n">Unit price</th><th class="n">Total</th></tr></thead>
        ${KINDS.map(([k, label]) => {
          const rows = p.lines.filter(l => l.kind === k);
          return rows.length ? `<tbody><tr class="group"><td colspan="6">${label}</td></tr>${rows.map(l => lineRow(svcI, piI, l, p)).join('')}</tbody>` : '';
        }).join('')}
      </table></div>`}
    </div>`;
  const svcTotal = s => s.payItems.filter(p => p.enabled !== false).reduce((a, p) => a + payItemTotals(p).total, 0);
  const drawServices = () => {
    svcEl.innerHTML = q.services.length ? q.services.map((s, i) => `
      <details class="svc" data-svc-card="${i}" ${open.has(s.serviceId) ? 'open' : ''}>
        <summary><span>${esc(s.title)}</span><span data-st>${money(svcTotal(s))}</span></summary>
        <div class="body">${s.payItems.map((p, j) => payItemHtml(i, p, j)).join('')}</div>
      </details>`).join('') : '<div class="card empty">Pick a tier or tick services above.</div>';
  };
  svcEl.addEventListener('toggle', e => {
    const d = e.target.closest('[data-svc-card]');
    if (!d) return;
    const sid = q.services[+d.dataset.svcCard].serviceId;
    d.open ? open.add(sid) : open.delete(sid);
  }, true);

  const locate = el => {
    const [si, pi, lid] = (el.closest('[data-line]')?.dataset.line ?? el.closest('[data-pi]')?.dataset.pi ?? '').split('.');
    const p = q.services[+si]?.payItems[+pi];
    return { p, line: lid && p?.lines.find(l => l.id === lid), si: +si };
  };
  // Update computed numbers in one pay item without re-rendering (keeps the cursor where it is).
  const refreshPayItem = (el, p, si) => {
    const box = el.closest('[data-pi]');
    box.querySelectorAll('[data-line]').forEach(tr => {
      const l = p.lines.find(x => x.id === tr.dataset.line.split('.')[2]);
      tr.querySelector('[data-lt]').textContent = fmtNum(lineTotal(l, p.lines));
      const input = tr.querySelector('[data-f="qty"]');
      if (l.follows?.length && !l.override && input !== document.activeElement) input.value = lineQty(l, p.lines);
    });
    box.querySelector('[data-pt]').textContent = money(payItemTotals(p).total);
    box.closest('[data-svc-card]').querySelector('[data-st]').textContent = money(svcTotal(q.services[si]));
  };

  svcEl.addEventListener('input', e => {
    const t = e.target;
    const { p, line, si } = locate(t);
    if (!p) return;
    if (t.matches('[data-enabled]')) { p.enabled = t.checked; t.closest('[data-pi]').classList.toggle('off', !t.checked); }
    else if (t.matches('[data-cp]')) p.cpOcm = readInput(t);
    else if (t.matches('[data-lump]')) p.lumpPrice = readInput(t);
    else if (line && t.matches('[data-variant]')) {
      const v = catalogue.find(c => c.id === line.itemId)?.variants.find(x => x.id === t.value);
      if (!v) return; // the "Saved" option: keep the quote's price
      Object.assign(line, { variantId: v.id, variantLabel: v.label, price: v.price });
      t.closest('[data-line]').querySelector('[data-f="price"]').value = v.price;
    } else if (line && t.dataset.f) {
      line[t.dataset.f] = readInput(t);
      if (t.dataset.f === 'qty' && line.follows?.length) {
        line.override = true;
        t.classList.remove('auto');
        t.closest('[data-line]').querySelector('[data-reset]').hidden = false;
      }
    } else return;
    refreshPayItem(t, p, si);
    changed();
  });
  svcEl.addEventListener('click', e => {
    const b = e.target.closest('[data-reset]');
    if (!b) return;
    const { p, line, si } = locate(b);
    line.override = false;
    b.hidden = true;
    const input = b.closest('[data-line]').querySelector('[data-f="qty"]');
    input.classList.add('auto');
    input.value = lineQty(line, p.lines);
    refreshPayItem(b, p, si);
    changed();
  });

  // ---------- totals + actions ----------
  const grand = main.querySelector('[data-grand]');
  function refreshTotals() { grand.textContent = money(quoteTotals(q).grandTotal); }
  main.querySelector('[data-save]').onclick = persist;
  main.querySelector('[data-pdf]').onclick = async e => {
    const b = e.target;
    const t = quoteTotals(q);
    if (!t.items.length) return alert('Add at least one service first.');
    if (Math.abs(t.termsPct - 100) > 0.001 && !confirm(`Payment terms add up to ${+t.termsPct.toFixed(2)}%, not 100%. Download anyway?`)) return;
    if (!q.preparer?.name && !confirm('No "Prepared by" name on this quote (set it in Settings). Download anyway?')) return;
    b.disabled = true;
    try {
      await persist();
      await downloadPdf(q, settings);
    } catch (err) {
      console.error(err);
      if (/image/i.test(err.message) && q.preparer?.signature &&
          confirm("Couldn't make the PDF: the signature image saved in this quote is damaged.\n\nUse the name and signature from your Settings instead and try again?")) {
        q.preparer = structuredClone(settings.preparer);
        try { await persist(); await downloadPdf(q, settings); } catch (e2) { alert(`Couldn't make the PDF: ${e2.message}`); }
      } else {
        alert(`Couldn't make the PDF: ${err.message}`);
      }
    } finally { b.disabled = false; }
  };

  drawPick();
  drawServices();
  refreshTotals();
}
