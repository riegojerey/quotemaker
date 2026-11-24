import { loadAll, put, del, putSettings, replaceAll } from './store.js';
import { makeBackup, parseBackup, mergeBackup, downloadJson } from './backup.js';
import { $, esc, today, flushAll } from './ui/dom.js';
import * as settingsView from './ui/settings.js';
import * as catalogueView from './ui/catalogue.js';
import * as servicesView from './ui/services.js';
import * as quotesView from './ui/quotes.js';
import * as quoteView from './ui/quote.js';

const VIEWS = { quotes: quotesView, quote: quoteView, catalogue: catalogueView, services: servicesView, settings: settingsView };
let main = $('#main');
let data;

const ctx = {
  get data() { return data; },
  async save(store, obj) {
    if (store === 'settings') { data.settings = obj; return putSettings(obj); }
    const list = data[store];
    const i = list.findIndex(o => o.id === obj.id);
    i >= 0 ? (list[i] = obj) : list.push(obj);
    return put(store, obj);
  },
  async remove(store, id) {
    data[store] = data[store].filter(o => o.id !== id);
    return del(store, id);
  },
  go: hash => { location.hash = hash; },
  rerender: () => route(),
};

async function route() {
  await flushAll(); // pending edits from the view we are leaving land before we reload
  data = await loadAll();
  const [, name = 'quotes', id] = location.hash.replace(/^#/, '').split('/');
  const view = VIEWS[name] ?? quotesView;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (name === 'quote' ? 'quotes' : name)));
  // Fresh element per render so listeners from the previous view (and its stale data) are dropped.
  const fresh = main.cloneNode(false);
  main.replaceWith(fresh);
  main = fresh;
  try {
    await view.render(main, ctx, id);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card error">Something went wrong: ${esc(e.message)}</div>`;
  }
}
addEventListener('hashchange', route);
addEventListener('pagehide', () => flushAll());
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
route();

// Backup
$('#backup').onclick = () => $('#backup-dialog').showModal();
$('#backup-dialog').addEventListener('close', () => {
  const dlg = $('#backup-dialog');
  if (dlg.returnValue !== 'ok') return;
  const f = dlg.querySelector('form');
  downloadJson(makeBackup(data, { includeQuotes: f.quotes.checked, includeSignature: f.signature.checked }), `quotemaker-backup-${today()}.json`);
});

// Restore
let incoming;
$('#restore').onclick = () => $('#restore-file').click();
$('#restore-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    incoming = parseBackup(await file.text());
  } catch (err) {
    alert(`${file.name}: ${err.message}. Nothing was changed.`);
    return;
  }
  $('#restore-summary').textContent = `${file.name}: ${incoming.catalogue.length} catalogue items, ${incoming.services.length} services, ${incoming.tiers.length} tiers` +
    (incoming.quotes ? `, ${incoming.quotes.length} quotes` : '') + '.';
  $('#restore-dialog').showModal();
};
$('#restore-dialog').addEventListener('close', async () => {
  const dlg = $('#restore-dialog');
  if (dlg.returnValue !== 'ok' || !incoming) return;
  const mode = dlg.querySelector('form').mode.value;
  if (mode === 'replace' && !confirm('Replace your catalogue, services, tiers and settings with this file? Your quotes and your own name & signature are kept.')) return;
  try {
    await flushAll();
    await replaceAll(mergeBackup(data, incoming, mode));
  } catch (e) {
    console.error(e);
    alert(`Restore failed, nothing was changed. (${e.message})`);
  }
  incoming = null;
  route();
});
