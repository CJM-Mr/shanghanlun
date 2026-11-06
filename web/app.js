/* ============================================================
   《伤寒杂病论》研读 — 前端逻辑
   原生 ES2022 · 无框架 · 无构建
   ============================================================ */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CN = '〇一二三四五六七八九';
const cnNum = n => n <= 10 ? (n === 10 ? '十' : CN[n]) : n < 20 ? '十' + CN[n % 10]
  : n < 100 ? CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '') : String(n);

const api = async path => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
};
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('sh.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('sh.' + k, JSON.stringify(v)),
};

const S = {
  boot: null,
  route: { view: 'home' },
  marks: store.get('marks', []),
  settings: store.get('settings', { mode: 'all', fs: 1, theme: 'paper' }),
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
}

/* ---------------- 启动 ---------------- */
async function boot() {
  applySettings();
  S.boot = await api('/api/bootstrap');
  const { stats } = S.boot;
  $('#footStats').textContent = `${stats.c} 条 · ${stats.f} 方 · ${stats.p} 段`;
  renderSidebar();
  renderWelcome();
  window.addEventListener('hashchange', route);
  route();
  heartbeat();
}

function heartbeat() {
  const ping = () => fetch('/api/hb', { method: 'POST' }).catch(() => { });
  ping();
  setInterval(ping, 4000);
}

/* ---------------- 设置 ---------------- */
function applySettings() {
  const { mode, fs, theme } = S.settings;
  document.body.dataset.mode = mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--fs', (0.94 + fs * 0.06).toFixed(3) + 'rem');
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}

function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  store.set('settings', S.settings);
  applySettings();
}

/* ---------------- 侧栏 ---------------- */
function renderSidebar() {
  const { chapters, lectures, formulas, categories } = S.boot;

  // 原文目录
  $('#pane-chapters').innerHTML = categories.map(cat => {
    const list = chapters.filter(c => c.category === cat);
    if (!list.length) return '';
    return `<div class="cat-head"><i></i>${esc(cat)}</div>` + list.map(c => `
      <a class="ch-item" href="#/c/${c.no}" data-ch="${c.no}">
        <span class="ch-no">${String(c.no).padStart(2, '0')}</span>
        <span class="ch-title">${esc(c.title)}</span>
        <span class="ch-meta">${c.clause_count}</span>
      </a>`).join('');
  }).join('');

  // 郝万山讲次
  $('#pane-lectures').innerHTML = lectures.map(l => `
    <a class="lec-item" href="#/l/${l.no}" data-lec="${l.no}">
      <span class="ch-no">${String(l.no).padStart(2, '0')}</span>
      <span class="ch-title">${esc(l.title)}</span>
      <span class="lec-tag">${esc(l.category === '通论' ? '通论' : l.category)}</span>
    </a>`).join('');

  // 方剂索引
  renderFormulaList('');
  $('#formulaFilter').addEventListener('input', e => renderFormulaList(e.target.value.trim()));

  // 中药索引
  renderHerbList('');
  $('#herbFilter').addEventListener('input', e => renderHerbList(e.target.value.trim()));

  renderMarks();
}

function renderFormulaList(q) {
  const list = S.boot.formulas.filter(f => !q || f.name.includes(q) || (f.func || '').includes(q));
  $('#formulaList').innerHTML = list.length ? list.map(f => `
    <a class="f-item" href="#/f/${f.id}">
      <span class="ch-title">${esc(f.name)}</span>
      <small>${esc((f.func || '').slice(0, 8))}</small>
    </a>`).join('') : '<div class="empty">没有匹配的方剂</div>';
}

function renderHerbList(q) {
  const list = S.boot.herbs.filter(h => !q || h.name.includes(q) || (h.category || '').includes(q));
  const groups = new Map();
  for (const h of list) {
    if (!groups.has(h.category)) groups.set(h.category, []);
    groups.get(h.category).push(h);
  }
  $('#herbList').innerHTML = list.length ? [...groups].map(([cat, hs]) => `
    <div class="cat-head"><i></i>${esc(cat)} · ${hs.length}</div>` + hs.map(h => `
      <a class="ch-item herb-item" href="#/h/${h.id}">
        <span class="ch-title">${esc(h.name)}</span>
        <span class="ch-meta">${h.formula_count}</span>
      </a>`).join('')).join('') : '<div class="empty">没有匹配的药材</div>';
}

function renderMarks() {
  const box = $('#pane-marks');
  if (!S.marks.length) {
    box.innerHTML = '<div class="empty">还没有收藏<br>阅读时点击条文右侧的 ☆</div>';
    return;
  }
  box.innerHTML = S.marks.map(m => `
    <a class="ch-item" href="#/c/${m.chapter_no}?c=${m.no}">
      <span class="ch-no">${m.no}</span>
      <span class="ch-title">${esc(m.origin.slice(0, 22))}…</span>
      <span class="ch-meta">${esc(m.ctitle.slice(0, 4))}</span>
    </a>`).join('');
}

function markActive(sel, val) {
  $$(sel).forEach(el => el.classList.toggle('active', el.dataset.ch === val || el.dataset.lec === val));
  const active = $(sel + '.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ---------------- 路由 ---------------- */
const PANE_OF = { chapter: 'chapters', lecture: 'lectures', formula: 'formulas', herb: 'herbs', home: 'chapters' };

function activatePane(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
}

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const q = new URLSearchParams(qs || '');
  if (path === '/search') {
    openSearch();
    const v = q.get('q') || '';
    $('#searchInput').value = v;
    return doSearch(v);
  }
  const [, kind, id] = path.split('/');
  $('#main').scrollTop = 0;
  S.route = { view: { c: 'chapter', l: 'lecture', f: 'formula', h: 'herb' }[kind] || 'home', id: +id };

  activatePane(PANE_OF[S.route.view] || 'chapters');
  if (kind === 'c') return viewChapter(+id, q);
  if (kind === 'l') return viewLecture(+id);
  if (kind === 'f') return viewFormula(+id);
  if (kind === 'h') return viewHerb(+id);
  renderWelcome();
}

function go(hash) { location.hash = hash; }

/* ---------------- 首页 ---------------- */
function renderWelcome() {
  const { stats } = S.boot;
  $('#crumb').textContent = '全书目录';
  markActive('.ch-item', '');
  $('#reader').innerHTML = `
    <div class="welcome">
      <div class="welcome-seal">傷</div>
      <h2>伤寒杂病论</h2>
      <p class="welcome-sub">桂林古本三十四篇 · 逐条拆解 · 郝万山七十讲</p>
      <div class="welcome-grid">
        <div class="stat"><b>${stats.c}</b><span>条文</span></div>
        <div class="stat"><b>${stats.f}</b><span>方剂</span></div>
        <div class="stat"><b>${stats.h}</b><span>中药</span></div>
        <div class="stat"><b>70</b><span>讲次</span></div>
      </div>
      <p class="welcome-hint">原文 ${(stats.chars / 10000).toFixed(1)} 万字　·　按 <kbd>/</kbd> 全书检索　·　<kbd>←</kbd> <kbd>→</kbd> 翻篇</p>
    </div>`;
}

/* ---------------- 篇章页 ---------------- */
async function viewChapter(no, q) {
  const d = await api('/api/chapter/' + no);
  const ch = d.chapter;
  $('#crumb').innerHTML = `<b>${esc(ch.category)}</b> · 第 ${cnNum(ch.no)} 篇 · ${esc(ch.title)}`;
  markActive('.ch-item', String(no));
  document.title = ch.title + ' · 伤寒杂病论';

  const clauses = d.clauses.map(clauseHTML).join('');
  $('#reader').innerHTML = `
    <header class="hero">
      <span class="hero-cat">${esc(ch.category)} · 第${cnNum(ch.no)}篇</span>
      <h2>${esc(ch.title)}</h2>
      <div class="hero-meta">
        <span>条文 <b>${ch.clause_count}</b></span>
        <span>方剂 <b>${ch.formula_count}</b></span>
        <span>原文 <b>${ch.char_count.toLocaleString()}</b> 字</span>
        <span>郝万山讲解 <b>${d.passages.length}</b> 段</span>
      </div>
      ${ch.guide ? `<div class="guide">${ch.guide.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    </header>
    <div class="clauses">${clauses || '<div class="empty">本篇暂无条文</div>'}</div>
    ${haoSection(d.passages, ch)}
    ${pager(d.prev, d.next)}`;

  if (q && q.get('c')) {
    const el = $('#cl-' + q.get('c'));
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('flash');
    }
  }
}

function clauseHTML(c) {
  const fs = c.formulas.map(f => formulaHTML(f)).join('');
  const marked = S.marks.some(m => m.chapter_no === c.chapter_no && m.no === c.no);
  return `
    <section class="clause" id="cl-${c.no}" data-id="${c.id}">
      <div class="cno">${c.no}</div>
      <p class="origin">${esc(c.origin)}</p>
      ${c.translation ? `<p class="trans"><span class="lb">白话</span>${esc(c.translation)}</p>` : ''}
      ${c.note ? `<p class="note"><span class="lb">按</span>${esc(c.note)}</p>` : ''}
      ${fs}
      <a class="f-link" href="#" data-mark="${c.no}" style="opacity:.6">${marked ? '★ 已收藏' : '☆ 收藏此条'}</a>
    </section>`;
}

function formulaHTML(f) {
  return `
    <div class="formula${S.settings.mode === 'all' ? ' open' : ''}">
      <button class="f-head" data-toggle>
        <span class="f-name">${esc(f.name)}</span>
        ${f.func ? `<span class="f-func">${esc(f.func)}</span>` : ''}
        <span class="f-arrow">▸</span>
      </button>
      <div class="f-body">
        ${f.herbs ? row('组成', f.herbs, 'herbs') : ''}
        ${f.usage ? row('煎服', f.usage) : ''}
        ${f.notes ? row('按', f.notes) : ''}
        <a class="f-link" href="#/f/${f.id}">查看方剂详情与郝万山讲解 →</a>
      </div>
    </div>`;
}
const row = (k, v, cls = '') => `<div class="f-row"><div class="f-k">${k}</div><div class="f-v ${cls}">${esc(v)}</div></div>`;

/* 郝万山解读：按讲次归并 */
function haoSection(passages, ch) {
  if (!passages.length) {
    return `<section class="hao-sec">
      <div class="sec-head"><h3>郝万山解读</h3><span>本篇暂无自动匹配段落</span></div>
      <p class="sec-note">可前往左侧「郝万山」标签，按七十讲的顺序通读讲稿。</p>
    </section>`;
  }
  const groups = new Map();
  for (const p of passages) {
    if (!groups.has(p.lecture_no)) groups.set(p.lecture_no, []);
    groups.get(p.lecture_no).push(p);
  }
  const items = [...groups.entries()].map(([no, ps]) => `
    <div class="acc-item">
      <button class="acc-head" data-acc>
        <span class="acc-no">第 ${no} 讲</span>
        <span class="acc-title">${esc(ps[0].title.split(' · ')[1] || '')} · ${ps.length} 段</span>
        <span class="acc-more">展开</span>
        <span class="acc-preview">${esc(ps[0].text.slice(0, 90))}</span>
      </button>
      <div class="acc-body">
        ${ps.map(p => `<p>${esc(p.text)}</p>`).join('')}
        <span class="src">出处：郝万山讲《伤寒论》第 ${no} 讲　<a href="#/l/${no}">读全讲 →</a></span>
      </div>
    </div>`).join('');

  return `<section class="hao-sec">
    <div class="sec-head"><h3>郝万山解读</h3><span>共 ${passages.length} 段 · 摘自七十讲讲稿</span></div>
    <p class="sec-note">段落依方证关键词自动归入本篇，仅作索引；讲稿原文见「郝万山」栏目。</p>
    <div class="acc">${items}</div>
  </section>`;
}

const pager = (prev, next) => `
  <nav class="pager">
    ${prev ? `<a href="#/c/${prev.no}"><small>上一篇</small>${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="r" href="#/c/${next.no}"><small>下一篇</small>${esc(next.title)}</a>` : '<span></span>'}
  </nav>`;

/* ---------------- 讲次页 ---------------- */
async function viewLecture(no) {
  const d = await api('/api/lecture/' + no);
  const L = d.lecture;
  $('#crumb').innerHTML = `<b>郝万山</b> · 第 ${L.no} 讲`;
  markActive('.lec-item', String(no));
  document.title = `第${L.no}讲 ${L.title} · 郝万山`;

  const fnames = [...new Set(d.passages.flatMap(p => (p.formula_names || '').split('、').filter(Boolean)))].slice(0, 12);
  const fmap = new Map(S.boot.formulas.map(f => [f.name, f.id]));

  $('#reader').innerHTML = `
    <header class="hero">
      <span class="hero-cat">郝万山 · 讲稿</span>
      <h2>第${L.no}讲　${esc(L.title)}</h2>
      <div class="hero-meta">
        <span>讲稿 <b>${L.char_count.toLocaleString()}</b> 字</span>
        <span>分 <b>${L.passage_count}</b> 段</span>
        ${d.chapter ? `<span>对应 <b>${esc(d.chapter.title)}</b></span>` : '<span>通论 / 专题</span>'}
      </div>
      ${fnames.length ? `<div class="pill-row">${fnames.map(n => fmap.has(n)
        ? `<a class="pill" href="#/f/${fmap.get(n)}">${esc(n)}</a>` : `<span class="pill">${esc(n)}</span>`).join('')}</div>` : ''}
    </header>
    <div class="lec-body">${d.passages.map(p => `<p>${esc(p.text)}</p>`).join('')}</div>
    ${d.chapter ? `<div class="pager"><a href="#/c/${d.chapter.no}"><small>对应篇章</small>${esc(d.chapter.title)}</a><span></span></div>` : ''}
    <nav class="pager">
      ${d.prev ? `<a href="#/l/${d.prev.no}"><small>上一讲</small>第${d.prev.no}讲 ${esc(d.prev.title)}</a>` : '<span></span>'}
      ${d.next ? `<a class="r" href="#/l/${d.next.no}"><small>下一讲</small>第${d.next.no}讲 ${esc(d.next.title)}</a>` : '<span></span>'}
    </nav>`;
}

/* ---------------- 方剂页 ---------------- */
async function viewFormula(id) {
  const d = await api('/api/formula/' + id);
  const f = d.formula;
  $('#crumb').innerHTML = `<b>方剂</b> · ${esc(f.name)}`;
  document.title = f.name + ' · 伤寒杂病论';

  const ps = d.passages.map((p, i) => `
    <div class="acc-item${i === 0 ? ' open' : ''}">
      <button class="acc-head" data-acc>
        <span class="acc-no">第 ${p.lecture_no} 讲</span>
        <span class="acc-title">${esc(p.title.split(' · ')[1] || '')}</span>
        <span class="acc-more">展开</span>
      </button>
      <div class="acc-body"><p>${esc(p.text)}</p><span class="src">出处：第 ${p.lecture_no} 讲　<a href="#/l/${p.lecture_no}">读全讲 →</a></span></div>
    </div>`).join('');

  $('#reader').innerHTML = `
    <header class="hero">
      <span class="hero-cat">方剂 · 第${cnNum(f.chapter_no)}篇</span>
      <h2>${esc(f.name)}</h2>
      ${f.func ? `<div class="hero-meta"><span>功用 <b>${esc(f.func)}</b></span></div>` : ''}
    </header>
    <div class="formula open" style="margin-top:24px">
      <div class="f-body" style="display:block">
        ${f.herbs ? row('组成', f.herbs, 'herbs') : '<div class="f-row"><div class="f-k">组成</div><div class="f-v">底本未列组成，见原文。</div></div>'}
        ${f.herb_links?.length ? `<div class="pill-row" style="margin:2px 0 10px">${f.herb_links.map(h => `<a class="pill" href="#/h/${h.id}">${esc(h.name)}</a>`).join('')}</div>` : ''}
        ${f.herbs_t ? row('语译', f.herbs_t) : ''}
        ${f.usage ? row('煎服', f.usage) : ''}
        ${f.usage_t ? row('白话', f.usage_t) : ''}
        ${f.notes ? row('按', f.notes) : ''}
      </div>
    </div>
    ${d.clause ? `<section class="hao-sec"><div class="sec-head"><h3>出处条文</h3><span>第 ${d.clause.no} 条</span></div>
      <div class="clause" style="padding-left:0;border:0">
        <p class="origin">${esc(d.clause.origin)}</p>
        ${d.clause.translation ? `<p class="trans"><span class="lb">白话</span>${esc(d.clause.translation)}</p>` : ''}
        ${d.clause.note ? `<p class="note"><span class="lb">按</span>${esc(d.clause.note)}</p>` : ''}
        <a class="f-link" href="#/c/${d.clause.chapter_no}?c=${d.clause.no}">在篇章中查看 →</a>
      </div></section>` : ''}
    ${ps ? `<section class="hao-sec"><div class="sec-head"><h3>郝万山讲解</h3><span>${d.passages.length} 段</span></div>
      <div class="acc">${ps}</div></section>` : ''}
    ${d.siblings.length ? `<section class="hao-sec"><div class="sec-head"><h3>同篇方剂</h3></div>
      <div class="pill-row">${d.siblings.map(s => `<a class="pill" href="#/f/${s.id}">${esc(s.name)}</a>`).join('')}</div></section>` : ''}`;
}

/* ---------------- 中药页 ---------------- */
async function viewHerb(id) {
  const d = await api('/api/herb/' + id);
  const h = d.herb;
  $('#crumb').innerHTML = `<b>中药</b> · ${esc(h.category)} · ${esc(h.name)}`;
  document.title = h.name + ' · 伤寒杂病论';

  const CAP = 36, head = d.formulas.slice(0, CAP), rest = d.formulas.slice(CAP);
  const pill = f => `<a class="pill" href="#/f/${f.id}" title="${esc(f.func || '')}">${esc(f.name)}</a>`;
  const fs = d.formulas.length ? `
    <section class="hao-sec">
      <div class="sec-head"><h3>相关方剂</h3><span>共 ${d.formulas.length} 首</span></div>
      <div class="pill-row">${head.map(pill).join('')}</div>
      ${rest.length ? `<div class="pill-row" id="morePills" hidden>${rest.map(pill).join('')}</div>
        <button class="more-btn" data-more>展开其余 ${rest.length} 首 ▾</button>` : ''}
    </section>` : '';

  const chs = d.chapters.length ? `
    <section class="hao-sec">
      <div class="sec-head"><h3>见于篇章</h3><span>${d.chapters.length} 篇</span></div>
      <div class="pill-row">${d.chapters.map(c => `<a class="pill" href="#/c/${c.no}">${esc(c.title)}</a>`).join('')}</div>
    </section>` : '';

  $('#reader').innerHTML = `
    <header class="hero">
      <span class="hero-cat">${esc(h.category)}</span>
      <h2>${esc(h.name)}${h.alias && h.alias !== h.name ? `<span class="hero-alias">别名 ${esc(h.alias)}</span>` : ''}</h2>
      <div class="hb-chips">
        <span class="hb-chip zhu"><b>性味</b>${esc(h.nature)}</span>
        <span class="hb-chip zhu"><b>归经</b>${esc(h.meridian)}</span>
        <span class="hb-chip"><b>见于</b>${h.formula_count} 方</span>
      </div>
    </header>
    <div class="hb-fields">
      <div class="hb-row"><div class="hb-k">功效</div><div class="hb-v">${esc(h.effect)}</div></div>
      <div class="hb-row"><div class="hb-k">主治</div><div class="hb-v">${esc(h.indication)}</div></div>
      <div class="hb-row"><div class="hb-k">现代药理</div><div class="hb-v modern">${esc(h.modern)}</div></div>
    </div>
    <p class="hb-note">性味归经与功效主治依《中药学》教材通行表述；现代药理为研究提示，不构成用药建议。</p>
    ${fs}${chs}`;
}

/* ---------------- 搜索 ---------------- */
let searchTimer, searchItems = [], searchSel = -1;

function openSearch() {
  $('#overlay').hidden = false;
  const inp = $('#searchInput');
  inp.value = '';
  inp.focus();
  $('#searchBody').innerHTML = '<p class="search-empty">试试：桂枝汤 · 胃家实 · 柴胡 · 但欲寐</p>';
  searchItems = []; searchSel = -1;
}
function closeSearch() { $('#overlay').hidden = true; }

async function doSearch(q) {
  if (!q) { $('#searchBody').innerHTML = '<p class="search-empty">试试：桂枝汤 · 胃家实 · 柴胡 · 但欲寐</p>'; searchItems = []; return; }
  const d = await api('/api/search?q=' + encodeURIComponent(q));
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const hl = s => esc(s).replace(re, m => `<em>${m}</em>`);
  // 命中处上下文片段
  const snip = (text, span = 46) => {
    const i = text.indexOf(q);
    if (i < 0) return hl(text.slice(0, span * 2));
    const a = Math.max(0, i - span), b = Math.min(text.length, i + q.length + span);
    return (a ? '…' : '') + hl(text.slice(a, b)) + (b < text.length ? '…' : '');
  };
  const parts = [];

  if (d.herbs?.length) {
    parts.push('<div class="s-group"><h4>中药 · ' + d.herbs.length + '</h4>' + d.herbs.slice(0, 10).map(h => `
      <button class="s-item" data-go="#/h/${h.id}">
        <div class="t">${esc(h.category)} · 见于 ${h.formula_count} 方</div>
        <div class="x">${hl(h.name)}　<span style="color:var(--ink-3)">${esc(h.nature || '')}　${esc((h.effect || '').slice(0, 24))}</span></div>
      </button>`).join('') + '</div>');
  }
  if (d.formulas.length) {
    parts.push('<div class="s-group"><h4>方剂 · ' + d.formulas.length + '</h4>' + d.formulas.slice(0, 12).map(f => `
      <button class="s-item" data-go="#/f/${f.id}">
        <div class="t">第${cnNum(f.chapter_no)}篇 · 方剂</div>
        <div class="x">${hl(f.name)}　<span style="color:var(--ink-3)">${esc(f.func || '')}</span></div>
      </button>`).join('') + '</div>');
  }
  if (d.clauses.length) {
    parts.push('<div class="s-group"><h4>条文 · ' + d.clauses.length + '</h4>' + d.clauses.slice(0, 30).map(c => `
      <button class="s-item" data-go="#/c/${c.chapter_no}?c=${c.no}">
        <div class="t">${esc(c.ctitle)} · 第 ${c.no} 条</div>
        <div class="x">${snip(c.origin + ' ' + (c.translation || ''))}</div>
      </button>`).join('') + '</div>');
  }
  if (d.passages.length) {
    parts.push('<div class="s-group"><h4>郝万山讲稿 · ' + d.passages.length + '</h4>' + d.passages.slice(0, 30).map(p => `
      <button class="s-item" data-go="#/l/${p.lecture_no}">
        <div class="t">第 ${p.lecture_no} 讲 · ${esc(p.ltitle)}</div>
        <div class="x">${snip(p.text)}</div>
      </button>`).join('') + '</div>');
  }
  $('#searchBody').innerHTML = parts.length ? parts.join('') : `<p class="search-empty">没有找到「${esc(q)}」</p>`;
  searchItems = $$('.s-item');
  searchSel = -1;
}

/* ---------------- 事件 ---------------- */
function bindEvents() {
  // 侧栏标签
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + t.dataset.pane));
  });

  // 阅读设置
  $('#modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    saveSettings({ mode: b.dataset.mode });
    if (S.route.view === 'chapter') $$('.formula').forEach(f => f.classList.toggle('open', b.dataset.mode === 'all'));
  });
  $('#fontUp').onclick = () => saveSettings({ fs: Math.min(4, S.settings.fs + 1) });
  $('#fontDown').onclick = () => saveSettings({ fs: Math.max(-2, S.settings.fs - 1) });
  $('#themeBtn').onclick = () => saveSettings({ theme: S.settings.theme === 'paper' ? 'night' : 'paper' });

  // 正文交互（事件委托）
  $('#reader').addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-toggle]')) { t.closest('.formula').classList.toggle('open'); return; }
    if (t.closest('[data-acc]')) {
      const it = t.closest('.acc-item');
      it.classList.toggle('open');
      const more = $('.acc-more', it);
      if (more) more.textContent = it.classList.contains('open') ? '收起' : '展开';
      return;
    }
    const more = t.closest('[data-more]');
    if (more) { $('#morePills').hidden = false; more.remove(); return; }
    const mk = t.closest('[data-mark]');
    if (mk) { e.preventDefault(); toggleMark(mk.dataset.mark); return; }
    const a = t.closest('a[href^="#"]');
    if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); }
  });

  // 搜索
  $('#searchTrigger').onclick = openSearch;
  $('#searchClose').onclick = closeSearch;
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSearch(); });
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => doSearch(q), 160);
  });
  $('#searchBody').addEventListener('click', e => {
    const it = e.target.closest('.s-item');
    if (it) { closeSearch(); go(it.dataset.go.slice(1)); }
  });

  // 键盘
  document.addEventListener('keydown', e => {
    const inInput = /INPUT|TEXTAREA/.test(e.target.tagName);
    if (e.key === 'Escape' && !$('#overlay').hidden) return closeSearch();
    if (e.key === '/' && !inInput) { e.preventDefault(); openSearch(); return; }
    if (!$('#overlay').hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (!searchItems.length) return;
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + searchItems.length) % searchItems.length;
      searchItems.forEach((x, i) => x.classList.toggle('sel', i === searchSel));
      searchItems[searchSel].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (!$('#overlay').hidden && e.key === 'Enter' && searchSel >= 0) {
      const it = searchItems[searchSel]; closeSearch(); go(it.dataset.go.slice(1)); return;
    }
    if (inInput) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const a = e.key === 'ArrowLeft' ? $('.pager a:not(.r)') : $('.pager a.r');
      if (a) { e.preventDefault(); go(a.getAttribute('href').slice(1)); }
    }
  });

  // 滚动进度
  $('#main').addEventListener('scroll', () => {
    const el = $('#main');
    const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    $('#progress').style.width = (p * 100).toFixed(1) + '%';
  }, { passive: true });

  // 来源
  $('#aboutLink').onclick = e => { e.preventDefault(); showSources(); };
}

function toggleMark(no) {
  const chNo = S.route.id;
  const el = $('#cl-' + no);
  if (!el) return;
  const i = S.marks.findIndex(m => m.chapter_no === chNo && m.no === +no);
  if (i >= 0) { S.marks.splice(i, 1); toast('已取消收藏'); }
  else {
    S.marks.unshift({
      chapter_no: chNo, no: +no, ctitle: $('#reader .hero h2')?.textContent || '',
      origin: $('.origin', el).textContent,
    });
    toast('已加入收藏');
  }
  store.set('marks', S.marks);
  const link = $('[data-mark="' + no + '"]', el);
  if (link) link.textContent = i >= 0 ? '☆ 收藏此条' : '★ 已收藏';
  renderMarks();
}

function showSources() {
  const items = S.boot.sources.map(s => `
    <div class="s-group"><h4>${esc(s.kind)}</h4>
      <button class="s-item" data-go="${esc(s.url)}">
        <div class="x">${esc(s.title)}</div>
        <div class="t" style="color:var(--ink-3);margin-top:4px">${esc(s.note)}</div>
      </button></div>`).join('');
  $('#searchBody').innerHTML = `<div class="s-group"><h4>资料来源</h4>
    <p style="padding:0 10px;font-family:var(--sans);font-size:11px;color:var(--ink-3);line-height:1.9">
    原文取自易推智道经典书库桂林古本；郝万山讲解取自其《伤寒论》七十讲讲稿。</p></div>${items}`;
  $('#overlay').hidden = false;
  $('#searchInput').value = '';
  $$('#searchBody .s-item').forEach(b => b.onclick = () => window.open(b.dataset.go, '_blank'));
}

/* ---------------- 记录当前篇章 ---------------- */
bindEvents();
boot();
