# -*- coding: utf-8 -*-
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(*a): return os.path.join(ROOT, *a)
import json, re, os, sqlite3

book = json.load(open(P('data/book.json'), encoding='utf-8'))
lects = json.load(open(P('data/hao_lectures.json'), encoding='utf-8'))

CAT = {1:'脉法',2:'脉法',3:'运气',4:'伤寒例',5:'杂病例',6:'温病',7:'伤暑',8:'热病',9:'湿病',
       10:'伤燥',11:'伤风',12:'寒病',13:'太阳',14:'太阳',15:'太阳',16:'阳明',17:'少阳',
       18:'太阴',19:'少阴',20:'厥阴',21:'霍乱',22:'差后劳复',23:'百合狐惑',24:'疟病',
       25:'血痹虚劳',26:'咳嗽水饮',27:'瘀血疮痈',28:'胸痹',29:'妇人',
       30:'附录',31:'附录',32:'附录',33:'附录',34:'附录'}

CATKW = {
 '脉法':['平脉','脉法','寸口','趺阳','脉象','脉诊','呼吸','至数'],
 '运气':['六气','主气','客气','司天','在泉','运气'],
 '伤寒例':['伤寒例','时气','温疫','四时','节气'],
 '杂病例':['杂病','卒病','五邪','脏府'],
 '温病':['温病','风温','温毒','温疫','春温'],
 '伤暑':['伤暑','中暍','暑病','暑热'],
 '热病':['热病','暑病'],
 '湿病':['湿病','湿痹','风湿','湿邪'],
 '伤燥':['伤燥','燥病','燥邪'],
 '伤风':['伤风','风邪'],
 '寒病':['寒病','中寒','寒邪伤阳','寒病脉证'],
 '太阳':['太阳病','太阳中风','太阳伤寒','太阳经','太阳之表','表证','桂枝汤','麻黄汤','营卫','蓄水','蓄血','结胸','心下痞'],
 '阳明':['阳明病','阳明','胃家实','承气汤','白虎汤','脾约','潮热','谵语'],
 '少阳':['少阳病','少阳','小柴胡汤','柴胡证','口苦','咽干','目眩','枢机'],
 '太阴':['太阴病','太阴','理中','腹满而吐','自利益甚'],
 '少阴':['少阴病','少阴','四逆汤','真武汤','黄连阿胶汤','麻黄附子细辛汤','附子汤','但欲寐'],
 '厥阴':['厥阴病','厥阴','乌梅丸','当归四逆汤','蛔厥','厥热胜复'],
 '霍乱':['霍乱','吐利','挥霍撩乱'],
 '差后劳复':['差后','劳复','阴阳易','痉病','柔痉','刚痉'],
 '百合狐惑':['百合病','狐惑','阴阳毒','百合'],
 '疟病':['疟病','疟母','牝疟','瘅疟'],
 '血痹虚劳':['血痹','虚劳','黄芪桂枝五物汤','小建中汤','薯蓣丸','酸枣仁汤'],
 '咳嗽水饮':['咳嗽','水饮','痰饮','悬饮','溢饮','支饮','黄汗','历节','小青龙汤','苓桂术甘汤'],
 '瘀血疮痈':['瘀血','吐衄','下血','疮痈','肠痈','大黄牡丹汤'],
 '胸痹':['胸痹','栝蒌薤白','心痛','胸背痛'],
 '妇人':['妇人','妊娠','产后','带下','经水','当归芍药散','温经汤'],
 '附录':['四气调神','金匮真言','阴阳离合','至真要大论','五运行','内经','素问'],
}

def core(title):
    t = title.replace('附录','')
    t = re.sub(r'第[一二三四五六七八九十百]+','',t)
    t = re.sub(r'(辨|脉证并治|病脉证并治|脉证|并治)','',t)
    t = re.sub(r'[上下中]$','',t)
    t = re.sub(r'\s+','',t)
    return t

# ---------- chapter keyword tables ----------
ch_kw = {}
for ch in book:
    cat = CAT[ch['no']]
    kws = {}
    for w in CATKW.get(cat, []): kws[w] = max(kws.get(w,0), 3)
    c = core(ch['title'])
    if len(c) >= 2: kws[c] = max(kws.get(c,0), 4)
    kws[ch['title']] = 8
    for cl in ch['clauses']:
        for f in cl['formulas']:
            n = f['name']
            if 2 <= len(n) <= 12: kws[n] = max(kws.get(n,0), 6)
    ch_kw[ch['no']] = kws

def score(txt, kws):
    s = 0
    for k, w in kws.items():
        if k in txt: s += txt.count(k) * w
    return s

# ---------- split lectures into passages ----------
def split_passages(txt, lo=420, hi=900):
    parts, buf = [], ''
    for sent in re.split(r'(?<=[。！？])', txt):
        if not sent: continue
        buf += sent
        if len(buf) >= lo:
            parts.append(buf); buf = ''
    if buf:
        if parts and len(buf) < 120: parts[-1] += buf
        else: parts.append(buf)
    out = []
    for p in parts:
        while len(p) > hi * 1.6:
            cut = p.rfind('。', lo, hi)
            if cut < lo: cut = hi
            out.append(p[:cut+1]); p = p[cut+1:]
        if p.strip(): out.append(p.strip())
    return out

GEN_LEC = {1,2,3,4,5,6,70}   # 通论性讲次，不挂具体病篇
passages = []
for L in lects:
    ps = split_passages(L['text'])
    raw = []
    for i, p in enumerate(ps, 1):
        best, bs = 0, 0
        for no, kws in ch_kw.items():
            sc = score(p, kws)
            if sc > bs: bs, best = sc, no
        raw.append({'lecture_no': L['no'], 'seq': i, 'text': p, 'best': best, 'score': bs})
    from collections import Counter
    dom = Counter(r['best'] for r in raw if r['score'] >= 12).most_common(1)
    dom = dom[0][0] if (dom and L['no'] not in GEN_LEC) else None
    for r in raw:
        keep = (dom is not None and r['best'] == dom and r['score'] >= 12)
        passages.append({'lecture_no': r['lecture_no'], 'seq': r['seq'], 'text': r['text'],
                         'chapter_no': dom if keep else None,
                         'category': CAT[dom] if keep else '通论', 'score': r['score']})

from collections import Counter
print('passages', len(passages))
print(Counter(p['category'] for p in passages).most_common())
print('无归属', sum(1 for p in passages if not p['chapter_no']))

# ---------- formulas ----------
formulas = []
for ch in book:
    for cl in ch['clauses']:
        for f in cl['formulas']:
            formulas.append({'chapter_no': ch['no'], 'clause_no': cl['no'],
                             'name': f['name'], 'func': f['func'], 'herbs': f['herbs'],
                             'herbs_t': f.get('herbs_t',''), 'usage': f['usage'],
                             'usage_t': f.get('usage_t',''), 'notes': ' ｜ '.join(f['notes'])})
fnames = sorted({f['name'] for f in formulas}, key=len, reverse=True)

for p in passages:
    hits = [n for n in fnames if n in p['text']]
    # 去掉被更长方名包含的短名
    keep = [n for n in hits if not any(n != m and n in m for m in hits)]
    p['formulas'] = keep[:8]

# ---------- db ----------
os.makedirs(P('data'), exist_ok=True)
db = P('data/app.db')
if os.path.exists(db): os.remove(db)
con = sqlite3.connect(db)
cur = con.cursor()
cur.executescript('''
CREATE TABLE chapters(no INTEGER PRIMARY KEY, title TEXT, category TEXT, guide TEXT,
  clause_count INTEGER, formula_count INTEGER, char_count INTEGER);
CREATE TABLE clauses(id INTEGER PRIMARY KEY, chapter_no INTEGER, no INTEGER, origin TEXT,
  translation TEXT, note TEXT, char_count INTEGER);
CREATE TABLE formulas(id INTEGER PRIMARY KEY, chapter_no INTEGER, clause_no INTEGER, name TEXT,
  func TEXT, herbs TEXT, herbs_t TEXT, usage TEXT, usage_t TEXT, notes TEXT);
CREATE TABLE lectures(no INTEGER PRIMARY KEY, title TEXT, char_count INTEGER,
  passage_count INTEGER, chapter_no INTEGER, category TEXT);
CREATE TABLE passages(id INTEGER PRIMARY KEY, lecture_no INTEGER, seq INTEGER, title TEXT,
  text TEXT, char_count INTEGER, chapter_no INTEGER, category TEXT, formula_names TEXT, score INTEGER);
CREATE TABLE sources(id INTEGER PRIMARY KEY, title TEXT, url TEXT, kind TEXT, note TEXT);
CREATE TABLE herbs(id INTEGER PRIMARY KEY, name TEXT UNIQUE, alias TEXT, category TEXT,
  nature TEXT, meridian TEXT, effect TEXT, indication TEXT, modern TEXT, formula_count INTEGER);
CREATE TABLE herb_formulas(herb_id INTEGER, formula_id INTEGER, PRIMARY KEY(herb_id, formula_id));
CREATE INDEX idx_cl_ch ON clauses(chapter_no);
CREATE INDEX idx_f_ch ON formulas(chapter_no);
CREATE INDEX idx_f_name ON formulas(name);
CREATE INDEX idx_p_ch ON passages(chapter_no);
CREATE INDEX idx_p_lec ON passages(lecture_no);
''')

for ch in book:
    ncl = sum(1 for c in ch['clauses'] if c['origin'])
    nf = sum(len(c['formulas']) for c in ch['clauses'])
    chars = sum(len(c['origin']) for c in ch['clauses'])
    cur.execute('INSERT INTO chapters VALUES(?,?,?,?,?,?,?)',
        (ch['no'], ch['title'], CAT[ch['no']], '\n'.join(ch['guide']), ncl, nf, chars))
    for c in ch['clauses']:
        if not c['origin']: continue
        cur.execute('INSERT INTO clauses(chapter_no,no,origin,translation,note,char_count) VALUES(?,?,?,?,?,?)',
            (ch['no'], c['no'], c['origin'], c['translation'], c['note'], len(c['origin'])))

for f in formulas:
    cur.execute('INSERT INTO formulas(chapter_no,clause_no,name,func,herbs,herbs_t,usage,usage_t,notes) VALUES(?,?,?,?,?,?,?,?,?)',
        (f['chapter_no'], f['clause_no'], f['name'], f['func'], f['herbs'], f['herbs_t'], f['usage'], f['usage_t'], f['notes']))
    f['id'] = cur.lastrowid

lect_meta = {}
for L in lects:
    ps = [p for p in passages if p['lecture_no'] == L['no']]
    from collections import Counter
    cc = Counter(p['chapter_no'] for p in ps if p['chapter_no'])
    chno = cc.most_common(1)[0][0] if cc else None
    cat = CAT[chno] if chno else '通论'
    lect_meta[L['no']] = (chno, cat)
    cur.execute('INSERT INTO lectures VALUES(?,?,?,?,?,?)',
        (L['no'], L['title'], len(L['text']), len(ps), chno, cat))

for p in passages:
    t = f"第{p['lecture_no']}讲 · {next(l['title'] for l in lects if l['no']==p['lecture_no'])} · 之{p['seq']}"
    cur.execute('INSERT INTO passages(lecture_no,seq,title,text,char_count,chapter_no,category,formula_names,score) VALUES(?,?,?,?,?,?,?,?,?)',
        (p['lecture_no'], p['seq'], t, p['text'], len(p['text']), p['chapter_no'], p['category'], '、'.join(p['formulas']), p['score']))

SRC = [
 ('《伤寒杂病论》桂林古本全文（原书底本）','https://mmkat.com/book/shanghan-zabing-lun','原典','34 篇原文、白话与按语的数据来源。'),
 ('郝万山讲《伤寒论》全 70 讲 · 视频合集','https://www.bilibili.com/video/BV1QE411s7hT/','视频','北京中医药大学郝万山教授系统讲授《伤寒论》的完整课程录像。'),
 ('郝万山讲《伤寒论》· 音频专辑','https://www.ximalaya.com/jiankang/3600718/','音频','同门课程的音频版本，适合通勤随听。'),
 ('郝万山讲《伤寒论》讲稿（民间中医网志愿者录入）','http://sssch.net/Admin/ckfinder/userfiles/files/shujixiazai/shujijijin(qita)/郝万山讲伤寒论.pdf','讲稿','本站 70 讲全文的数据来源，据课程录像逐句录入。'),
 ('郝万山讲解《伤寒论》第 11 讲：桂枝汤的适应证（讲稿整理）','https://zhuanlan.zhihu.com/p/442060762','文章','桂枝汤适应证与「抓主证、对证用方」思路的整理稿。'),
 ('《伤寒论》阳明病篇思维导图（依郝万山讲授体系整理）','https://zhuanlan.zhihu.com/p/666515824','文章','以郝万山讲课顺序梳理阳明病篇结构的图示笔记。'),
]
for t_,u,k,n in SRC:
    cur.execute('INSERT INTO sources(title,url,kind,note) VALUES(?,?,?,?)',(t_,u,k,n))

# ---------- 中药：从方剂组成抽取 ----------
import herbs_data as HD

HERB_MAP = {h[0]: h for h in HD.HERBS}
# 规范名与别名一起做前缀表，长名优先
PREFIX = sorted({**{k: k for k in HERB_MAP}, **HD.ALIASES}.items(), key=lambda kv: -len(kv[0]))
UNITS = '两铢分升合枚个把片尺斤斗钱钵铼干枝寸字兩'
NUM = '0-9一二三四五六七八九十百千半'

def herb_name(tok):
    """从「桂枝三两（去皮）」这类 token 中取出规范药名：先按已知药名前缀匹配，再退回剥剂量。"""
    t = re.sub(r'[（(].*?[）)]', '', tok).strip()
    t = re.sub(r'[，,。；;]', '', t)
    t = re.sub(r'^[右上]', '', t).strip()
    for pre, name in PREFIX:             # 长名优先，避开「百合」被当成「百+合」
        if t.startswith(pre):
            return name
    m = re.search(r'[' + NUM + r']+[' + UNITS + r']', t)
    if m:
        t = t[:m.start()]
    t = re.sub(r'(各等分|各等|各|等分|等|大者|小者|如.*|寸|十|半|二|三|一)$', '', t)
    return t if t in HERB_MAP else None

used, unmatched = {}, {}
for f in formulas:
    if not f['herbs']:
        continue
    for tok in re.split(r'[　\s、]+', f['herbs'].strip()):
        if not tok or tok in HD.EXCLUDE:
            continue
        name = herb_name(tok)
        if not name:
            if len(tok) <= 8:
                unmatched[tok] = unmatched.get(tok, 0) + 1
            continue
        used.setdefault(name, set()).add(f['id'])

for name, fids in used.items():
    h = HERB_MAP[name]
    cur.execute('INSERT INTO herbs(name,alias,category,nature,meridian,effect,indication,modern,formula_count) VALUES(?,?,?,?,?,?,?,?,?)',
        (name, h[1], h[2], h[3], h[4], h[5], h[6], h[7], len(fids)))
    hid = cur.lastrowid
    cur.executemany('INSERT INTO herb_formulas(herb_id,formula_id) VALUES(?,?)', [(hid, fid) for fid in fids])

print('中药味数', len(used), '| 未匹配 token', len(unmatched))
if unmatched:
    print('未匹配示例:', sorted(unmatched.items(), key=lambda x: -x[1])[:25])

# FTS5 trigram
cur.executescript('''
CREATE VIRTUAL TABLE clause_fts USING fts5(origin, translation, note, content='clauses', content_rowid='id', tokenize='trigram');
INSERT INTO clause_fts(rowid, origin, translation, note) SELECT id, origin, translation, note FROM clauses;
CREATE VIRTUAL TABLE passage_fts USING fts5(text, content='passages', content_rowid='id', tokenize='trigram');
INSERT INTO passage_fts(rowid, text) SELECT id, text FROM passages;
''')
con.commit()
for t in ['chapters','clauses','formulas','lectures','passages','sources','herbs','herb_formulas']:
    print(t, cur.execute(f'select count(*) from {t}').fetchone()[0])
con.close()
print('db size', round(os.path.getsize(db)/1024/1024,2),'MB')
