import { fmtPeso, num } from '../calc.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const money = fmtPeso;

export const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}

// Read an input's value by its data-type: num, pct (shown as %, stored as fraction), lines (textarea → array).
export function readInput(el) {
  if (el.type === 'checkbox') return el.checked;
  const t = el.dataset.type;
  if (t === 'num') return el.value === '' ? '' : num(el.value);
  if (t === 'pct') return num(el.value) / 100;
  if (t === 'lines') return el.value.split('\n');
  return el.value;
}
export function showValue(v, type) {
  if (type === 'pct') return +(num(v) * 100).toFixed(4);
  if (type === 'lines') return (v || []).join('\n');
  return v ?? '';
}

// <input> bound to obj[path]; bindInputs wires them.
export const field = (label, obj, path, { type = 'text', dataType = '', cls = '', attrs = '' } = {}) => `
  <label class="field ${cls}"><span>${esc(label)}</span>${type === 'textarea'
    ? `<textarea data-path="${path}" data-type="${dataType}" ${attrs}>${esc(showValue(getPath(obj, path), dataType))}</textarea>`
    : `<input type="${type}" data-path="${path}" data-type="${dataType}" value="${esc(showValue(getPath(obj, path), dataType))}" ${attrs}>`}</label>`;

export function bindInputs(root, obj, onChange) {
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-path]');
    if (!el || !root.contains(el)) return;
    const scope = el.closest('[data-scope]'); // nested editors (e.g. terms table) bind their own inputs
    if (scope && scope !== root && root.contains(scope)) return;
    setPath(obj, el.dataset.path, readInput(el));
    onChange(el);
  });
}

// Debounced saves register here so navigation, restore and page close can flush them first.
const pending = new Set();
export function debounce(fn, ms = 400) {
  let t, args;
  const run = () => { clearTimeout(t); pending.delete(d); return fn(...args); };
  const d = (...a) => { args = a; clearTimeout(t); t = setTimeout(run, ms); pending.add(d); };
  d.flush = () => (pending.has(d) ? run() : undefined);
  d.cancel = () => { clearTimeout(t); pending.delete(d); };
  return d;
}
export const flushAll = () => Promise.all([...pending].map(d => d.flush()));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
