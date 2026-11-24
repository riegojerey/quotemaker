import { aboutFor } from '../about.js';
import { esc, setPath, readInput, debounce, showValue } from './dom.js';
import { newId, snapshotPayItem } from '../model.js';
import { payItemTotals, fmtPeso } from '../calc.js';

const KINDS = [['material', 'Materials'], ['labor', 'Labor'], ['equipment', 'Equipment']];

const newPayItem = cpOcm => ({
  id: newId(), description: 'New pay item', um: 'unit', prerequisite: '', cpOcm, lumpSum: false, lumpPrice: 0,
  headings: { material: 'MATERIALS', labor: 'LABOR', equipment: 'EQUIPMENT' }, lines: [],
});

export async function render(main, ctx, selectedId) {
  const { services, tiers, catalogue, settings } = ctx.data;
  if (!tiers.length) {
    for (const [i, name] of ['Standard', 'Premium', 'Elite'].entries()) await ctx.save('tiers', { id: newId(), name, order: i + 1, serviceIds: [] });
  }
  tiers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  services.sort((a, b) => a.order - b.order);
  const svc = services.find(s => s.id === selectedId);
  main.innerHTML = `
    <h1>Services &amp; Tiers</h1>
    <section class="card" data-tiers></section>
    <div class="svc-layout">
      <section class="card" data-list></section>
      <section data-detail>${svc ? '' : '<div class="card empty">Pick a service on the left to edit its items and default quantities.</div>'}</section>
    </div>`;

  // ---------- tiers ----------
  const tiersEl = main.querySelector('[data-tiers]');
  const drawTiers = () => {
    tiersEl.innerHTML = `
      <div class="spread"><h2>Tiers</h2><button class="ghost" data-add-tier>+ Add tier</button></div>
      <p class="muted">Clicking a tier on a quote ticks exactly these services.</p>
      ${ctx.data.tiers.map(t => `<div class="tier" data-tier="${esc(t.id)}">
        <div class="row"><input data-tier-name value="${esc(t.name)}" style="max-width:220px"><span class="muted">${t.serviceIds.length} services</span>
          <button class="icon" data-del-tier title="Delete tier">✕</button></div>
        <div class="checks">${services.map(s => `<label><input type="checkbox" data-tier-svc="${esc(s.id)}" ${t.serviceIds.includes(s.id) ? 'checked' : ''}> ${esc(s.title)}</label>`).join('')}</div>
      </div>`).join('')}`;
  };
  drawTiers();
  const tierOf = el => ctx.data.tiers.find(t => t.id === el.closest('[data-tier]')?.dataset.tier);
  const saveTier = debounce(t => ctx.save('tiers', t));
  tiersEl.addEventListener('input', e => {
    const t = tierOf(e.target);
    if (!t) return;
    if (e.target.matches('[data-tier-name]')) t.name = e.target.value;
    if (e.target.matches('[data-tier-svc]')) {
      const id = e.target.dataset.tierSvc;
      t.serviceIds = e.target.checked ? [...new Set([...t.serviceIds, id])] : t.serviceIds.filter(x => x !== id);
      e.target.closest('[data-tier]').querySelector('.muted').textContent = `${t.serviceIds.length} services`;
    }
    saveTier(t);
  });
  tiersEl.addEventListener('click', async e => {
    if (e.target.closest('[data-add-tier]')) {
      await ctx.save('tiers', { id: newId(), name: 'New tier', order: Math.max(0, ...ctx.data.tiers.map(t => t.order ?? 0)) + 1, serviceIds: [] });
      drawTiers();
    }
    const del = e.target.closest('[data-del-tier]');
    if (del) {
      const t = tierOf(del);
      if (!confirm(`Delete tier "${t.name}"?`)) return;
      saveTier.cancel();
      await ctx.remove('tiers', t.id);
      drawTiers();
    }
  });

  // ---------- service list ----------
  const listEl = main.querySelector('[data-list]');
  listEl.innerHTML = `
    <div class="spread"><h2>Services</h2><button class="ghost" data-add-svc>+ Add</button></div>
    <table class="grid"><tbody>${services.map((s, i) => `<tr class="link ${s.id === selectedId ? 'sel' : ''}" data-svc="${esc(s.id)}">
      <td class="muted">${i + 1}.0</td><td>${esc(s.title)}</td>
      <td class="n nowrap"><button class="icon" data-move="-1" title="Move up" ${i ? '' : 'disabled'}>↑</button><button class="icon" data-move="1" title="Move down" ${i < services.length - 1 ? '' : 'disabled'}>↓</button></td></tr>`).join('')}</tbody></table>`;
  listEl.addEventListener('click', async e => {
    if (e.target.closest('[data-add-svc]')) {
      const s = { id: newId(), title: 'NEW SERVICE', order: (services.at(-1)?.order ?? 0) + 1, payItems: [newPayItem(settings.cpOcmDefault)] };
      await ctx.save('services', s);
      return ctx.go(`#/services/${s.id}`);
    }
    const tr = e.target.closest('[data-svc]');
    if (!tr) return;
    const move = e.target.closest('[data-move]');
    if (move) {
      const i = services.findIndex(s => s.id === tr.dataset.svc);
      const j = i + +move.dataset.move;
      services.forEach((s, k) => { s.order = k + 1; });
      [services[i].order, services[j].order] = [services[j].order, services[i].order];
      await Promise.all([ctx.save('services', services[i]), ctx.save('services', services[j])]);
      return ctx.rerender();
    }
    ctx.go(`#/services/${tr.dataset.svc}`);
  });

  if (svc) mountDetail(main.querySelector('[data-detail]'), svc, ctx);
}

function lineRow(line, pi, catalogue) {
  const item = catalogue.find(c => c.id === line.itemId);
  const materials = pi.lines.filter(l => l.kind === 'material' && l.id !== line.id);
  const nameOf = l => {
    const c = catalogue.find(x => x.id === l.itemId);
    if (!c) return '(missing item)';
    const v = c.variants.length > 1 ? c.variants.find(x => x.id === l.variantId) : null;
    return v ? `${c.name} (${v.label || fmtPeso(v.price)})` : c.name; // same item in several sizes must be told apart
  };
  return `<tr data-line="${esc(line.id)}">
    <td><select data-line-item>${item ? '' : '<option value="">— pick an item —</option>'}${catalogue.map(c =>
      `<option value="${esc(c.id)}" ${c.id === line.itemId ? 'selected' : ''}>${esc(c.name)}${c.unit ? ` (${esc(c.unit)})` : ''}</option>`).join('')}</select></td>
    <td>${item && item.variants.length > 1 ? `<select data-lpath="variantId">${item.variants.map(v =>
      `<option value="${esc(v.id)}" ${v.id === line.variantId ? 'selected' : ''}>${esc(v.label || fmtPeso(v.price))}</option>`).join('')}</select>` : '<span class="muted">—</span>'}</td>
    <td class="w-qty">${line.follows?.length ? '<span class="auto" title="Follows the device lines">auto</span>'
      : `<input class="n" data-lpath="qty" data-type="num" inputmode="decimal" value="${esc(line.qty)}">`}</td>
    <td class="w-mult"><input class="n" data-lpath="mult" data-type="num" inputmode="decimal" value="${esc(line.mult ?? 1)}"></td>
    <td>${line.kind === 'material' ? '' : `<details class="follows"><summary>${line.follows?.length ? `Follows ${line.follows.length}` : 'Typed qty'}</summary>
      <div>${materials.length ? materials.map(m => `<label><input type="checkbox" data-follow="${esc(m.id)}" ${line.follows?.includes(m.id) ? 'checked' : ''}> ${esc(nameOf(m))}</label>`).join('')
        : '<span class="muted">Add material lines first.</span>'}</div></details>`}</td>
    <td><input data-lpath="remark" value="${esc(line.remark)}" placeholder="Remark"></td>
    <td><button class="icon" data-del-line title="Remove line">✕</button></td></tr>`;
}

function payItemHtml(pi, i, catalogue) {
  const t = payItemTotals(snapshotPayItem(pi, catalogue));
  return `<div class="card payitem-card" data-pi="${esc(pi.id)}">
    <div class="spread"><h3>Pay item ${i + 1}</h3><span><b data-pi-total>${fmtPeso(t.total)}</b> <span class="muted">at current prices</span>
      <button class="icon" data-del-pi title="Delete pay item">✕</button></span></div>
    <div class="cols">
      <label class="field"><span>Description</span><input data-ppath="description" value="${esc(pi.description)}"></label>
      <label class="field"><span>U.M.</span><input data-ppath="um" value="${esc(pi.um)}"></label>
      <label class="field"><span>Prerequisite</span><input data-ppath="prerequisite" value="${esc(pi.prerequisite)}"></label>
      <label class="field"><span>CP,OCM (%)</span><input class="n" data-ppath="cpOcm" data-type="pct" inputmode="decimal" value="${showValue(pi.cpOcm, 'pct')}"></label>
    </div>
    <label class="row"><input type="checkbox" data-ppath="lumpSum" ${pi.lumpSum ? 'checked' : ''}> Lump sum (one fixed price, no DUPA page)</label>
    ${pi.lumpSum ? `<label class="field" style="max-width:220px"><span>Lump price (PHP)</span><input class="n" data-ppath="lumpPrice" data-type="num" value="${esc(pi.lumpPrice)}"></label>` : `
    <div class="scroll"><table class="grid">
      <thead><tr><th>Item</th><th>Variant</th><th class="n">Default qty</th><th class="n">×</th><th>Labor qty</th><th>Remark</th><th></th></tr></thead>
      ${KINDS.map(([k, label]) => `<tbody>
        <tr class="group"><td colspan="7"><div class="row">${label} <span class="muted">· PDF heading</span>
          <input data-ppath="headings.${k}" value="${esc(pi.headings[k])}" style="max-width:200px">
          <button class="ghost" data-add-line="${k}">+ Line</button></div></td></tr>
        ${pi.lines.filter(l => l.kind === k).map(l => lineRow(l, pi, catalogue)).join('')}</tbody>`).join('')}
    </table></div>`}
  </div>`;
}

function mountDetail(el, svc, ctx) {
  const { catalogue, settings } = ctx.data;
  const draw = () => {
    el.innerHTML = `
      <div class="card"><div class="spread">
        <label class="field" style="flex:1"><span>Service title (BOQ section)</span><input data-title value="${esc(svc.title)}"></label>
        <button class="danger" data-del-svc>Delete service</button></div>
        <label class="field"><span>Client description ("What's included" page; blank uses the default${aboutFor(svc.title) ? '' : ' — none for this service, so it is left off'})</span>
          <textarea data-about rows="3" placeholder="${esc(aboutFor(svc.title))}">${esc(svc.about ?? '')}</textarea></label></div>
      ${svc.payItems.map((p, i) => payItemHtml(p, i, catalogue)).join('')}
      <button class="ghost" data-add-pi>+ Add pay item</button>`;
  };
  draw();
  const save = debounce(() => ctx.save('services', svc));
  const piOf = node => svc.payItems.find(p => p.id === node.closest('[data-pi]')?.dataset.pi);
  const lineOf = (pi, node) => pi.lines.find(l => l.id === node.closest('[data-line]')?.dataset.line);
  const refreshTotal = pi => {
    el.querySelector(`[data-pi="${CSS.escape(pi.id)}"] [data-pi-total]`).textContent = fmtPeso(payItemTotals(snapshotPayItem(pi, catalogue)).total);
  };
  const commit = (pi, redraw) => { save(); redraw ? draw() : refreshTotal(pi); };

  el.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-title]')) { svc.title = t.value; return save(); }
    if (t.matches('[data-about]')) { svc.about = t.value; return save(); }
    const pi = piOf(t);
    if (!pi) return;
    if (t.dataset.ppath) {
      setPath(pi, t.dataset.ppath, readInput(t));
      return commit(pi, t.dataset.ppath === 'lumpSum');
    }
    const line = lineOf(pi, t);
    if (!line) return;
    if (t.matches('[data-line-item]')) {
      line.itemId = t.value;
      line.variantId = catalogue.find(c => c.id === t.value)?.variants[0]?.id ?? null;
      return commit(pi, true);
    }
    if (t.dataset.follow) {
      const set = new Set(line.follows ?? []);
      t.checked ? set.add(t.dataset.follow) : set.delete(t.dataset.follow);
      line.follows = set.size ? [...set] : null;
      save();
      refreshTotal(pi);
      // keep the popover open; just update its label and the qty cell
      const tr = t.closest('[data-line]');
      tr.querySelector('.follows summary').textContent = line.follows ? `Follows ${line.follows.length}` : 'Typed qty';
      tr.querySelector('.w-qty').innerHTML = line.follows ? '<span class="auto">auto</span>'
        : `<input class="n" data-lpath="qty" data-type="num" inputmode="decimal" value="${esc(line.qty)}">`;
      return;
    }
    if (t.dataset.lpath) {
      line[t.dataset.lpath] = readInput(t);
      return commit(pi, false);
    }
  });

  el.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-add-pi]')) { svc.payItems.push(newPayItem(settings.cpOcmDefault)); return commit(null, true); }
    if (b.matches('[data-del-svc]')) {
      const inTiers = ctx.data.tiers.filter(t => t.serviceIds.includes(svc.id));
      if (!confirm(`Delete service "${svc.title}"?${inTiers.length ? ` It is removed from ${inTiers.map(t => t.name).join(', ')}.` : ''} Saved quotes are not affected.`)) return;
      save.cancel();
      for (const t of inTiers) await ctx.save('tiers', { ...t, serviceIds: t.serviceIds.filter(x => x !== svc.id) });
      await ctx.remove('services', svc.id);
      return ctx.go('#/services');
    }
    const pi = piOf(b);
    if (!pi) return;
    if (b.matches('[data-del-pi]')) {
      if (!confirm(`Delete pay item "${pi.description}"?`)) return;
      svc.payItems = svc.payItems.filter(p => p !== pi);
      return commit(null, true);
    }
    if (b.dataset.addLine) {
      pi.lines.push({ id: newId(), kind: b.dataset.addLine, itemId: '', variantId: null, qty: 1, mult: 1, remark: '', follows: null });
      return commit(pi, true);
    }
    if (b.matches('[data-del-line]')) {
      const line = lineOf(pi, b);
      pi.lines = pi.lines.filter(l => l !== line);
      pi.lines.forEach(l => { if (l.follows) l.follows = l.follows.filter(id => id !== line.id); if (l.follows && !l.follows.length) l.follows = null; });
      return commit(pi, true);
    }
  });
}

