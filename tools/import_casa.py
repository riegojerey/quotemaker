"""Convert an Exoid BOQ/DUPA workbook (the standard BOQ + DUPA sheets layout) into a Quote Maker backup file.

Run locally only; the output contains prices and client data and goes to private/ (git-ignored):
    uv run --with openpyxl python tools/import_casa.py "<client> - BOQ_DUPA.xlsx"
Every pay item's recomputed total is checked against the workbook's own total; any mismatch exits 1.
"""
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import openpyxl

KINDS = {1: 'material', 2: 'labor', 3: 'equipment'}
DEFAULT_HEADINGS = {'material': 'MATERIALS', 'labor': 'LABOR', 'equipment': 'EQUIPMENT'}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', str(s).lower()).strip('-')


_used = set()


def uid(base):
    """slug made unique across the whole import (e.g. 'Skilled.Electrician' vs 'Skilled. Electrician')."""
    base = slug(base) or 'item'
    out, n = base, 2
    while out in _used:
        out, n = f'{base}-{n}', n + 1
    _used.add(out)
    return out


def isnum(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def text(v):
    return '' if v is None else str(v).strip()


def sheet_ref(formula):
    m = re.match(r"=\s*'?([^'!]+)'?!([A-Z]+\d+)", str(formula or ''))
    return (m.group(1), m.group(2)) if m else None


def follows_from(formula, rowids):
    """=SUM(D8:D10) / =SUM(D8:D12,D15) / =D8 over material rows -> list of line ids."""
    f = str(formula or '')
    if not f.startswith('='):
        return None
    rows = []
    for a, b in re.findall(r'D(\d+)(?::D(\d+))?', f):
        rows += range(int(a), int(b or a) + 1)
    ids = [rowids[r] for r in rows if r in rowids]
    return ids or None


def parse_dupa(ws, wv, prefix):
    lines, headings, cp = [], dict(DEFAULT_HEADINGS), 0.0
    kind, pending, material_rows = None, None, {}
    for r in range(6, ws.max_row + 1):
        b, c = wv.cell(r, 2).value, text(wv.cell(r, 3).value)
        if isnum(b) and int(b) in KINDS and b == int(b) and r > 6:
            kind = KINDS[int(b)]
            headings[kind] = c or DEFAULT_HEADINGS[kind]
            pending = None
            continue
        # CP,OCM row: labelled, or (Smart Door Locks) unlabelled but G = G<subtotal>*F<row>
        if c.upper().startswith('CP,OCM') or re.fullmatch(rf'=G\d+\*F{r}', str(ws.cell(r, 7).value or '')):
            cp = wv.cell(r, 6).value if isnum(wv.cell(r, 6).value) else 0.0
            continue
        if kind is None or c.upper().startswith(('SUBTOTAL', 'TOTAL', 'PREPARED')):
            pending = None if c.upper().startswith(('SUBTOTAL', 'TOTAL')) else pending
            continue
        qty, price = wv.cell(r, 4).value, wv.cell(r, 6).value
        if not (isnum(qty) and isnum(price)):
            if c and not isnum(qty):
                pending = c  # label row, e.g. "Rails" or a lock model name over its location row
            continue
        if c.lower() == 'no' and qty == 0 and price == 0:
            continue
        name, remark = (pending, c) if pending else (c, '')
        pending = None
        remark = remark or text(wv.cell(r, 8).value)
        a, gform = wv.cell(r, 1).value, str(ws.cell(r, 7).value or '')
        mult = a if isnum(a) and re.search(rf'A{r}\b', gform) else 1
        lid = f'{prefix}-r{r}'
        line = {'id': lid, 'kind': kind, 'name': name, 'unit': text(wv.cell(r, 5).value), 'qty': qty,
                'price': price, 'mult': mult, 'remark': remark, 'follows': None}
        if kind == 'material':
            material_rows[r] = lid
        else:
            line['follows'] = follows_from(ws.cell(r, 4).value, material_rows)
        lines.append(line)
    return lines, headings, cp or 0.0


def main(path):
    wf = openpyxl.load_workbook(path)                  # formulas
    wv = openpyxl.load_workbook(path, data_only=True)  # cached values
    boq_f, boq = wf['BOQ'], wv['BOQ']

    catalogue, services, quote_services, errors, expected_items = {}, [], [], [], []

    def catalogue_ids(line):
        key = (line['name'], line['unit'])
        if key not in catalogue:
            catalogue[key] = {'id': uid(f"{line['name']}-{line['unit']}"), 'name': line['name'], 'unit': line['unit'], 'variants': []}
        item = catalogue[key]
        v = next((v for v in item['variants'] if v['price'] == line['price']), None)
        if not v:
            v = {'id': f"{item['id']}-v{len(item['variants']) + 1}", 'label': '', 'price': line['price']}
            item['variants'].append(v)
        # labels stay blank: the app shows the price for unlabelled variants; owner names sizes later
        return item['id'], v['id']

    svc = None
    for r in range(21, 57):
        no, desc = boq.cell(r, 1).value, text(boq.cell(r, 2).value)
        if not isnum(no):
            continue
        if no == int(no):
            svc = {'id': uid(desc), 'title': desc, 'order': len(services) + 1, 'payItems': []}
            qsvc = {'serviceId': svc['id'], 'title': desc, 'order': svc['order'], 'payItems': []}
            services.append(svc)
            quote_services.append(qsvc)
            continue
        ref = sheet_ref(boq_f.cell(r, 8).value)
        pid = uid(desc)
        base = {'id': pid, 'description': desc, 'um': text(boq.cell(r, 3).value) or 'unit', 'prerequisite': '',
                'cpOcm': 0.0, 'lumpSum': False, 'lumpPrice': 0, 'headings': dict(DEFAULT_HEADINGS)}
        if not ref:
            tpl = {**base, 'lumpSum': True, 'lumpPrice': boq.cell(r, 8).value or 0, 'lines': []}
            expected = tpl['lumpPrice']
            qlines = []
        else:
            sheet, cell = ref
            lines, headings, cp = parse_dupa(wf[sheet], wv[sheet], pid)
            prereq = text(wv[sheet]['E5'].value)
            tpl = {**base, 'prerequisite': '' if prereq == 'N/A' else prereq, 'cpOcm': cp, 'headings': headings, 'lines': []}
            qlines = []
            for ln in lines:
                item_id, var_id = catalogue_ids(ln)
                tpl['lines'].append({'id': ln['id'], 'kind': ln['kind'], 'itemId': item_id, 'variantId': var_id,
                                     'qty': ln['qty'], 'mult': ln['mult'], 'remark': ln['remark'], 'follows': ln['follows']})
                qlines.append({**ln, 'itemId': item_id, 'variantId': var_id, 'variantLabel': '', 'override': False})
            expected = wv[sheet][cell].value or 0
        svc['payItems'].append(tpl)
        qpi = {k: v for k, v in tpl.items() if k != 'lines'}
        qpi.update(enabled=True, lines=qlines)
        quote_services[-1]['payItems'].append(qpi)
        got = recompute(qpi)
        expected_items.append(expected)
        status = 'ok' if abs(got - expected) < 0.01 else 'MISMATCH'
        if status != 'ok':
            errors.append(f'{no} {desc}: computed {got:,.2f} vs workbook {expected:,.2f}')

    # quote lines need the final variant labels (set after all lines are seen)
    labels = {v['id']: v['label'] for i in catalogue.values() for v in i['variants']}
    for s in quote_services:
        for p in s['payItems']:
            for ln in p['lines']:
                ln['variantLabel'] = labels.get(ln['variantId'], '')

    d = boq['B10'].value
    iso = (d.date() if isinstance(d, datetime) else d if isinstance(d, date) else date.today()).isoformat()
    remarks = [text(boq.cell(r, 2).value) for r in range(64, 76)] + [text(boq.cell(r, 4).value) for r in range(64, 68)]
    pro = wv['PROFORMA INVOICE']
    terms = [{'label': text(pro.cell(r, 2).value), 'pct': pro.cell(r, 3).value, 'due': text(pro.cell(r, 5).value)}
             for r in range(64, 70) if isnum(pro.cell(r, 3).value)]
    validity = text(boq['H72'].value).split('~')
    def us_date(s):
        m, dd, y = s.strip().split('/')
        return f'{y}-{int(m):02d}-{int(dd):02d}'
    now = datetime.now(timezone.utc).isoformat()
    quote = {
        'id': 'imported-quote', 'code': text(boq['B9'].value), 'date': iso,
        'validFrom': us_date(validity[0]) if len(validity) == 2 else iso,
        'validTo': us_date(validity[1]) if len(validity) == 2 else iso,
        'tierName': text(boq['D3'].value).title() or 'Custom',
        'client': {'owner': text(boq['B12'].value), 'address': text(boq['B13'].value),
                   'project': text(boq['B14'].value), 'email': text(boq['B15'].value)},
        'contractor': {'enterprise': text(boq['E12'].value), 'rep': text(boq['E13'].value),
                       'contact': text(boq['E14'].value), 'email': text(boq['E15'].value)},
        'generalContractor': text(boq['G12'].value),
        'conforme': {'name': text(boq['E74'].value), 'title': text(boq['E75'].value)},
        'services': quote_services, 'remarks': '\n'.join(x for x in remarks if x),
        'paymentTerms': terms,
        'preparer': {'name': text(boq['E71'].value), 'title': text(boq['E72'].value), 'signature': None},
        'createdAt': now, 'updatedAt': now,
    }
    backup = {'app': 'quotemaker', 'version': 1, 'exportedAt': now, 'catalogue': list(catalogue.values()),
              'services': services, 'tiers': [], 'settings': {'footerNote': text(boq['D69'].value)}, 'quotes': [quote],
              '_expected': {'grandTotal': boq['H61'].value, 'items': expected_items}}

    if errors:
        print('\n'.join(errors))
        sys.exit(1)
    out = Path(__file__).resolve().parent.parent / 'private' / 'casa-backup.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(backup, indent=2, ensure_ascii=False))
    n = sum(len(s['payItems']) for s in services)
    print(f'OK {n} pay items, grand total {sum(recompute(p) for s in quote_services for p in s["payItems"]):.2f}')
    print(f'wrote {out} ({len(catalogue)} catalogue items)')


def recompute(pi):
    """Same rules as src/calc.js payItemTotals."""
    if pi['lumpSum']:
        return pi['lumpPrice']
    qty = {ln['id']: ln['qty'] for ln in pi['lines']}
    sub = 0
    for ln in pi['lines']:
        q = sum(qty[i] for i in ln['follows']) if ln['follows'] else ln['qty']
        sub += ln['mult'] * q * ln['price']
    return sub * (1 + pi['cpOcm'])


if __name__ == '__main__':
    main(sys.argv[1])
