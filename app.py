# -*- coding: utf-8 -*-
"""《伤寒杂病论》研读 · 本地桌面应用
Flask + SQLite + 原生前端，单进程启动，窗口关闭即退出。
"""
import os, sys, io, json, time, socket, sqlite3, threading, subprocess, webbrowser

# ---------- 无控制台运行时修补 stdout ----------
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w', encoding='utf-8')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w', encoding='utf-8')

from flask import Flask, g, jsonify, request, send_from_directory, abort
from waitress.server import create_server

FROZEN = getattr(sys, 'frozen', False)
BASE = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE, 'data')
WEB_DIR = os.path.join(BASE, 'web')
DB_PATH = os.path.join(DATA_DIR, 'app.db')
APP_ID = 'ShanghanReader'

app = Flask(__name__, static_folder=None)
app.config['JSON_AS_ASCII'] = False
app.json.ensure_ascii = False

# ---------------- DB ----------------
def db():
    if 'db' not in g:
        g.db = sqlite3.connect('file:%s?mode=ro' % DB_PATH.replace('\\', '/'), uri=True)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def _close(_e):
    d = g.pop('db', None)
    if d is not None:
        d.close()

def rows(sql, args=()):
    return [dict(r) for r in db().execute(sql, args).fetchall()]

def row(sql, args=()):
    r = db().execute(sql, args).fetchone()
    return dict(r) if r else None

def group(items, key):
    """按字段分组：{值: [item, ...]}"""
    out = {}
    for it in items:
        out.setdefault(it[key], []).append(it)
    return out

# ---------------- API ----------------
@app.get('/api/bootstrap')
def api_bootstrap():
    chapters = rows('SELECT no,title,category,clause_count,formula_count,char_count,guide FROM chapters ORDER BY no')
    lectures = rows('SELECT no,title,chapter_no,category,passage_count FROM lectures ORDER BY no')
    formulas = rows('SELECT id,name,chapter_no,func FROM formulas ORDER BY chapter_no,clause_no,id')
    herbs = rows('SELECT id,name,category,nature,formula_count FROM herbs ORDER BY formula_count DESC')
    sources = rows('SELECT * FROM sources ORDER BY id')
    stats = row("""SELECT (SELECT COUNT(*) FROM clauses) c, (SELECT COUNT(*) FROM formulas) f,
                   (SELECT COUNT(*) FROM passages) p, (SELECT COUNT(*) FROM herbs) h,
                   (SELECT SUM(char_count) FROM clauses) chars""")
    cats = list(dict.fromkeys(c['category'] for c in chapters))
    return jsonify(chapters=chapters, lectures=lectures, formulas=formulas, herbs=herbs,
                   sources=sources, stats=stats, categories=cats,
                   book={'title': '伤寒杂病论', 'edition': '桂林古本 · 白云阁藏本系统',
                         'author': '汉 · 张仲景', 'lecturer': '郝万山'})

@app.get('/api/chapter/<int:no>')
def api_chapter(no):
    ch = row('SELECT * FROM chapters WHERE no=?', (no,))
    if not ch:
        abort(404)
    clauses = rows('SELECT id,chapter_no,no,origin,translation,note,char_count FROM clauses WHERE chapter_no=? ORDER BY no', (no,))
    by_clause = group(rows('SELECT * FROM formulas WHERE chapter_no=? ORDER BY clause_no,id', (no,)), 'clause_no')
    for c in clauses:
        c['formulas'] = by_clause.get(c['no'], [])
    passages = rows('''SELECT id,lecture_no,seq,title,text,formula_names FROM passages
                       WHERE chapter_no=? ORDER BY lecture_no,seq''', (no,))
    prev = row('SELECT no,title FROM chapters WHERE no<? ORDER BY no DESC LIMIT 1', (no,))
    nxt = row('SELECT no,title FROM chapters WHERE no>? ORDER BY no LIMIT 1', (no,))
    return jsonify(chapter=ch, clauses=clauses, passages=passages, prev=prev, next=nxt)

@app.get('/api/lecture/<int:no>')
def api_lecture(no):
    L = row('SELECT * FROM lectures WHERE no=?', (no,))
    if not L:
        abort(404)
    passages = rows('SELECT id,lecture_no,seq,text,formula_names,chapter_no FROM passages WHERE lecture_no=? ORDER BY seq', (no,))
    ch = row('SELECT no,title,category FROM chapters WHERE no=?', (L['chapter_no'],)) if L['chapter_no'] else None
    prev = row('SELECT no,title FROM lectures WHERE no<? ORDER BY no DESC LIMIT 1', (no,))
    nxt = row('SELECT no,title FROM lectures WHERE no>? ORDER BY no LIMIT 1', (no,))
    return jsonify(lecture=L, passages=passages, chapter=ch, prev=prev, next=nxt)

@app.get('/api/formula/<int:fid>')
def api_formula(fid):
    f = row('SELECT * FROM formulas WHERE id=?', (fid,))
    if not f:
        abort(404)
    clause = row('SELECT id,chapter_no,no,origin,translation,note FROM clauses WHERE chapter_no=? AND no=?',
                 (f['chapter_no'], f['clause_no']))
    ch = row('SELECT no,title,category FROM chapters WHERE no=?', (f['chapter_no'],))
    passages = rows('''SELECT id,lecture_no,seq,title,text FROM passages
                       WHERE formula_names LIKE ? ORDER BY lecture_no,seq''', ('%' + f['name'] + '%',))
    siblings = rows('SELECT id,name,func FROM formulas WHERE chapter_no=? AND name<>? ORDER BY clause_no', (f['chapter_no'], f['name']))
    text = f['herbs'] or ''
    links = [{'id': h['id'], 'name': h['name']} for h in rows('SELECT id,name FROM herbs') if h['name'] in text]
    links.sort(key=lambda x: text.find(x['name']))
    f['herb_links'] = links
    return jsonify(formula=f, clause=clause, chapter=ch, passages=passages[:40], siblings=siblings)

@app.get('/api/herb/<int:hid>')
def api_herb(hid):
    h = row('SELECT * FROM herbs WHERE id=?', (hid,))
    if not h:
        abort(404)
    fs = rows('''SELECT f.id,f.name,f.func,f.chapter_no,ch.title ctitle
                 FROM herb_formulas hf JOIN formulas f ON f.id=hf.formula_id
                 JOIN chapters ch ON ch.no=f.chapter_no
                 WHERE hf.herb_id=? ORDER BY f.chapter_no,f.clause_no''', (hid,))
    seen, chs, uniq, names = set(), [], [], set()
    for f in fs:
        if f['chapter_no'] not in seen:
            seen.add(f['chapter_no'])
            chs.append({'no': f['chapter_no'], 'title': f['ctitle']})
        if f['name'] not in names:          # 同名方只列一次
            names.add(f['name'])
            uniq.append(f)
    return jsonify(herb=h, formulas=uniq, chapters=chs)

CL = 'c.id,c.chapter_no,c.no,c.origin,c.translation,ch.title ctitle'
PS = 'p.id,p.lecture_no,p.seq,p.title,p.text,l.title ltitle'

@app.get('/api/search')
def api_search():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify(q=q, clauses=[], passages=[], formulas=[], herbs=[])

    like, cl, ps = '%' + q + '%', [], []

    if len(q) >= 3:                     # 三字以上走 FTS5 trigram 倒排索引
        try:
            term = '"' + q.replace('"', '""') + '"'
            cl = rows(f'SELECT {CL} FROM clause_fts f JOIN clauses c ON c.id=f.rowid '
                      f'JOIN chapters ch ON ch.no=c.chapter_no '
                      f'WHERE clause_fts MATCH ? ORDER BY rank LIMIT 60', (term,))
            ps = rows(f'SELECT {PS} FROM passage_fts f JOIN passages p ON p.id=f.rowid '
                      f'JOIN lectures l ON l.no=p.lecture_no '
                      f'WHERE passage_fts MATCH ? ORDER BY rank LIMIT 60', (term,))
        except sqlite3.OperationalError:
            cl, ps = [], []

    if not cl:                          # 不足三字或索引无命中时退回 LIKE
        cl = rows(f'SELECT {CL} FROM clauses c JOIN chapters ch ON ch.no=c.chapter_no '
                  f'WHERE c.origin LIKE ? OR c.translation LIKE ? LIMIT 60', (like, like))
    if not ps:
        ps = rows(f'SELECT {PS} FROM passages p JOIN lectures l ON l.no=p.lecture_no '
                  f'WHERE p.text LIKE ? LIMIT 60', (like,))

    fs = rows('SELECT id,name,chapter_no,func,herbs FROM formulas WHERE name LIKE ? OR herbs LIKE ? LIMIT 40', (like, like))
    hs = rows('''SELECT id,name,category,nature,effect,formula_count FROM herbs
                 WHERE name LIKE ? OR effect LIKE ? OR indication LIKE ? OR modern LIKE ?
                 ORDER BY formula_count DESC LIMIT 20''', (like, like, like, like))
    return jsonify(q=q, clauses=cl, passages=ps, formulas=fs, herbs=hs)

@app.get('/api/ping')
def api_ping():
    return jsonify(ok=True, app=APP_ID)

# ---------------- 生命周期 ----------------
STATE = {'last': None, 'born': time.time(), 'closed': False}

@app.post('/api/hb')
def api_hb():
    STATE['last'] = time.time()
    return jsonify(ok=True)

@app.post('/api/bye')
def api_bye():
    threading.Thread(target=_shutdown, daemon=True).start()
    return jsonify(ok=True)

def _shutdown():
    if STATE['closed']:
        return
    STATE['closed'] = True
    try:
        if SERVER:
            SERVER.close()
    except Exception:
        pass
    time.sleep(0.2)
    os._exit(0)

def _watchdog():
    while True:
        time.sleep(2)
        last = STATE['last']
        if last and time.time() - last > 12:
            _shutdown()
        elif not last and time.time() - STATE['born'] > 45:
            _shutdown()   # 窗口始终未打开，避免进程滞留

# ---------------- 静态 ----------------
@app.get('/')
def index():
    return send_from_directory(WEB_DIR, 'index.html')

@app.get('/<path:p>')
def static_file(p):
    full = os.path.join(WEB_DIR, p)
    if os.path.isfile(full):
        return send_from_directory(WEB_DIR, p)
    abort(404)

# ---------------- 启动 ----------------
def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p

def find_browser():
    cands = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    ]
    for c in cands:
        if os.path.isfile(c):
            return c
    return None

def open_window(url):
    if os.environ.get('SHANGHAN_NO_WINDOW'):
        return True
    exe = find_browser()
    if exe:
        try:
            args = [exe, '--app=' + url, '--window-size=1500,960', '--window-position=80,40',
                    '--no-first-run', '--no-default-browser-check',
                    '--disable-features=Translate,msEdgeSidebarV2']
            subprocess.Popen(args, close_fds=True)
            return True
        except Exception:
            pass
    try:
        webbrowser.open(url)
        return True
    except Exception:
        return False

def already_running(port):
    try:
        import urllib.request
        with urllib.request.urlopen('http://127.0.0.1:%d/api/ping' % port, timeout=0.7) as r:
            return json.loads(r.read().decode()).get('app') == APP_ID
    except Exception:
        return False

def state_file():
    d = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'ShanghanReader')
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, 'port.txt')

SERVER = None

def main():
    global SERVER
    sf = state_file()
    try:
        if os.path.exists(sf):
            p = int(open(sf).read().strip())
            if already_running(p):
                open_window('http://127.0.0.1:%d/' % p)
                return
    except Exception:
        pass

    port = free_port()
    SERVER = create_server(app, host='127.0.0.1', port=port, threads=6, ident=None)
    threading.Thread(target=_watchdog, daemon=True).start()
    t = threading.Thread(target=SERVER.run, daemon=True)
    t.start()
    try:
        open(sf, 'w').write(str(port))
    except Exception:
        pass
    time.sleep(0.35)
    url = 'http://127.0.0.1:%d/' % port
    if not open_window(url):
        time.sleep(1)
    try:
        while t.is_alive():
            t.join(0.5)
    except KeyboardInterrupt:
        _shutdown()

if __name__ == '__main__':
    main()
