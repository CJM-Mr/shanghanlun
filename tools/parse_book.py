# -*- coding: utf-8 -*-
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*a): return os.path.join(ROOT, *a)
import re, json, os
from bs4 import BeautifulSoup

HERB_RE = re.compile(r'(两|枚|升|斤|铢|合|把|个|片|半|分|尺|斗|撮|方寸匕)')
CHAPTERS = []

def clean(s):
    if not s: return ''
    s = s.replace('\u00a0',' ').replace('\u3000','　')
    s = re.sub(r'[ \t]+',' ',s)
    return s.strip()

def strip_label(p, cls):
    t = p.get_text('\n')
    t = t.replace('\n','')
    return t.strip()

def looks_herbs(t):
    if '。' in t or len(t) < 6: return False
    toks = [x for x in re.split(r'[　\s]+', t) if x]
    if len(toks) < 2: return False
    ok = sum(1 for x in toks if HERB_RE.search(x))
    return ok/len(toks) >= 0.6

def parse_chapter(i):
    s = BeautifulSoup(open(P(f'data/raw/{i}.html'),encoding='utf-8').read(),'lxml')
    title = clean(s.select_one('.chapter-title').get_text())
    meta  = clean(s.select_one('.chapter-meta').get_text(' ')) if s.select_one('.chapter-meta') else ''
    guide = [clean(p.get_text()) for p in s.select('.chapter-guide p')]
    body  = s.select_one('.chapter-body')
    clauses, cur, curf = [], None, None
    order = 0
    for seg in body.find_all('div', recursive=False):
        cls = ' '.join(seg.get('class',[]))
        po = seg.select_one('.seg-origin')
        pt = seg.select_one('.seg-translation')
        pn = seg.select_one('.seg-note')
        origin = clean(po.get_text()) if po else ''
        trans  = clean(pt.get_text()) if pt else ''
        note   = clean(pn.get_text()) if pn else ''
        trans  = re.sub(r'^白话','',trans).strip()
        note   = re.sub(r'^按','',note).strip()
        if not origin and not trans: continue
        order += 1
        if 'seg-formula' in cls:
            name = re.sub(r'方$','',origin).strip()
            func = ''
            m = re.match(r'^(.*?)（(.*)）$', trans)
            if m: name_t, func = m.group(1), m.group(2)
            curf = {'name': name, 'func': func, 'herbs': '', 'usage': '', 'notes': [], 'order': order}
            if cur is None:
                cur = {'origin':'','translation':'','note':'','formulas':[]}
                clauses.append(cur)
            cur['formulas'].append(curf)
        elif 'seg-decoction' in cls:
            tgt = curf if curf else (cur or {'notes':[]})
            if curf:
                curf['usage'] = (curf['usage'] + ' ' + origin).strip()
                if trans: curf.setdefault('usage_t', ''); curf['usage_t'] = (curf['usage_t']+' '+trans).strip()
                if note: curf['notes'].append(note)
            else:
                cur.setdefault('notes',[]).append(origin)
        else:
            if curf and looks_herbs(origin):
                curf['herbs'] = (curf['herbs'] + '　' + origin).strip('　')
                if trans:
                    curf['herbs_t'] = (curf.get('herbs_t','') + '　' + trans).strip('　')
            elif curf and re.match(r'^(右|上)', origin) and '味' in origin:
                curf['usage'] = (curf['usage'] + ' ' + origin).strip()
                if trans: curf['usage_t'] = (curf.get('usage_t','')+' '+trans).strip()
                if note: curf['notes'].append(note)
            else:
                cur = {'origin': origin, 'translation': trans, 'note': note, 'formulas': []}
                clauses.append(cur)
                curf = None
    # number clauses
    n = 0
    for c in clauses:
        if c['origin']:
            n += 1
            c['no'] = n
        else:
            c['no'] = n
    return {'no': i, 'title': title, 'meta': meta, 'guide': guide, 'clauses': clauses}

out = []
for i in range(1,35):
    ch = parse_chapter(i)
    out.append(ch)
    ncl = len([c for c in ch['clauses'] if c['origin']])
    nf  = sum(len(c['formulas']) for c in ch['clauses'])
    print(i, ch['title'], 'clauses', ncl, 'formulas', nf, 'guide', len(ch['guide']))
json.dump(out, open(P('data/book.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('total clauses', sum(len([c for c in x['clauses'] if c['origin']]) for x in out))
print('total formulas', sum(len(c['formulas']) for x in out for c in x['clauses']))
