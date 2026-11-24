import { esc, setPath, readInput, debounce } from './dom.js';
import { newId } from '../model.js';

const usedBy = (services, itemId) =>
  services.filter(s => s.payItems.some(p => p.lines.some(l => l.itemId === itemId))).map(s => s.title);

const row = item => `
  <tr data-item="${esc(item.id)}">
    <td><input data-path="name" value="${esc(item.name)}" placeholder="Item name"></td>
    <td class="w-qty"><input data-path="unit" value="${esc(item.unit)}" placeholder="unit"></td>
    <td>
      ${item.variants.map((v, i) => `<div class="row variant">
        <input data-path="variants.${i}.label" value="${esc(v.label)}" placeholder="${item.variants.length > 1 ? 'Size / variant' : '(single price)'}" style="flex:2">
        <input class="n" data-path="variants.${i}.price" data-type="num" inputmode="decimal" value="${esc(v.price)}" style="flex:1" aria-label="Price">
        <button class="icon" data-del-variant="${i}" title="Remove variant" ${item.variants.length < 2 ? 'disabled' : ''}>✕</button>
      </div>`).join('')}
      <button class="ghost" data-add-variant>+ Variant</button>
    </td>
    <td><button class="icon" data-del-item title="Delete item">🗑</button></td>
  </tr>`;

export function render(main, ctx) {
  const { catalogue, services } = ctx.data;
  main.innerHTML = `
    <div class="spread"><h1>Catalogue</h1>
      <div class="row"><input type="search" placeholder="Search items…" data-search style="width:240px"><button data-add-item>+ Add item</button></div></div>
    <p class="muted">Selling prices. Change them when the dollar moves; quotes already saved keep the prices they were made with.
      Items with sizes (Data Cabinet 4U / 6U / 12U) get one variant per size.</p>
    <div class="card scroll">
      ${catalogue.length ? `<table class="grid">
        <thead><tr><th>Item</th><th>Unit</th><th>Variants &amp; prices (PHP)</th><th></th></tr></thead>
        <tbody>${[...catalogue].sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')}</tbody></table>`
        : `<div class="empty">No items yet. Add one, or use <b>Restore</b> to load a backup file from a coworker.</div>`}
    </div>`;

  const savers = new Map();
  const saveLater = item => {
    if (!savers.has(item.id)) savers.set(item.id, debounce(() => ctx.save('catalogue', item)));
    savers.get(item.id)();
  };
  const itemOf = el => catalogue.find(i => i.id === el.closest('[data-item]')?.dataset.item);
  const redraw = (tr, item) => { tr.outerHTML = row(item); };

  main.addEventListener('input', e => {
    if (e.target.matches('[data-search]')) {
      const q = e.target.value.toLowerCase();
      main.querySelectorAll('[data-item]').forEach(tr => {
        tr.hidden = !itemOf(tr).name.toLowerCase().includes(q);
      });
      return;
    }
    const el = e.target.closest('[data-path]');
    const item = el && itemOf(el);
    if (!item) return;
    setPath(item, el.dataset.path, readInput(el));
    saveLater(item);
  });

  main.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-add-item]')) {
      const item = { id: newId(), name: '', unit: 'unit', variants: [{ id: newId(), label: '', price: 0 }] };
      await ctx.save('catalogue', item);
      ctx.rerender().then(() => main.querySelector(`[data-item="${item.id}"] input`)?.focus());
      return;
    }
    const tr = t.closest('[data-item]');
    const item = tr && itemOf(tr);
    if (!item) return;
    if (t.matches('[data-add-variant]')) {
      item.variants.push({ id: newId(), label: '', price: 0 });
    } else if (t.matches('[data-del-variant]')) {
      item.variants.splice(+t.dataset.delVariant, 1);
    } else if (t.matches('[data-del-item]')) {
      const used = usedBy(services, item.id);
      const msg = used.length
        ? `"${item.name}" is used by: ${used.join(', ')}.\nThose lines will show as "(missing item)" on new quotes. Delete anyway?`
        : `Delete "${item.name || 'this item'}"?`;
      if (!confirm(msg)) return;
      savers.get(item.id)?.cancel();
      await ctx.remove('catalogue', item.id);
      tr.remove();
      return;
    } else return;
    await ctx.save('catalogue', item);
    redraw(tr, item);
  });
}
