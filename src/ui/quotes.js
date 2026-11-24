import { esc, money, today } from './dom.js';
import { buildQuote, duplicateQuote } from '../model.js';
import { quoteTotals } from '../calc.js';

export function render(main, ctx) {
  const quotes = [...ctx.data.quotes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const noPrices = !ctx.data.services.length;
  main.innerHTML = `
    <div class="spread"><h1>Quotes</h1>
      <div class="row"><input type="search" placeholder="Search client, project or code…" data-search style="width:280px">
      <button data-new>+ New quote</button></div></div>
    ${noPrices ? `<div class="card">No services or prices yet. Use <b>Restore</b> (top right) to load the backup file you were sent,
      or set them up under <a href="#/catalogue">Catalogue</a> and <a href="#/services">Services &amp; Tiers</a>.</div>` : ''}
    <div class="card scroll">${quotes.length ? `<table class="grid">
      <thead><tr><th>Code</th><th>Project</th><th>Owner</th><th>Tier</th><th class="n">Grand total</th><th>Date</th><th></th></tr></thead>
      <tbody>${quotes.map(q => `<tr class="link" data-q="${esc(q.id)}">
        <td>${esc(q.code) || '<span class="muted">—</span>'}</td><td>${esc(q.client.project)}</td><td>${esc(q.client.owner)}</td>
        <td><span class="tag">${esc(q.tierName)}</span></td><td class="n">${money(quoteTotals(q).grandTotal)}</td><td class="nowrap">${esc(q.date)}</td>
        <td class="nowrap"><button class="ghost" data-dup title="Duplicate">Duplicate</button><button class="icon" data-del title="Delete">🗑</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No quotes yet.</div>'}</div>`;

  main.querySelector('[data-search]')?.addEventListener('input', e => {
    const s = e.target.value.toLowerCase();
    main.querySelectorAll('[data-q]').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(s); });
  });
  main.addEventListener('click', async e => {
    if (e.target.closest('[data-new]')) {
      const { services, catalogue, settings } = ctx.data;
      const q = buildQuote({ services, catalogue, settings, serviceIds: [], tierName: 'Custom', today: today() });
      await ctx.save('quotes', q);
      return ctx.go(`#/quote/${q.id}`);
    }
    const tr = e.target.closest('[data-q]');
    if (!tr) return;
    const q = ctx.data.quotes.find(x => x.id === tr.dataset.q);
    if (e.target.closest('[data-dup]')) {
      const d = duplicateQuote(q);
      d.code = '';
      await ctx.save('quotes', d);
      return ctx.go(`#/quote/${d.id}`);
    }
    if (e.target.closest('[data-del]')) {
      if (!confirm(`Delete quote ${q.code || q.client.project || ''}? This cannot be undone.`)) return;
      await ctx.remove('quotes', q.id);
      return ctx.rerender();
    }
    ctx.go(`#/quote/${q.id}`);
  });
}
