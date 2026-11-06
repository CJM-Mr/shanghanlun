/* ============================================================
   《伤寒杂病论》研读 — 前端逻辑
   原生 ES2022 · 无框架 · 无构建
   ============================================================ */
'use strict';

/* ---------------- 基础工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CN = '〇一二三四五六七八九';
const cnNum = n => n <= 10 ? (n === 10 ? '十' : CN[n])
  : n < 20 ? '十' + CN[n % 10]
    : n < 100 ? CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '')
      : String(n);

const api = async path => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
};

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('sh.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('sh.' + k, JSON.stringify(v)),
};

const S = {
  boot: null,
  route: { view: 'home', id: 0 },
  marks: store.get('marks', []),
  settings: store.get('settings', { mode: 'all', fs: 1, theme: 'paper' }),
  pulseMap: new Map(),
};

/* ---------------- 通用片段 ---------------- */
const row = (k, v, cls = '') => `<div class="f-row"><div class="f-k">${k}</div><div class="f-v ${cls}">${esc(v)}</div></div>`;
const pill = (href, text, title = '') =>
  `<a class="pill" href="${href}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</a>`;
const pills = (items, cls = '') => items.length ? `<div class="pill-row ${cls}">${items.join('')}</div>` : '';

const section = (title, meta = '', body = '') => `
  <section class="sec">
    <div class="sec-head"><h3>${title}</h3>${meta ? `<span>${meta}</span>` : ''}</div>
    ${body}
  </section>`;

/** 页头：分类标签 + 标题 + 元信息行 + 附加内容 */
const hero = (cat, title, meta = '', extra = '') => `
  <header class="hero">
    <span class="hero-cat">${cat}</span>
    <h2>${title}</h2>
    ${meta ? `<div class="hero-meta">${meta}</div>` : ''}
    ${extra}
  </header>`;

/** 元信息项，如「条文 35」 */
const mi = (k, v) => `<span>${k} <b>${v}</b></span>`;

/** 条文正文：原文 / 白话 / 按语 */
const clauseBody = c => `
  <p class="origin">${esc(c.origin)}</p>
  ${c.translation ? `<p class="trans"><span class="lb">白话</span>${esc(c.translation)}</p>` : ''}
  ${c.note ? `<p class="note"><span class="lb">按</span>${esc(c.note)}</p>` : ''}`;

/** 折叠条目：no 左侧标签，title 主文，body 展开内容 */
const accItem = (no, title, body, { preview = '', open = false, src = '' } = {}) => `
  <div class="acc-item${open ? ' open' : ''}">
    <button class="acc-head" data-acc>
      <span class="acc-no">${no}</span>
      <span class="acc-title">${title}</span>
      <span class="acc-more">${open ? '收起' : '展开'}</span>
      ${preview ? `<span class="acc-preview">${preview}</span>` : ''}
    </button>
    <div class="acc-body">${body}${src ? `<span class="src">${src}</span>` : ''}</div>
  </div>`;

const PAGER_ROUTE = { 篇: 'c', 讲: 'l', 脉: 'p' };
const pager = (prev, next, kind = '篇') => {
  const r = PAGER_ROUTE[kind] || 'c';
  const label = o => esc(o.name || o.title || '');
  return `
  <nav class="pager">
    ${prev ? `<a href="#/${r}/${prev.no}"><small>上一${kind}</small>${label(prev)}</a>` : '<span></span>'}
    ${next ? `<a class="r" href="#/${r}/${next.no}"><small>下一${kind}</small>${label(next)}</a>` : '<span></span>'}
  </nav>`;
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
}

/* ---------------- 脉象动画 ---------------- */
const PULSE_DEF = { pos: .45, rate: 72, amp: 1, w: 1, ten: .5, slip: .5, span: 1, rhythm: 'reg', shape: 'normal' };
const DPR = Math.min(2, window.devicePixelRatio || 1);
let COL = { zhu: '#9c2b24', line: '#e3d8bf' };

function readColors() {
  const s = getComputedStyle(document.documentElement);
  COL = {
    zhu: s.getPropertyValue('--zhu').trim() || COL.zhu,
    line: s.getPropertyValue('--line').trim() || COL.line,
  };
}

const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* 节律门：1 为正常搏动，0 为歇止 */
const GATE = {
  cu: i => (i % 4 === 3 ? 0 : 1),      // 促：数而时止，止无定数
  jie: i => (i % 3 === 2 ? 0 : 1),     // 结：缓而时止，止无定数
  dai: i => (i % 5 >= 3 ? 0 : 1),      // 代：止有定数，良久方来
};

/** 单次搏动的振幅，ph 为相位 0→1 */
function beat(ph, p, i) {
  const wl = .05 + .07 * (1 - p.ten);                  // 张力大 → 波峰窄
  const wr = wl * (p.shape === 'flood' ? 3 : 1.35);    // 洪脉来盛去衰
  const g = (c, k = 1) => {
    const d = ph - c, w = (d < 0 ? wl : wr) * k;
    return Math.exp(-((d / w) ** 2));
  };
  let a = g(.30) + (.15 + .45 * p.slip) * g(.58, 1.15);              // 主波 + 重搏波
  if (p.shape === 'kou') a = g(.24, 1.2) + .8 * g(.56, 1.3) - .95 * g(.40, .6);  // 中空如按葱管
  if (p.shape === 'taut') a = Math.min(1, a * 1.5);                  // 端直而平顶
  if (p.shape === 'cuo') a *= .8 + .35 * Math.sin(ph * 46);          // 涩：往来蹇滞
  if (p.shape === 'san') a = (.35 + .65 * rnd(i * 7 + Math.floor(ph * 3))) * g(.45);  // 散：涣散无根
  return Math.max(0, a);
}

function drawTrace(cv, p, t) {
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * DPR)) {
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
  }
  const c = cv.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, H);

  const base = H * .74, ampPx = H * .52 * p.amp;
  c.strokeStyle = COL.line; c.lineWidth = 1; c.setLineDash([3, 5]);
  c.beginPath(); c.moveTo(0, base + .5); c.lineTo(W, base + .5); c.stroke();
  c.setLineDash([]);

  const cycles = (p.rate / 60) * 2.4;   // 屏内 2.4 秒的搏动次数
  const gate = GATE[p.rhythm];
  const step = H < 80 ? 2 : 1;

  c.beginPath();
  for (let x = 0; x <= W; x += step) {
    const tt = (x / W) * cycles + t * (p.rate / 60);
    const i = Math.floor(tt);
    const ph = (tt - i - .4) / p.span + .4;
    let a = beat(ph, p, i) * (gate ? gate(i) : 1);
    if (p.shape === 'dong' && (x < W * .34 || x > W * .66)) a = 0;   // 独见于关
    const y = base - a * ampPx;
    x ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.strokeStyle = COL.zhu;
  c.lineWidth = Math.max(1, 1.5 * p.w);
  c.lineJoin = c.lineCap = 'round';
  c.stroke();
}

let animId = 0, animT0 = 0, animLast = 0;
function startPulseAnim() {
  cancelAnimationFrame(animId);
  const nodes = $$('canvas[data-pno]');
  if (!nodes.length) return;
  const items = nodes.map(cv => ({
    cv, p: { ...PULSE_DEF, ...(S.pulseMap.get(+cv.dataset.pno) || {}).anim },
  }));
  animT0 = animLast = performance.now();
  const step = now => {
    animId = requestAnimationFrame(step);
    if (now - animLast < 32) return;          // 约 30fps，28 个缩略图也不卡
    animLast = now;
    const t = (now - animT0) / 1000;
    for (const it of items) drawTrace(it.cv, it.p, t);
  };
  animId = requestAnimationFrame(step);
}

/* ---------------- 启动与设置 ---------------- */
async function boot() {
  applySettings();
  S.boot = await api('/api/bootstrap');
  S.pulseMap = new Map(S.boot.pulses.map(p => [p.no, p]));
  const { stats } = S.boot;
  $('#footStats').textContent = `${stats.c} 条 · ${stats.f} 方 · ${stats.p} 段`;
  renderSidebar();
  bindEvents();
  window.addEventListener('hashchange', route);
  route();
  setInterval(() => fetch('/api/hb', { method: 'POST' }).catch(() => { }), 4000);
}

function applySettings() {
  const { mode, fs, theme } = S.settings;
  document.body.dataset.mode = mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--fs', (0.94 + fs * 0.06).toFixed(3) + 'rem');
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  readColors();
}

function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  store.set('settings', S.settings);
  applySettings();
}

/* ---------------- 侧栏 ---------------- */
function renderSidebar() {
  const { chapters, lectures, categories, formulas, herbs } = S.boot;

  $('#pane-chapters').innerHTML = categories.map(cat => {
    const list = chapters.filter(c => c.category === cat);
    return `<div class="cat-head"><i></i>${esc(cat)}</div>` + list.map(c => `
      <a class="ch-item" href="#/c/${c.no}" data-key="c${c.no}">
        <span class="ch-no">${String(c.no).padStart(2, '0')}</span>
        <span class="ch-title">${esc(c.title)}</span>
        <span class="ch-meta">${c.clause_count}</span>
      </a>`).join('');
  }).join('');

  $('#pane-lectures').innerHTML = lectures.map(l => `
    <a class="lec-item" href="#/l/${l.no}" data-key="l${l.no}">
      <span class="ch-no">${String(l.no).padStart(2, '0')}</span>
      <span class="ch-title">${esc(l.title)}</span>
      <span class="lec-tag">${esc(l.category)}</span>
    </a>`).join('');

  renderFormulaList('');
  renderHerbList('');
  renderPulseList();
  renderMarks();

  $('#formulaFilter').addEventListener('input', e => renderFormulaList(e.target.value.trim()));
  $('#herbFilter').addEventListener('input', e => renderHerbList(e.target.value.trim()));
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
  for (const h of list) groups.set(h.category, [...(groups.get(h.category) || []), h]);
  $('#herbList').innerHTML = list.length ? [...groups].map(([cat, hs]) => `
    <div class="cat-head"><i></i>${esc(cat)} · ${hs.length}</div>` + hs.map(h => `
      <a class="ch-item herb-item" href="#/h/${h.id}">
        <span class="ch-title">${esc(h.name)}</span>
        <span class="ch-meta">${h.formula_count}</span>
      </a>`).join('')).join('') : '<div class="empty">没有匹配的药材</div>';
}

function renderPulseList() {
  const { pulses, pulseGroups } = S.boot;
  $('#pane-pulses').innerHTML = pulseGroups.map(g => {
    const list = pulses.filter(p => p.group === g);
    return `<div class="cat-head"><i></i>${g} · ${list.length}</div>` + list.map(p => `
      <a class="ch-item pulse-item" href="#/p/${p.no}" data-key="p${p.no}">
        <span class="ch-title">${esc(p.name)}<span class="py">${p.py}</span></span>
        <span class="ch-meta">${esc(p.ill[0])}</span>
      </a>`).join('');
  }).join('');
}

function renderMarks() {
  $('#pane-marks').innerHTML = S.marks.length ? S.marks.map(m => `
    <a class="ch-item" href="#/c/${m.chapter_no}?c=${m.no}">
      <span class="ch-no">${m.no}</span>
      <span class="ch-title">${esc(m.origin.slice(0, 22))}…</span>
      <span class="ch-meta">${esc(m.ctitle.slice(0, 4))}</span>
    </a>`).join('') : '<div class="empty">还没有收藏<br>阅读时点击条文右上角的 ☆</div>';
}

const PANE_OF = { chapter: 'chapters', lecture: 'lectures', formula: 'formulas', herb: 'herbs', pulse: 'pulses', home: 'chapters' };

function activatePane(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
}

function markActive(key) {
  $$('.ch-item, .lec-item').forEach(a => a.classList.toggle('active', a.dataset.key === key));
  $('.ch-item.active, .lec-item.active')?.scrollIntoView({ block: 'nearest' });
}

/* ---------------- 路由 ---------------- */
const VIEWS = { c: 'chapter', l: 'lecture', f: 'formula', h: 'herb', p: 'pulse' };
const RENDER = { chapter: viewChapter, lecture: viewLecture, formula: viewFormula, herb: viewHerb, pulse: viewPulse };

function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(qs || '');

  if (path === '/search') {
    renderWelcome();
    openSearch();
    $('#searchInput').value = q.get('q') || '';
    return doSearch(q.get('q') || '');
  }

  const [, kind, id] = path.split('/');
  S.route = { view: VIEWS[kind] || 'home', id: +id };
  activatePane(PANE_OF[S.route.view]);
  $('#main').scrollTop = 0;

  const render = RENDER[S.route.view];
  Promise.resolve(render ? render(+id, q) : renderWelcome()).then(startPulseAnim);
}

const go = hash => { location.hash = hash; };

/* ---------------- 首页 ---------------- */
function renderWelcome() {
  const { stats } = S.boot;
  $('#crumb').textContent = '全书目录';
  markActive('');
  $('#reader').innerHTML = `
    <div class="welcome">
      <div class="welcome-seal">傷</div>
      <h2>伤寒杂病论</h2>
      <p class="welcome-sub">桂林古本三十四篇 · 逐条拆解 · 郝万山七十讲</p>
      <div class="welcome-grid">
        <div class="stat"><b>${stats.c}</b><span>条文</span></div>
        <div class="stat"><b>${stats.f}</b><span>方剂</span></div>
        <div class="stat"><b>${stats.h}</b><span>中药</span></div>
        <div class="stat"><b>${S.boot.pulses.length}</b><span>脉象</span></div>
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
  document.title = ch.title + ' · 伤寒杂病论';
  markActive('c' + no);

  $('#reader').innerHTML = `
    ${hero(`${esc(ch.category)} · 第${cnNum(ch.no)}篇`, esc(ch.title),
      mi('条文', ch.clause_count) + mi('方剂', ch.formula_count) +
      mi('原文', ch.char_count.toLocaleString() + ' 字') + mi('郝万山讲解', d.passages.length + ' 段'),
      ch.guide ? `<div class="guide">${ch.guide.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}</div>` : '')}
    <div class="clauses">${d.clauses.map(clauseHTML).join('') || '<div class="empty">本篇暂无条文</div>'}</div>
    ${haoSection(d.passages)}
    ${pager(d.prev, d.next)}`;

  const jump = q.get('c');
  if (jump) {
    const el = $('#cl-' + jump);
    el?.scrollIntoView({ block: 'center' });
    el?.classList.add('flash');
  }
}

function clauseHTML(c) {
  const marked = S.marks.some(m => m.chapter_no === c.chapter_no && m.no === c.no);
  return `
    <section class="clause" id="cl-${c.no}">
      <div class="cno">${c.no}</div>
      ${clauseBody(c)}
      ${c.formulas.map(formulaHTML).join('')}
      <a class="f-link mark-link" href="#" data-mark="${c.no}">${marked ? '★ 已收藏' : '☆ 收藏'}</a>
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

/* 郝万山解读：按讲次归并 */
function haoSection(passages) {
  if (!passages.length) {
    return section('郝万山解读', '本篇暂无自动匹配段落',
      '<p class="sec-note">可前往左侧「郝万山」标签，按七十讲的顺序通读讲稿。</p>');
  }
  const groups = new Map();
  for (const p of passages) groups.set(p.lecture_no, [...(groups.get(p.lecture_no) || []), p]);

  const items = [...groups].map(([no, ps]) => accItem(
    `第 ${no} 讲`,
    `${esc(ps[0].title.split(' · ')[1] || '')} · ${ps.length} 段`,
    ps.map(p => `<p>${esc(p.text)}</p>`).join(''),
    {
      preview: esc(ps[0].text.slice(0, 90)),
      src: `出处：郝万山讲《伤寒论》第 ${no} 讲　<a href="#/l/${no}">读全讲 →</a>`,
    })).join('');

  return section('郝万山解读', `共 ${passages.length} 段 · 摘自七十讲讲稿`,
    `<p class="sec-note">段落依方证关键词自动归入本篇，仅作索引；讲稿原文见「郝万山」栏目。</p>
     <div class="acc">${items}</div>`);
}

/* ---------------- 讲次页 ---------------- */
async function viewLecture(no) {
  const d = await api('/api/lecture/' + no);
  const L = d.lecture;
  $('#crumb').innerHTML = `<b>郝万山</b> · 第 ${L.no} 讲`;
  document.title = `第${L.no}讲 ${L.title} · 郝万山`;
  markActive('l' + no);

  const names = [...new Set(d.passages.flatMap(p => (p.formula_names || '').split('、').filter(Boolean)))].slice(0, 12);
  const fmap = new Map(S.boot.formulas.map(f => [f.name, f.id]));

  $('#reader').innerHTML = `
    ${hero('郝万山 · 讲稿', `第${L.no}讲　${esc(L.title)}`,
      mi('讲稿', L.char_count.toLocaleString() + ' 字') + mi('分段', L.passage_count) +
      (d.chapter ? mi('对应', esc(d.chapter.title)) : '<span>通论 / 专题</span>'),
      pills(names.map(n => fmap.has(n) ? pill(`#/f/${fmap.get(n)}`, n) : `<span class="pill">${esc(n)}</span>`)))}
    <div class="lec-body">${d.passages.map(p => `<p>${esc(p.text)}</p>`).join('')}</div>
    ${d.chapter ? pager({ no: d.chapter.no, title: d.chapter.title }, null, '篇') : ''}
    ${pager(d.prev, d.next, '讲')}`;
}

/* ---------------- 方剂页 ---------------- */
async function viewFormula(id) {
  const d = await api('/api/formula/' + id);
  const f = d.formula;
  $('#crumb').innerHTML = `<b>方剂</b> · ${esc(f.name)}`;
  document.title = f.name + ' · 伤寒杂病论';

  const acc = d.passages.map((p, i) => accItem(
    `第 ${p.lecture_no} 讲`,
    esc(p.title.split(' · ')[1] || ''),
    `<p>${esc(p.text)}</p>`,
    { open: i === 0, src: `出处：第 ${p.lecture_no} 讲　<a href="#/l/${p.lecture_no}">读全讲 →</a>` })).join('');

  const c = d.clause;
  const source = c ? section('出处条文', `第 ${c.no} 条`, `
    <div class="clause plain">
      ${clauseBody(c)}
      <a class="f-link" href="#/c/${c.chapter_no}?c=${c.no}">在篇章中查看 →</a>
    </div>`) : '';

  $('#reader').innerHTML = `
    ${hero(`方剂 · 第${cnNum(f.chapter_no)}篇`, esc(f.name), f.func ? mi('功用', esc(f.func)) : '')}
    <div class="formula static open">
      <div class="f-body">
        ${f.herbs ? row('组成', f.herbs, 'herbs') : row('组成', '底本未列组成，见原文。')}
        ${pills((f.herb_links || []).map(h => pill(`#/h/${h.id}`, h.name)), 'tight')}
        ${f.herbs_t ? row('语译', f.herbs_t) : ''}
        ${f.usage ? row('煎服', f.usage) : ''}
        ${f.usage_t ? row('白话', f.usage_t) : ''}
        ${f.notes ? row('按', f.notes) : ''}
      </div>
    </div>
    ${source}
    ${acc ? section('郝万山讲解', `${d.passages.length} 段`, `<div class="acc">${acc}</div>`) : ''}
    ${d.siblings.length ? section('同篇方剂', '', pills(d.siblings.map(s => pill(`#/f/${s.id}`, s.name)))) : ''}`;
}

/* ---------------- 中药页 ---------------- */
async function viewHerb(id) {
  const d = await api('/api/herb/' + id);
  const h = d.herb;
  $('#crumb').innerHTML = `<b>中药</b> · ${esc(h.category)} · ${esc(h.name)}`;
  document.title = h.name + ' · 伤寒杂病论';

  const CAP = 36;
  const head = d.formulas.slice(0, CAP), rest = d.formulas.slice(CAP);
  const toPill = f => pill(`#/f/${f.id}`, f.name, f.func);

  const formulas = d.formulas.length ? section('相关方剂', `去重 ${d.formulas.length} 首 · 全书引用 ${h.formula_count} 处`,
    pills(head.map(toPill)) +
    (rest.length ? `<div class="pill-row" id="morePills" hidden>${rest.map(toPill).join('')}</div>
      <button class="more-btn" data-more>展开其余 ${rest.length} 首 ▾</button>` : '')) : '';

  const chapters = d.chapters.length ? section('见于篇章', `${d.chapters.length} 篇`,
    pills(d.chapters.map(c => pill(`#/c/${c.no}`, c.title)))) : '';

  $('#reader').innerHTML = `
    ${hero(esc(h.category),
      esc(h.name) + (h.alias && h.alias !== h.name ? `<span class="hero-alias">别名 ${esc(h.alias)}</span>` : ''),
      '', `<div class="hb-chips">
        <span class="hb-chip zhu"><b>性味</b>${esc(h.nature)}</span>
        <span class="hb-chip zhu"><b>归经</b>${esc(h.meridian)}</span>
        <span class="hb-chip"><b>见于</b>${h.formula_count} 处</span>
      </div>`)}
    <div class="hb-fields">
      <div class="hb-row"><div class="hb-k">功效</div><div class="hb-v">${esc(h.effect)}</div></div>
      <div class="hb-row"><div class="hb-k">主治</div><div class="hb-v">${esc(h.indication)}</div></div>
      <div class="hb-row"><div class="hb-k">现代药理</div><div class="hb-v modern">${esc(h.modern)}</div></div>
    </div>
    <p class="hb-note">性味归经与功效主治依《中药学》教材通行表述；现代药理为研究提示，不构成用药建议。</p>
    ${formulas}${chapters}`;
}

/* ---------------- 脉学 ---------------- */
const SIX = [
  ['脉位浅深', '浮', '沉', '浮主表，沉主里'],
  ['至数快慢', '迟', '数', '迟主寒，数主热'],
  ['脉力强弱', '虚', '实', '虚主不足，实主有余'],
];

function renderPulseOverview() {
  const { pulses, pulseGroups } = S.boot;
  $('#crumb').innerHTML = '<b>脉学</b> · 二十八脉';
  document.title = '二十八脉 · 伤寒杂病论';
  markActive('');

  const groups = pulseGroups.map(g => {
    const list = pulses.filter(p => p.group === g);
    return `<div class="pgroup">
      <div class="pg-head"><i></i>${g} · ${list.length}</div>
      <div class="pulse-grid">${list.map(p => `
        <a class="pcard" href="#/p/${p.no}">
          <div class="pcard-top">
            <span class="pc-name">${esc(p.name)}</span>
            <span class="pc-py">${p.py}</span>
            <span class="pc-no">${String(p.no).padStart(2, '0')}</span>
          </div>
          <canvas data-pno="${p.no}"></canvas>
          <div class="pc-ill">${esc(p.ill.join(' · '))}</div>
        </a>`).join('')}</div>
    </div>`;
  }).join('');

  $('#reader').innerHTML = `
    ${hero('脉学 · 二十八脉', '二十八脉', mi('脉象', 28) + mi('分部', '左右手各三部'))}
    <p class="pulse-lead">脉诊独取寸口：掌后高骨内侧为关，关前为寸，关后为尺。左手候心、肝、肾，右手候肺、脾、命门。
      二十八脉自《濒湖脉学》定型，以浮、沉、迟、数、虚、实为六纲，余脉皆由此派生。下列每脉皆列指下体状、形成原理、
      主病与六部分布，并以动态波形示意其搏动之象。</p>
    <div class="six-row">${SIX.map(([k, a, b, h]) => `
      <div class="six-card">
        <div class="sk">${k}</div>
        <div class="sv"><b>${a}</b> ⇄ <b>${b}</b></div>
        <div class="sh">${h}</div>
      </div>`).join('')}</div>
    ${groups}`;
}

async function viewPulse(no) {
  if (!no) return renderPulseOverview();

  const d = await api('/api/pulse/' + no);
  const p = d.pulse, a = { ...PULSE_DEF, ...p.anim };
  $('#crumb').innerHTML = `<b>二十八脉</b> · ${esc(p.group)} · ${esc(p.name)}脉`;
  document.title = `${p.name}脉 ${p.py} · 伤寒杂病论`;
  markActive('p' + no);

  const depth = a.pos < .3 ? '浮 · 轻取即得' : a.pos > .75 ? '沉 · 重按始得' : '中 · 不浮不沉';
  const facts = [
    `一息约 <b>${(a.rate / 18).toFixed(1)}</b> 至`,
    `<b>${a.rate}</b> 次/分`,
    `脉位 <b>${depth}</b>`,
    `力度 <b>${a.amp >= 1.1 ? '实' : a.amp <= .5 ? '虚' : '中'}</b>`,
    `脉体 <b>${a.span > 1.1 ? '长' : a.span < .8 ? '短' : '中'}</b>`,
    `张力 <b>${a.ten >= .8 ? '强' : a.ten <= .25 ? '弱' : '中'}</b>`,
  ];

  const parts = [0, 3].map(s => `
    <div class="pg-side">${d.parts[s].side}</div>
    ${d.parts.slice(s, s + 3).map((pt, i) => `
      <div class="part">
        <div class="pt-head"><b>${pt.side}${pt.pos}</b><span>${pt.organ} · ${pt.sub}</span></div>
        <p>${esc(p.parts[s + i])}</p>
      </div>`).join('')}`).join('');

  $('#reader').innerHTML = `
    ${hero(`二十八脉 · ${p.group}`, `${esc(p.name)}脉<span class="hero-alias">${p.py}</span>`,
      mi('序', `${p.no} / 28`) + mi('归类', p.group) + mi('主病', esc(p.ill[0])))}
    <div class="pulse-stage">
      <div class="pa-gauge" style="--pos:${a.pos}">
        <div class="pg-track"><i></i></div>
        <div class="pg-labels"><span>皮</span><span>肉</span><span>筋</span><span>骨</span></div>
      </div>
      <div class="pa-wave">
        <canvas data-pno="${p.no}"></canvas>
        <div class="pa-facts">${facts.map(f => `<span class="pa-fact">${f}</span>`).join('')}</div>
      </div>
    </div>
    ${section('脉象体状', '指下所得', `<p class="pulse-text">${esc(p.shape)}</p>`)}
    ${section('形成原理', '何以有此象', `<p class="pulse-text">${esc(p.why)}</p>`)}
    ${section('主　病', `${p.ill.length} 类`, `<div class="pulse-ill">${p.ill.map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>`)}
    ${section('相关反应', '临床可见', `<p class="pulse-text">${esc(p.signs)}</p>`)}
    ${section('左右手六部', '寸关尺各有所主', `<div class="parts-grid">${parts}</div>`)}
    ${pager(d.prev, d.next, '脉')}`;
}

/* ---------------- 搜索 ---------------- */
const SEARCH_TIP = '<p class="search-empty">试试：桂枝汤 · 胃家实 · 柴胡 · 弦脉 · 但欲寐</p>';
let searchTimer, searchItems = [], searchSel = -1;

function openSearch() {
  $('#overlay').hidden = false;
  $('#searchBody').innerHTML = SEARCH_TIP;
  Object.assign($('#searchInput'), { value: '' });
  $('#searchInput').focus();
  searchItems = []; searchSel = -1;
}

const closeSearch = () => { $('#overlay').hidden = true; };

async function doSearch(q) {
  if (!q) { $('#searchBody').innerHTML = SEARCH_TIP; searchItems = []; return; }

  const d = await api('/api/search?q=' + encodeURIComponent(q));
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const hl = s => esc(s).replace(re, m => `<em>${m}</em>`);
  const snip = (text, span = 46) => {
    const i = text.indexOf(q);
    if (i < 0) return hl(text.slice(0, span * 2));
    const a = Math.max(0, i - span), b = Math.min(text.length, i + q.length + span);
    return (a ? '…' : '') + hl(text.slice(a, b)) + (b < text.length ? '…' : '');
  };
  const item = (go, meta, text) => `
    <button class="s-item" data-go="${go}">
      <div class="t">${meta}</div>
      <div class="x">${text}</div>
    </button>`;

  const groups = [
    ['条文', d.clauses, c => item(`#/c/${c.chapter_no}?c=${c.no}`,
      `${esc(c.ctitle)} · 第 ${c.no} 条`,
      snip(c.origin + ' ' + (c.translation || '')))],
    ['方剂', d.formulas, f => item(`#/f/${f.id}`,
      `第${cnNum(f.chapter_no)}篇 · 方剂`,
      `${hl(f.name)}<span class="s-sub">${esc(f.func || '')}</span>`)],
    ['中药', d.herbs, h => item(`#/h/${h.id}`,
      `${esc(h.category)} · 见于 ${h.formula_count} 方`,
      `${hl(h.name)}<span class="s-sub">${esc(h.nature || '')}　${esc((h.effect || '').slice(0, 24))}</span>`)],
    ['脉象', d.pulses, p => item(`#/p/${p.no}`,
      `${esc(p.group)} · ${p.py}`,
      `${hl(p.name)}脉<span class="s-sub">${esc((p.ill || []).join(' · '))}</span>`)],
    ['郝万山讲稿', d.passages, p => item(`#/l/${p.lecture_no}`,
      `第 ${p.lecture_no} 讲 · ${esc(p.ltitle)}`,
      snip(p.text))],
  ];

  const html = groups.map(([label, list, build]) => {
    if (!list?.length) return '';
    const shown = list.slice(0, 8);
    const rest = list.length - shown.length;
    return `<div class="s-group"><h4>${label} · ${list.length}</h4>${shown.map(build).join('')}
      ${rest > 0 ? `<p class="s-more">另有 ${rest} 条，加长关键词可收窄</p>` : ''}</div>`;
  }).join('');

  $('#searchBody').innerHTML = html || `<p class="search-empty">没有找到「${esc(q)}」</p>`;
  searchItems = $$('.s-item');
  searchSel = -1;
}

function showSources() {
  const items = S.boot.sources.map(s => `
    <div class="s-group"><h4>${esc(s.kind)}</h4>
      <button class="s-item" data-go="${esc(s.url)}">
        <div class="x">${esc(s.title)}</div>
        <div class="t s-note">${esc(s.note)}</div>
      </button></div>`).join('');
  $('#searchBody').innerHTML = `<div class="s-group"><h4>资料来源</h4>
    <p class="s-intro">原文取自易推智道经典书库桂林古本；郝万山讲解取自其《伤寒论》七十讲讲稿；
      二十八脉的体状、主病依李时珍《濒湖脉学》，左右手分部所主参《中医诊断学》通行表述。</p></div>${items}`;
  $('#overlay').hidden = false;
  $('#searchInput').value = '';
  $$('#searchBody .s-item').forEach(b => { b.onclick = () => window.open(b.dataset.go, '_blank'); });
}

/* ---------------- 交互 ---------------- */
function bindEvents() {
  $('#tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) activatePane(tab.dataset.pane);
  });

  $('#modeSeg').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    saveSettings({ mode: btn.dataset.mode });
    if (S.route.view === 'chapter') $$('.formula').forEach(f => f.classList.toggle('open', btn.dataset.mode === 'all'));
  });
  $('#fontUp').onclick = () => saveSettings({ fs: Math.min(4, S.settings.fs + 1) });
  $('#fontDown').onclick = () => saveSettings({ fs: Math.max(-2, S.settings.fs - 1) });
  $('#themeBtn').onclick = () => saveSettings({ theme: S.settings.theme === 'paper' ? 'night' : 'paper' });

  $('#reader').addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-toggle]')) return t.closest('.formula').classList.toggle('open');

    const acc = t.closest('[data-acc]');
    if (acc) {
      const item = acc.closest('.acc-item');
      item.classList.toggle('open');
      $('.acc-more', item).textContent = item.classList.contains('open') ? '收起' : '展开';
      return;
    }
    const more = t.closest('[data-more]');
    if (more) { $('#morePills').hidden = false; return more.remove(); }

    const mark = t.closest('[data-mark]');
    if (mark) { e.preventDefault(); return toggleMark(mark.dataset.mark); }

    const link = t.closest('a[href^="#"]');
    if (link) { e.preventDefault(); go(link.getAttribute('href').slice(1)); }
  });

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

  document.addEventListener('keydown', e => {
    const inInput = /INPUT|TEXTAREA/.test(e.target.tagName);
    const open = !$('#overlay').hidden;

    if (e.key === 'Escape' && open) return closeSearch();
    if (e.key === '/' && !inInput) { e.preventDefault(); return openSearch(); }

    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && searchItems.length) {
      e.preventDefault();
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + searchItems.length) % searchItems.length;
      searchItems.forEach((x, i) => x.classList.toggle('sel', i === searchSel));
      searchItems[searchSel].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (open && e.key === 'Enter' && searchSel >= 0) {
      const it = searchItems[searchSel];
      closeSearch();
      return go(it.dataset.go.slice(1));
    }
    if (inInput) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const link = e.key === 'ArrowLeft' ? $('.pager a:not(.r)') : $('.pager a.r');
      if (link) { e.preventDefault(); go(link.getAttribute('href').slice(1)); }
    }
  });

  $('#main').addEventListener('scroll', () => {
    const el = $('#main');
    const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    $('#progress').style.width = (p * 100).toFixed(1) + '%';
  }, { passive: true });

  $('#aboutLink').onclick = e => { e.preventDefault(); showSources(); };
}

function toggleMark(no) {
  const el = $('#cl-' + no);
  if (!el) return;
  const i = S.marks.findIndex(m => m.chapter_no === S.route.id && m.no === +no);

  if (i >= 0) S.marks.splice(i, 1);
  else S.marks.unshift({
    chapter_no: S.route.id,
    no: +no,
    ctitle: $('#reader .hero h2')?.textContent || '',
    origin: $('.origin', el).textContent,
  });

  store.set('marks', S.marks);
  $('[data-mark="' + no + '"]', el).textContent = i >= 0 ? '☆ 收藏' : '★ 已收藏';
  toast(i >= 0 ? '已取消收藏' : '已加入收藏');
  renderMarks();
}

/* ---------------- 启动 ---------------- */
boot();
