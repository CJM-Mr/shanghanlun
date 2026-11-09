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
const hero = (cat, title, meta = '', extra = '', ac = '') => `
  <header class="hero"${ac ? ` style="--ac:${ac}"` : ''}>
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

const PAGER_ROUTE = { 篇: 'c', 讲: 'l', 脉: 'p', 经: 'a/m' };
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

/* ---------------- 脉象图解（静态 SVG） ---------------- */
const PULSE_DEF = { pos: .45, rate: 72, amp: 1, w: 1, ten: .5, slip: .5, span: 1, rhythm: 'reg', shape: 'normal' };

const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* 节律门：1 为正常搏动，0 为歇止 */
const GATE = {
  cu: i => (i % 4 === 3 ? 0 : 1),      // 促：数而时止
  jie: i => (i % 3 === 2 ? 0 : 1),     // 结：缓而时止
  dai: i => (i % 5 >= 3 ? 0 : 1),      // 代：止有定数
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

/** 采样一段观察窗内的波形，返回 path 与周期数 */
function waveShape(p, W, base, amp) {
  const win = p.rhythm === 'dai' ? 8 : p.rhythm === 'jie' ? 5 : 3.4;   // 观察窗（秒）
  const cycles = Math.max(1.6, Math.min(8.5, (p.rate / 60) * win));
  const N = 320, pts = [];
  for (let i = 0; i <= N; i++) {
    const tt = (i / N) * cycles, k = Math.floor(tt);
    const ph = (tt - k - .4) / p.span + .4;
    let a = beat(ph, p, k) * (GATE[p.rhythm] ? GATE[p.rhythm](k) : 1);
    if (p.shape === 'dong' && (i / N < .34 || i / N > .66)) a = 0;    // 独见于关
    pts.push([(i / N) * W, base - a * amp]);
  }
  return { d: 'M' + pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L'), cycles, pts };
}

/** 总览卡片：一条静态波形 */
function miniWave(p) {
  const a = { ...PULSE_DEF, ...p.anim };
  const { d } = waveShape(a, 150, 37, 26 * a.amp);
  return `<svg class="pc-wave" viewBox="0 0 150 44" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="37" x2="150" y2="37" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <path d="${d}" fill="none" stroke="var(--zhu)" stroke-width="1.4" vector-effect="non-scaling-stroke"
          stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** 详情图解：左侧指下深浅（皮肉筋骨），右侧脉波形态并加标注 */
function pulseDiagram(p) {
  const a = { ...PULSE_DEF, ...p.anim };
  const W = 520, BASE = 166, AMP = 96 * a.amp;
  const { d, cycles, pts } = waveShape(a, W, BASE, AMP);
  const xAt = ph => Math.min(W - 40, Math.max(40, (((ph - .4) * a.span + .4) / cycles) * W));
  const yAt = ph => BASE - beat(ph, a, 0) * AMP;
  // 取某区间内曲线的最高点，标注锚点一定落在线上
  const peakIn = (x0 = 0, x1 = W) => {
    const seg = pts.filter(q => q[0] >= x0 && q[0] <= x1);
    return seg.reduce((m, q) => (q[1] < m[1] ? q : m), seg[0] || [W / 2, BASE]);
  };

  // 标注只落在波形上下的留白区，再用细引线指向特征点，保证不压曲线
  const marks = [];
  const mark = (x, y, text, low = false) => marks.push({ x, y, text, low });
  const at = (ph, text, low) => mark(xAt(ph), yAt(ph), text, low);

  const dong = a.shape === 'dong';
  if (dong) {
    const [px, py] = peakIn(W * .33, W * .67);
    mark(px, py, '关部独动');
  } else {
    at(a.shape === 'kou' ? .26 : .30, '主波');
    if (a.slip >= .3 && cycles <= 5.5 && ['normal', 'taut', 'kou'].includes(a.shape)) at(.58, '重搏波');
    if (a.shape === 'kou') at(.40, '中空', true);
    if (a.shape === 'flood') at(.52, '来盛去衰');
    if (a.shape === 'san') { const [px, py] = peakIn(); mark(px, py, '涣散无根'); }
    if (a.shape === 'cuo') at(.55, '往来艰涩');
  }

  const gated = { cu: 3, jie: 2, dai: 3 }[a.rhythm];
  if (gated != null) mark((gated + .5) / cycles * W, BASE, '歇止', true);

  // 横向挤在一起时自动错行，避免文字互相覆盖
  const ROWS = [14, 30, 46], placed = [];
  marks.sort((m1, m2) => m1.x - m2.x).forEach(m => {
    if (m.low) { m.ly = BASE + 22; return; }
    const w = m.text.length * 10 + 8;
    let row = 0;
    while (row < ROWS.length - 1 &&
           placed.some(q => q.row === row && Math.abs(q.x - m.x) < (q.w + w) / 2 + 10)) row++;
    Object.assign(m, { row, w, ly: ROWS[row] });
    placed.push(m);
  });

  const notes = marks.map(m => {
    const [y1, y2] = m.low ? [m.ly - 12, m.y + 6] : [m.ly + 4, m.y - 6];
    return `<line x1="${m.x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${m.x.toFixed(1)}" y2="${y2.toFixed(1)}"
             stroke="var(--ink-3)" stroke-width=".8" stroke-dasharray="2 3" opacity=".55"/>
           <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="2.2" fill="var(--zhu)"/>
           <text x="${m.x.toFixed(1)}" y="${m.ly}" class="dg-n" text-anchor="middle">${m.text}</text>`;
  }).join('');

  const bands = ['皮', '肉', '筋', '骨'].map((t, i) => `
    <rect x="0" y="${i * 45}" width="140" height="45" stroke="var(--line-2)" stroke-width=".6"
          fill="${i % 2 ? 'var(--paper-2)' : 'var(--paper-3)'}"/>
    <text x="9" y="${i * 45 + 26}" class="dg-t">${t}</text>`).join('');

  const vy = 10 + a.pos * 160;      // 脉管所在深度

  return `<svg class="pulse-svg" viewBox="0 0 720 226" role="img" aria-label="${esc(p.name)}脉图解">
    <text x="82" y="14" class="dg-n" text-anchor="middle">指</text>
    <g transform="translate(12,22)">
      ${bands}
      <rect x="34" y="${vy - 5}" width="96" height="10" rx="5"
            fill="var(--zhu)" fill-opacity=".16" stroke="var(--zhu)" stroke-width="1.2"/>
      <line x1="82" y1="0" x2="82" y2="${vy - 8}" stroke="var(--zhu)" stroke-width="1"
            stroke-dasharray="3 3" opacity=".6"/>
      <path d="M78,${vy - 15} L86,${vy - 15} L82,${vy - 7} Z" fill="var(--zhu)"/>
    </g>
    <g transform="translate(186,22)">
      <line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>
      <path d="${d}" fill="none" stroke="var(--zhu)" stroke-width="${(1.3 * a.w).toFixed(2)}"
            stroke-linejoin="round" stroke-linecap="round"/>
      ${notes}
    </g>
  </svg>`;
}

/* ---------------- 启动与设置 ---------------- */
async function boot() {
  applySettings();
  S.boot = await api('/api/bootstrap');
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
}

function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  store.set('settings', S.settings);
  applySettings();
}

/* ---------------- 侧栏 ---------------- */
function renderSidebar() {
  const { chapters, lectures, categories, formulas, herbs, meridians } = S.boot;

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
  renderAcuList();
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

function renderAcuList() {
  const { meridians } = S.boot;
  $('#pane-acu').innerHTML = `
    <div class="cat-head"><i></i>石氏针法</div>
    <a class="ch-item" href="#/a/x" data-key="x">
      <span class="ch-title">醒脑开窍针法<span class="py">石学敏</span></span>
      <span class="ch-meta">专法</span>
    </a>
    <div class="cat-head"><i></i>十四经脉 · ${meridians.reduce((n, m) => n + m.count, 0)} 穴</div>
    ${meridians.map(m => `
      <a class="ch-item" href="#/a/m/${m.no}" data-key="m${m.no}">
        <span class="ch-no">${String(m.no).padStart(2, '0')}</span>
        <span class="ch-title">${esc(m.short)}</span>
        <span class="ch-meta">${m.count}</span>
      </a>`).join('')}
    <div class="cat-head"><i></i>临床应用</div>
    <a class="ch-item" href="#/a/c" data-key="clinic">
      <span class="ch-title">常见病配穴<span class="py">十四类</span></span>
      <span class="ch-meta">现代</span>
    </a>`;
}

function renderMarks() {
  $('#pane-marks').innerHTML = S.marks.length ? S.marks.map(m => `
    <a class="ch-item" href="#/c/${m.chapter_no}?c=${m.no}">
      <span class="ch-no">${m.no}</span>
      <span class="ch-title">${esc(m.origin.slice(0, 22))}…</span>
      <span class="ch-meta">${esc(m.ctitle.slice(0, 4))}</span>
    </a>`).join('') : '<div class="empty">还没有收藏<br>阅读时点击条文右上角的 ☆</div>';
}

const PANE_OF = { chapter: 'chapters', lecture: 'lectures', formula: 'formulas', herb: 'herbs', pulse: 'pulses', acu: 'acu', home: 'chapters' };

function activatePane(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
}

function markActive(key) {
  $$('.ch-item, .lec-item').forEach(a => a.classList.toggle('active', a.dataset.key === key));
  $('.ch-item.active, .lec-item.active')?.scrollIntoView({ block: 'nearest' });
}

/* ---------------- 路由 ---------------- */
const VIEWS = { c: 'chapter', l: 'lecture', f: 'formula', h: 'herb', p: 'pulse', a: 'acu' };
const RENDER = { chapter: viewChapter, lecture: viewLecture, formula: viewFormula, herb: viewHerb, pulse: viewPulse, acu: viewAcu };

/* 站内访问栈：末位为当前页，用于「返回上一页」 */
const NAV = [];
const SCROLL = new Map();   // 各页离开时的阅读位置
let goingBack = false;
let lastHash = '';

const hashNow = () => location.hash || '#/';

function syncBack() {
  const btn = $('#backBtn');
  if (btn) btn.disabled = NAV.length <= 1;
}

function goBack() {
  if (NAV.length <= 1) return;
  goingBack = true;
  setTimeout(() => { goingBack = false; }, 400);   // 兜底：后退未触发 hashchange 时不误弹栈
  history.back();
}

function route() {
  const hash = hashNow();
  const top = NAV[NAV.length - 1];
  let back = false;

  if (goingBack) {                 // 后退：把刚离开的那页弹出
    goingBack = false;
    if (hash !== top) { NAV.pop(); back = true; }
  } else if (hash !== top) {       // 前进：入栈
    NAV.push(hash);
    if (NAV.length > 60) NAV.shift();
  }
  syncBack();

  if (lastHash && lastHash !== hash) SCROLL.set(lastHash, $('#main').scrollTop);
  lastHash = hash;

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
  $('#modeSeg').style.display = S.route.view === 'acu' ? 'none' : '';   // 阅读层级只对篇章有效
  $('#main').scrollTop = 0;

  const render = RENDER[S.route.view];
  const done = render ? render(+id, q) : renderWelcome();
  if (back) Promise.resolve(done).then(() => { $('#main').scrollTop = SCROLL.get(hash) || 0; });
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
          ${miniWave(p)}
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

/* 临床应用：辨证要点 / 兼脉辨治 / 治法 / 病证 / 鉴别 */
function clinicBlock(p) {
  const c = p.clinic;
  if (!c) return '';
  const row = (k, v) => `<div class="cl-row"><div class="cl-k">${k}</div><div class="cl-v">${v}</div></div>`;
  return `
    <div class="clinic">
      ${row('辨证要点', esc(c.key))}
      ${row('兼脉辨治', `<ul class="combo">${c.combo.map(([k, v]) =>
        `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ul>`)}
      ${row('治法方向', esc(c.treat))}
      ${row('常见病证', `<div class="pill-row tight">${c.cases.map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>`)}
      ${row('类脉鉴别', esc(c.diff))}
    </div>`;
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
      ${pulseDiagram(p)}
      <div class="pa-facts">${facts.map(f => `<span class="pa-fact">${f}</span>`).join('')}</div>
    </div>
    ${section('脉象体状', '指下所得', `<p class="pulse-text">${esc(p.shape)}</p>`)}
    ${section('形成原理', '何以有此象', `<p class="pulse-text">${esc(p.why)}</p>`)}
    ${section('主　病', `${p.ill.length} 类`, `<div class="pulse-ill">${p.ill.map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>`)}
    ${section('相关反应', '临床可见', `<p class="pulse-text">${esc(p.signs)}</p>`)}
    ${section('左右手六部', '寸关尺各有所主', `<div class="parts-grid">${parts}</div>`)}
    ${section('临床应用', '辨证 · 兼脉 · 治法 · 病证 · 鉴别', clinicBlock(p))}
    ${pager(d.prev, d.next, '脉')}`;
}

/* ---------------- 针灸 ---------------- */
const ACU_TONE = ['dai', 'qing', 'jin', 'zhu', 'zi', 'cheng'];

/** 十四经卡片 */
const mcard = (m, i) => `
  <a class="mcard" href="#/a/m/${m.no}" style="--ac:var(--${ACU_TONE[i % 6]})">
    <div class="mc-top">
      <span class="mc-no">${String(m.no).padStart(2, '0')}</span>
      <span class="mc-count">${m.count} 穴</span>
    </div>
    <div class="mc-name">${esc(m.name)}</div>
    <div class="mc-organ">${esc(m.organ)}</div>
    <div class="mc-ind">${m.ind.slice(0, 3).map(esc).join(' · ')}</div>
  </a>`;

/** 穴位行：穴名 / 定位 / 主治 */
const ptRow = p => `
  <div class="pt-row" id="pt-${p.code}">
    <div class="pt-name">
      <b>${esc(p.name)}</b>
      <span class="pt-code">${p.code}</span>
      ${p.special ? `<em class="pt-sp">${esc(p.special)}</em>` : ''}
    </div>
    <div class="pt-loc">${esc(p.loc)}</div>
    <div class="pt-act">${esc(p.act)}</div>
  </div>`;

/** 穴位引用小标签，可跳转到所属经络并定位 */
const ptLink = p => p.mer_no
  ? `<a class="pill pt-link" href="#/a/m/${p.mer_no}?p=${p.code}" title="${esc(p.loc)}">${esc(p.name)}</a>`
  : `<span class="pill">${esc(p.name)}</span>`;

function viewAcuHome() {
  const { meridians, acuStats } = S.boot;
  $('#crumb').innerHTML = '<b>针灸</b> · 十四经 · 三百六十一穴';
  document.title = '针灸 · 伤寒杂病论';
  markActive('');

  $('#reader').innerHTML = `
    ${hero('针灸 · 十四经', '针灸', mi('经穴', acuStats.points) + mi('经脉', meridians.length) + mi('奇穴', '另附') + mi('专法', '醒脑开窍'))}
    <p class="acu-lead">十二正经如环无端，气血自寅时起于肺经，周流脏腑，昼夜五十营；任督二脉一前一后，
      总领阴阳。三百六十一穴分布其间，或为五输、或为原络、或为俞募，各有其性。
      本篇按经脉流注次序编排，每经列循行、主治与全部腧穴，末附石学敏醒脑开窍针法与常见病配穴。</p>

    <a class="xn-card" href="#/a/x">
      <div class="xn-seal">醒</div>
      <div class="xn-txt">
        <div class="xn-kicker">石学敏 · 1972</div>
        <h3>醒脑开窍针法</h3>
        <p>以阴经与督脉穴为主，直取「神」之所在。主方Ⅰ／Ⅱ、手法量学、十五类并发症配穴、三则病案。</p>
      </div>
      <div class="xn-go">→</div>
    </a>

    <div class="acu-grid">${meridians.map(mcard).join('')}</div>

    <a class="acu-more" href="#/a/c">
      <b>临床应用</b>
      <span>十四类常见病的配穴方案，与现代研究证据一览</span>
      <i>→</i>
    </a>`;
}

async function viewAcuMeridian(no, q) {
  const d = await api('/api/acu/m/' + no);
  const m = d.meridian;
  const focus = q.get('p');
  $('#crumb').innerHTML = `<b>针灸</b> · 第 ${cnNum(m.no)} 经 · ${esc(m.name)}`;
  document.title = `${m.name} · 针灸`;
  markActive('m' + no);

  const tone = ACU_TONE[(m.no - 1) % 6];
  $('#reader').innerHTML = `
    ${hero(`针灸 · 十四经之${cnNum(m.no)}`, esc(m.name),
      mi('经穴', m.count) + mi('属络', esc(m.organ)) + mi('代号', m.code), '', `var(--${tone})`)}
    ${section('循　行', '经脉所过', `<p class="acu-text">${esc(m.flow)}</p>`)}
    ${section('主　治', '本经所主', `<div class="pill-row">${m.ind.map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>`)}
    ${section('取穴要点', '临证须知', `<p class="acu-text">${esc(m.note)}</p>`)}
    ${section(`本经腧穴 · ${d.points.length}`, '穴名 · 定位 · 主治',
      `<div class="pt-list">
         <div class="pt-row pt-head"><div>穴名</div><div>定位</div><div>主治</div></div>
         ${d.points.map(ptRow).join('')}
       </div>`)}
    ${pager(d.prev, d.next, '经')}`;

  if (focus) {
    const el = $('#pt-' + CSS.escape(focus));
    if (el) {
      el.classList.add('on');
      const main = $('#main');
      const prev = main.style.scrollBehavior;
      main.style.scrollBehavior = 'auto';          // 直接定位，避免平滑滚动与渲染竞争
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 140;
      main.style.scrollBehavior = prev;
    }
  }
}

async function viewAcuXn() {
  const { xn } = await api('/api/acu/xn');
  $('#crumb').innerHTML = `<b>针灸</b> · 石学敏 · 醒脑开窍针法`;
  document.title = '醒脑开窍针法 · 石学敏';
  markActive('x');

  const forms = xn.forms.map(f => `
    <div class="xn-form">
      <div class="xf-head">
        <b>${esc(f.name)}</b>
        <span>${esc(f.use)}</span>
      </div>
      <div class="pill-row">${f.pts.map(ptLink).join('')}</div>
      <p class="xf-note">${esc(f.note)}</p>
    </div>`).join('');

  const steps = xn.steps.map((s, i) => `
    <div class="xn-step">
      <div class="xs-no">${i + 1}</div>
      <div class="xs-body">
        <div class="xs-head">
          <b>${esc(s.pt)}</b>
          <span class="pt-code">${s.code}</span>
          <span class="xs-mer">${esc(s.mer)} · ${esc(s.side)}</span>
        </div>
        <div class="xs-line"><em>刺法</em>${esc(s.how)}</div>
        <div class="xs-line"><em>手法</em>${esc(s.manip)}</div>
        <div class="xs-line"><em>得气</em>${esc(s.react)}</div>
      </div>
    </div>`).join('');

  const combos = xn.combos.map(c => `
    <div class="xn-combo">
      <div class="xc-name">${esc(c.name)}</div>
      <div class="xc-pts">${c.refs.map(ptLink).join('')}</div>
      <p class="xc-how">${esc(c.how)}</p>
    </div>`).join('');

  const dose = xn.dose.map(([n, a, f, t, u]) =>
    `<tr><td>${esc(n)}</td><td>${esc(a)}</td><td>${esc(f)}</td><td>${esc(t)}</td><td>${esc(u)}</td></tr>`).join('');

  const cases = xn.cases.map((c, i) => `
    <div class="xn-case">
      <div class="xcase-head"><span>案 ${i + 1}</span><b>${esc(c.title)}</b></div>
      <p>${esc(c.text)}</p>
    </div>`).join('');

  $('#reader').innerHTML = `
    ${hero('针灸 · 石氏针法', '醒脑开窍针法', mi('创立', '1972 年') + mi('创始人', '石学敏') + mi('主穴', '内关 · 水沟 · 三阴交'), '', 'var(--zhu)')}
    <p class="acu-lead">${esc(xn.intro)}</p>

    <div class="xn-quote">
      <div class="xq-k">总病机</div>
      <div class="xq-v">窍闭神匿，神不导气</div>
      <p>${esc(xn.patho)}</p>
      <div class="xq-law"><b>治法</b>${esc(xn.law)}</div>
    </div>

    ${section('组　方', '主方Ⅰ 与 主方Ⅱ', forms)}
    ${section('操作规范', '六步 · 依次进针',
      `<p class="acu-order">${esc(xn.order)}</p>${steps}`)}
    ${section('手法量学', '角度 · 频率 · 时间 · 得气', `
      <div class="table-wrap"><table class="acu-table">
        <thead><tr><th>手法</th><th>幅度／方向</th><th>频率</th><th>时间</th><th>适用</th></tr></thead>
        <tbody>${dose}</tbody>
      </table></div>
      <p class="acu-note">${esc(xn.aux_note)}</p>`)}
    ${section('并发症配穴', `${xn.combos.length} 类`, `<div class="xn-combos">${combos}</div>`)}
    ${section('疗　程', '', `<p class="acu-text">${esc(xn.course)}</p>`)}
    ${section('病　案', '三则', cases + `<p class="acu-note">${esc(xn.cases_note)}</p>`)}
    ${section('注意事项与禁忌', '', `<ul class="acu-cautions">${xn.cautions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`)}`;
}

async function viewAcuClinic() {
  const d = await api('/api/acu/clinic');
  $('#crumb').innerHTML = '<b>针灸</b> · 临床应用';
  document.title = '针灸临床应用 · 伤寒杂病论';
  markActive('clinic');

  const cats = [...new Set(d.clinic.map(c => c.cat))];
  const blocks = cats.map(cat => `
    <div class="pgroup">
      <div class="pg-head"><i></i>${cat}</div>
      <div class="clinic-grid">${d.clinic.filter(c => c.cat === cat).map(c => `
        <div class="cz-card">
          <div class="cz-name">${esc(c.name)}</div>
          <div class="pill-row tight">${c.refs.map(ptLink).join('')}</div>
          <div class="cz-add"><em>随症</em>${esc(c.add)}</div>
          <div class="cz-note">${esc(c.note)}</div>
        </div>`).join('')}</div>
    </div>`).join('');

  const evCls = { '强': 'ev-hi', '中': 'ev-mid', '—': 'ev-na' };
  const modern = d.modern.map(m => `
    <div class="md-item">
      <div class="md-head">
        <b>${esc(m.name)}</b>
        <span class="ev ${evCls[m.ev] || 'ev-na'}">证据 ${esc(m.ev)}</span>
      </div>
      <p>${esc(m.text)}</p>
    </div>`).join('');

  $('#reader').innerHTML = `
    ${hero('针灸 · 临床应用', '从配穴到证据', mi('病种', d.clinic.length) + mi('研究领域', d.modern.length), '', 'var(--qing)')}
    <p class="acu-lead">配穴之法，一在辨经，二在辨病。下按病类分列主穴与随症加减，主穴皆取要穴，
      随症则据寒热虚实增损。末列现代研究方向与证据强度，供临证取舍时参考。</p>
    ${blocks}
    ${section('现代应用', '机制与证据', `<div class="md-list">${modern}</div>`)}`;
}

function viewAcu(_id, q) {
  const seg = (location.hash.slice(1) || '/').split('?')[0].split('/').filter(Boolean);
  if (seg[1] === 'm') return viewAcuMeridian(+seg[2], q);
  if (seg[1] === 'x') return viewAcuXn();
  if (seg[1] === 'c') return viewAcuClinic();
  return viewAcuHome();
}

/* ---------------- 搜索 ---------------- */
const SEARCH_TIP = `<p class="search-empty">试试：桂枝汤 · 柴胡 · 弦脉 · 内关 · 足三里 · 醒脑开窍</p>
  <p class="search-empty s-hint">条文、方剂、中药、脉象、穴位、经络、讲稿一起搜</p>`;
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

  // 实体类结果（方剂 / 中药 / 脉象）排在条文之前，避免被几十条条文挤到屏幕外
  const groups = [
    ['专题', d.topics, 2, t => item(`#/a/x`, '针法专题', `${hl(t.name)}<span class="s-sub">${esc(t.sub)}</span>`)],
    ['方剂', d.formulas, 6, f => item(`#/f/${f.id}`,
      `第${cnNum(f.chapter_no)}篇 · 方剂`,
      `${hl(f.name)}<span class="s-sub">${esc(f.func || '')}</span>`)],
    ['中药', d.herbs, 6, h => item(`#/h/${h.id}`,
      `${esc(h.category || '中药')} · 见于 ${h.formula_count} 处`,
      `${hl(h.name)}<span class="s-sub">${esc(h.nature || '')}　${esc((h.effect || '').slice(0, 24))}</span>`)],
    ['脉象', d.pulses, 6, p => item(`#/p/${p.no}`,
      `${esc(p.group)} · ${p.py}`,
      `${hl(p.name)}脉<span class="s-sub">${esc((p.ill || []).join(' · '))}</span>`)],
    ['穴位', d.points, 8, p => item(`#/a/m/${p.mer_no}?p=${p.code}`,
      `${esc(p.mer)} · ${p.code}`,
      `${hl(p.name)}<span class="s-sub">${esc(p.loc)}</span>`)],
    ['经络', d.meridians, 4, m => item(`#/a/m/${m.no}`,
      `${m.count} 穴 · 十四经`,
      `${hl(m.name)}<span class="s-sub">${esc(m.ind.join(' · '))}</span>`)],
    ['条文', d.clauses, 5, c => item(`#/c/${c.chapter_no}?c=${c.no}`,
      `${esc(c.ctitle)} · 第 ${c.no} 条`,
      snip(c.origin + ' ' + (c.translation || '')))],
    ['郝万山讲稿', d.passages, 4, p => item(`#/l/${p.lecture_no}`,
      `第 ${p.lecture_no} 讲 · ${esc(p.ltitle)}`,
      snip(p.text))],
  ];

  const hit = groups.filter(([, list]) => list?.length);
  if (!hit.length) {
    $('#searchBody').innerHTML = `<p class="search-empty">没有找到「${esc(q)}」</p>`;
    searchItems = []; searchSel = -1;
    return;
  }

  const chips = hit.map(([label, list], i) =>
    `<button class="s-chip" data-jump="sg${i}">${label}<b>${list.length}</b></button>`).join('');

  const body = hit.map(([label, list, cap, build], i) => {
    const shown = list.slice(0, cap), rest = list.length - shown.length;
    return `<div class="s-group" id="sg${i}"><h4>${label} · ${list.length}</h4>${shown.map(build).join('')}
      ${rest > 0 ? `<p class="s-more">另有 ${rest} 条，加长关键词可收窄</p>` : ''}</div>`;
  }).join('');

  $('#searchBody').innerHTML = `<div class="s-chips">${chips}</div>${body}`;
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
    if (!tab) return;
    activatePane(tab.dataset.pane);
    if (tab.dataset.pane === 'acu' && S.route.view !== 'acu') go('/a');
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

  $('#backBtn').addEventListener('click', goBack);
  window.addEventListener('auxclick', e => { if (e.button === 3) { e.preventDefault(); goBack(); } });

  $('#searchTrigger').onclick = openSearch;
  $('#searchClose').onclick = closeSearch;
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSearch(); });
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => doSearch(q), 160);
  });
  $('#searchBody').addEventListener('click', e => {
    const chip = e.target.closest('.s-chip');
    if (chip) {
      document.getElementById(chip.dataset.jump)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
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
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); return goBack(); }
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
