import { esc, field, bindInputs, debounce } from './dom.js';
import { num } from '../calc.js';

export function termsTable(terms) {
  const sum = terms.reduce((s, t) => s + num(t.pct), 0) * 100;
  return `<table class="grid">
    <thead><tr><th>Payment term</th><th class="n">%</th><th>Due</th><th></th></tr></thead>
    <tbody>${terms.map((t, i) => `<tr>
      <td><input data-path="${i}.label" value="${esc(t.label)}"></td>
      <td class="n"><input class="n" data-path="${i}.pct" data-type="pct" inputmode="decimal" value="${+(num(t.pct) * 100).toFixed(4)}"></td>
      <td><input data-path="${i}.due" value="${esc(t.due)}"></td>
      <td><button class="icon" data-del-term="${i}" title="Remove">✕</button></td></tr>`).join('')}</tbody>
    <tfoot><tr><td><button class="ghost" data-add-term>+ Add term</button></td>
      <td class="n ${Math.abs(sum - 100) > 0.001 ? 'bad' : 'good'}" data-terms-sum>${+sum.toFixed(2)}%</td><td colspan="2"></td></tr></tfoot>
  </table>`;
}

// Mounts an editable payment terms table into `el`; calls onChange after each edit.
export function mountTerms(el, terms, onChange) {
  el.dataset.scope = 'terms';
  const draw = () => { el.innerHTML = termsTable(terms); };
  draw();
  bindInputs(el, terms, () => {
    const sum = terms.reduce((s, t) => s + num(t.pct), 0) * 100;
    const cell = el.querySelector('[data-terms-sum]');
    cell.textContent = `${+sum.toFixed(2)}%`;
    cell.className = `n ${Math.abs(sum - 100) > 0.001 ? 'bad' : 'good'}`;
    onChange();
  });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-add-term]')) { terms.push({ label: '', pct: 0, due: '' }); draw(); onChange(); }
    const del = e.target.closest('[data-del-term]');
    if (del) { terms.splice(+del.dataset.delTerm, 1); draw(); onChange(); }
  });
}

export function render(main, ctx) {
  const s = structuredClone(ctx.data.settings);
  const save = debounce(() => ctx.save('settings', s));
  main.innerHTML = `
  <h1>Settings</h1>
  <section class="card">
    <h2>Prepared by (you)</h2>
    <p class="muted">Stamped on every quote you prepare. Stays in this browser.</p>
    <div class="cols">
      ${field('Name', s, 'preparer.name', { attrs: 'placeholder="Engr. Juan Dela Cruz"' })}
      ${field('Title', s, 'preparer.title', { attrs: 'placeholder="R&D, Exoid Robotics"' })}
    </div>
    <div class="sig">
      <canvas width="600" height="200"></canvas>
      <div class="row">
        <button class="ghost" data-sig-clear>Clear</button>
        <label class="button ghost">Upload image<input type="file" accept="image/*" data-sig-upload hidden></label>
        <span class="muted">Sign in the box with mouse or finger.</span>
      </div>
    </div>
  </section>
  <section class="card">
    <h2>Pricing defaults</h2>
    <div class="cols">
      ${field('CP,OCM default (%)', s, 'cpOcmDefault', { dataType: 'pct', attrs: 'inputmode="decimal"' })}
      ${field('Validity (months)', s, 'validityMonths', { dataType: 'num', attrs: 'inputmode="numeric"' })}
    </div>
    <h3>Default payment terms</h3>
    <div data-terms></div>
  </section>
  <section class="card">
    <h2>Company</h2>
    <div class="cols">
      ${field('Company name', s, 'company.name')}
      ${field('Phone', s, 'company.phone')}
      ${field('Email', s, 'company.email')}
      ${field('Website', s, 'company.website')}
    </div>
    ${field('Address (one line per row)', s, 'company.address', { type: 'textarea', dataType: 'lines', attrs: 'rows="3"' })}
    <div class="cols">
      ${field('Bank', s, 'bank.name')}
      ${field('Account number', s, 'bank.accountNo')}
      ${field('Account name', s, 'bank.accountName')}
    </div>
    ${field('Quote note', s, 'footerNote', { type: 'textarea', attrs: 'rows="3"' })}
    ${field('Coworker emails (for sending quotes later, one per line)', s, 'coworkers', { type: 'textarea', dataType: 'lines', attrs: 'rows="2"' })}
  </section>`;

  bindInputs(main, s, save);
  mountTerms(main.querySelector('[data-terms]'), s.paymentTerms, save);
  mountSignature(main.querySelector('.sig'), s, () => ctx.save('settings', s));
}

function mountSignature(box, s, save) {
  const canvas = box.querySelector('canvas');
  const g = canvas.getContext('2d');
  const paint = () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!s.preparer.signature) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(canvas.width / img.width, canvas.height / img.height);
      g.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
    };
    img.src = s.preparer.signature;
  };
  paint();

  let drawing = false;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    g.lineWidth = 3; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#111';
    g.beginPath(); g.moveTo(...pos(e));
  });
  canvas.addEventListener('pointermove', e => { if (drawing) { g.lineTo(...pos(e)); g.stroke(); } });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    s.preparer.signature = canvas.toDataURL('image/png');
    save();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  box.querySelector('[data-sig-clear]').onclick = () => { s.preparer.signature = null; paint(); save(); };
  box.querySelector('[data-sig-upload]').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    // Re-encode through the canvas as PNG so the PDF library always gets a format it supports.
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const k = Math.min(1, 800 / img.width);
      c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      s.preparer.signature = c.toDataURL('image/png');
      URL.revokeObjectURL(img.src);
      paint(); save();
    };
    img.src = URL.createObjectURL(file);
  };
}
