# -*- coding: utf-8 -*-
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*a): return os.path.join(ROOT, *a)
import re, json
TXT = P('tools/source/hao_raw.txt')
if not os.path.exists(TXT):                       # 首次运行：从 PDF 提取文字
    from pypdf import PdfReader
    reader = PdfReader(P('tools/source/hao.pdf'))
    text = '\n'.join((pg.extract_text() or '') for pg in reader.pages)
    open(TXT, 'w', encoding='utf-8').write(text)
t = open(TXT, encoding='utf-8').read()
head_end=t.find('第 01 讲',12000)
toc, body = t[:head_end], t[head_end:]

# --- TOC: 讲号 + 标题 ---
titles={}
for line in toc.split('\n'):
    m=re.match(r'\s*第\s*(\d{1,2})\s*讲\s*(.+?)\s*[.．]{3,}',line)
    if m:
        n=int(m.group(1)); ti=re.sub(r'\s+','',m.group(2))
        titles.setdefault(n,ti)
print('TOC titles',len(titles))

# --- body split ---
lines=body.split('\n')
marks=[]
for idx,l in enumerate(lines):
    m=re.match(r'^\s*第\s*(\d{1,2})\s*讲\s*(.*)$',l)
    if m:
        n=int(m.group(1))
        rest=re.sub(r'[.．\s\d]+$','',m.group(2)).strip()
        marks.append((idx,n,rest))
# keep monotonic sequence 1..70
seq=[]; expect=1
for idx,n,rest in marks:
    if n==expect:
        seq.append((idx,n,rest)); expect+=1
print('body lectures found',len(seq), 'last',seq[-1][1] if seq else None)

def clean_text(raw):
    out=[]
    for l in raw.split('\n'):
        s=l.strip()
        if not s: continue
        if re.fullmatch(r'[·\s]*\d{1,4}[·\s]*',s): continue      # page numbers
        if re.fullmatch(r'[·\s]*[ivxIVX]+[·\s]*',s): continue
        if re.match(r'^第\s*\d{1,2}\s*讲',s) and len(s)<60: continue
        if s.startswith('·') and s.endswith('·'): continue
        out.append(s)
    txt=''.join(out)
    txt=re.sub(r'\s+','',txt)
    txt=txt.replace('，,','，')
    return txt

lects=[]
for i,(idx,n,rest) in enumerate(seq):
    end=seq[i+1][0] if i+1<len(seq) else len(lines)
    raw='\n'.join(lines[idx+1:end])
    txt=clean_text(raw)
    title=titles.get(n) or rest or f'第{n}讲'
    lects.append({'no':n,'title':title,'text':txt})
print([ (l['no'],l['title'],len(l['text'])) for l in lects[:6]])
print([ (l['no'],l['title'],len(l['text'])) for l in lects[-3:]])
json.dump(lects,open(P('data/hao_lectures.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('total chars',sum(len(l['text']) for l in lects))
