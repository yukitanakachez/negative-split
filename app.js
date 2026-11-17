/* ================================= APP ==================================== */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MI = Engine.MI, LB = 2.20462, KEY = 'negsplit.v1';
const pad = n => String(n).padStart(2, '0');
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dUTC = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => new Date(dUTC(s).getTime() + n * 864e5).toISOString().slice(0, 10);
const fmt = (s, o) => dUTC(s).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, o));
const between = (a, b) => Math.round((dUTC(b) - dUTC(a)) / 864e5);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaultRace() { const d = new Date(); d.setDate(d.getDate() + 126); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return localISO(d); }
const EXAMPLE = { example: true, name: '', age: 19, sex: 'm', heightCm: 178, weightKg: 68, restHr: 0, maxHr: 0, goalSec: 3.5 * 3600, raceDate: defaultRace(), recentDist: 10000, recentSec: 47 * 60 + 30, weeklyKm: 22 * MI, longestKm: 10 * MI, exp: 'mid', days: 5, longDay: 6, units: 'mi' };

let S = { profile: null, log: {} };
function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.profile) S = Object.assign({ log: {} }, j); } catch (e) {} if (!S.profile) S.profile = Object.assign({}, EXAMPLE);
  // Older saves had no start anchor, so the plan restarted every week. Pin it to the first open after updating.
  if (!S.profile.example && !S.profile.from) { S.profile.from = localISO(); save(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- formatting: miles ---------- */
const miles = km => { if (Math.abs(km - 42.195) < 0.01) return '26.2'; const v = Math.round(km / MI * 2) / 2; return v % 1 ? v.toFixed(1) : String(v); };
const milesInt = km => String(Math.round(km / MI));
const mss = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const pace = spk => mss(spk * MI);
const hms = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const durTxt = s => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`; };

const svg = (p, w = 20, sw = 2.2) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  run: svg('<circle cx="14.5" cy="4.5" r="2"/><path d="M8 21l3-5.5 3 2.5v4.5M6.5 11l3-3.5h4l2.5 3.5 3 1M10.5 7.5l-1 5 4.5 3.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16, 3),
  x: svg('<path d="M7 7l10 10M17 7L7 17"/>', 14, 3),
  pencil: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  flag: svg('<path d="M6 21V3.5M6 4h12l-2.5 4.5L18 13H6"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  warn: svg('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>', 18),
};

const CAT = { rest: 'rest', easy: 'easy', recovery: 'easy', strides: 'easy', hillsprints: 'easy', shakeout: 'easy', long: 'long', longm: 'long', mrun: 'hard', tempo: 'hard', cruise: 'hard', intervals: 'hard', fartlek: 'hard', hills: 'hard', reps: 'hard', test: 'hard', race: 'race' };
const ZNAME = { M: 'Marathon pace', T: 'Threshold', I: 'Interval', R: 'Repetition' };
const ZSHORT = { M: 'marathon pace', T: 'threshold', I: 'interval', R: 'rep' };
const EFF = { E: 30, M: 55, T: 72, I: 88, R: 96 };
const PHASE = { base: 'Base', build: 'Build', peak: 'Peak', specific: 'Race-specific', taper: 'Taper', race: 'Race week' };
const titleOf = d => d.type === 'rest' && d.tags.includes('strength') ? 'Rest or strength' : d.title;

/* ---------- plan helpers ---------- */
let plan = null, today = localISO(), selWeek = null, selDay = null, view = 'today';
const N = () => plan.weeks.length;
const weekIdx = s => Math.floor(between(plan.start, s) / 7);
const curWeek = () => clamp(weekIdx(today), 0, N() - 1);
const weekAt = i => i === -1 && plan.pre ? plan.pre : plan.weeks[i];
const workoutAt = s => { const i = weekIdx(s); return weekAt(i)?.days[((between(plan.start, s) % 7) + 7) % 7] || null; };
const weekOf = s => weekAt(weekIdx(s)) || plan.weeks[clamp(weekIdx(s), 0, N() - 1)];
// The days before week 1 starts (plan begins on a Monday), shown as rest so today always appears in the week strip.
function preWeek() {
  if (!(today < plan.start) || between(today, plan.start) > 7) return null;
  const mon = addDays(plan.start, -7);
  return { i: -1, pre: true, phase: 'pre', rec: false, start: mon, km: 0, sec: 0, paces: plan.weeks[0].paces,
    days: Array.from({ length: 7 }, (_, k) => ({ type: 'rest', title: 'Rest', tags: [], segs: [], km: 0, sec: 0, date: addDays(mon, k), dow: k })) };
}
const allDays = () => plan.weeks.flatMap(w => w.days);
const weekDone = w => w.days.reduce((a, d) => a + (S.log[d.date] === 'done' ? d.km : 0), 0);
const defaultDay = () => workoutAt(today) ? today : (allDays().find(x => x.date >= today && x.type !== 'rest') || plan.weeks[0].days[0]).date;

/* ---------- workout pieces ---------- */
function stepRows(d, P) {
  const rows = [], n = d.segs.length, long = d.type === 'long' || d.type === 'longm';
  d.segs.forEach((s, i) => {
    const z = s.z;
    if (z === 'W') rows.push({ k: 'E', p: 22, c: 'blue', t: `${miles(s.km)} mi`, sub: i === 0 ? 'Warm-up' : 'Cool-down', v: pace(P.E[1]), u: 'per mile' });
    else if (z === 'E') rows.push({ k: 'E', p: EFF.E, c: 'blue', t: `${miles(s.km)} mi`, sub: long ? 'Long and relaxed' : 'Easy', v: `${pace(P.E[0])}–${pace(P.E[1])}`, u: 'per mile' });
    else if (z === 'RACE') rows.push({ k: 'M', p: 100, c: '', t: '26.2 mi', sub: 'Race · start even, finish strong', v: pace(P.M), u: 'per mile' });
    else if (z === 'TT') rows.push({ k: 'I', p: 100, c: '', t: '5K time trial', sub: S.profile.tt && S.profile.tt.date === d.date ? 'Logged · paces updated' : 'All out · log your time below', v: S.profile.tt && S.profile.tt.date === d.date ? mss(S.profile.tt.sec) : '', u: 'your time' });
    else if (s.reps && s.timed) rows.push({ k: z, p: EFF[z], c: '', t: `${s.reps} × ${s.timed} s`, sub: s.hill ? 'Uphill · jog back down' : 'Fast · 1 min easy between', v: s.hill ? 'hard' : pace(P[z]), u: s.hill ? 'effort' : 'per mile' });
    else if (s.reps) {
      const isMile = Math.abs(s.repKm - MI) < 0.01, rep = isMile ? '1 mi' : `${Math.round(s.repKm * 1000)} m`;
      const rest = s.restSec ? `${Math.round(s.restSec / 60)} min rest` : s.repKm <= 0.4 ? `${rep} jog` : `${Math.round(s.jogSec / 60)} min jog`;
      // On a track, laps are what you check: show the 400 m split for reps of 800 m and up.
      rows.push({ k: z, p: EFF[z], c: '', t: `${s.reps} × ${rep}`, sub: `${ZNAME[z]} · ${rest}`, v: mss(P[z] * s.repKm), u: 'each rep', lap: s.repKm >= 0.79 ? `${mss(P[z] * 0.4)} per lap` : '' });
    } else rows.push({ k: z, p: EFF[z], c: '', t: `${miles(s.km)} mi`, sub: s.label === 'finish at M' ? 'Finish at marathon pace' : ZNAME[z], v: pace(P[z]), u: 'per mile' });
  });
  if (d.type === 'strides') rows.push({ k: 'R', p: EFF.R, c: '', t: '6 × 20 s', sub: 'Strides · walk back', v: 'quick', u: 'and relaxed' });
  if (d.type === 'hillsprints') rows.push({ k: 'R', p: EFF.R, c: '', t: '8 × 10 s', sub: 'Hill sprints · walk down', v: 'hard', u: 'effort' });
  if (d.tags.includes('strength')) rows.push({ k: '+', p: 0, c: 'gray', t: 'Strength', sub: '20–30 min · squats, lunges, core', v: '', u: '' });
  if (!rows.length) return '';
  return `<div class="rows">${rows.map(r => `<div class="r"><span class="ring ${r.c}" style="--p:${r.p}"><i>${r.k}</i></span><div class="r-txt"><b>${esc(r.t)}</b><small>${esc(r.sub)}</small></div><div class="r-val">${r.v ? `<b class="num">${esc(r.v)}</b><small>${esc(r.u)}</small>${r.lap ? `<small class="lap num">${esc(r.lap)}</small>` : ''}` : ''}</div></div>`).join('')}</div>`;
}

function cardHTML(d, drag) {
  const wk = weekOf(d.date), st = S.log[d.date], rest = d.type === 'rest';
  const pill = st === 'done' ? 'Done' : st === 'skip' ? 'Skipped' : d.date === today ? 'Today' : fmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' });
  const max = Math.max(...wk.days.map(x => x.type === 'race' ? 0 : x.km), 1);
  const bars = wk.days.map(x => {
    const h = x.type === 'race' ? 100 : x.km ? Math.max(16, x.km / max * 100) : 9;
    return `<span class="cb${x.date === d.date ? ' on' : ''}${S.log[x.date] === 'done' ? ' done' : ''}"><span class="bt"><i style="height:${h}%"></i></span><small>${'MTWTFSS'[x.dow]}</small></span>`;
  }).join('');
  let sub;
  if (rest) { const nx = allDays().find(x => x.date > d.date && x.type !== 'rest'); sub = nx ? `Next: ${nx.title.toLowerCase()}, ${fmt(nx.date, { weekday: 'long' })}` : 'Recover'; }
  else sub = `${miles(d.km)} mi · ${durTxt(d.sec)}`;
  return `<article class="wcard"${drag ? ' data-drag' : ''}>
    <div class="wc-top"><span class="ic-c">${rest ? ICON.moon : d.type === 'race' ? ICON.flag : ICON.run}</span><span class="wc-pill">${esc(pill)}</span></div>
    <div class="wc-main"><div class="wc-txt"><h2>${esc(rest && !d.tags.includes('strength') ? 'Rest day' : titleOf(d))}</h2><p>${esc(sub)}</p></div><div class="wc-bars" aria-hidden="true">${bars}</div></div>
  </article>`;
}

function slideHTML(d) {
  if (d.type === 'rest') return '';
  if (d.type === 'test' && S.log[d.date] !== 'done') {
    const t = S.profile.tt?.date === d.date ? S.profile.tt.sec : 0;
    return `<form class="tt-log" data-tt="${d.date}" novalidate>
      <div class="tt-head"><b>Your 5K time</b><small>Resets your training paces</small></div>
      <div class="tbox">
        <label class="tseg"><input name="m" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" enterkeyhint="next" value="${t ? Math.floor(t / 60) : ''}" aria-label="Minutes"><small>min</small></label>
        <span class="tcolon">:</span>
        <label class="tseg"><input name="s" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" enterkeyhint="done" value="${t ? pad(t % 60) : ''}" aria-label="Seconds"><small>sec</small></label>
      </div>
      <p class="tt-err" role="alert" hidden></p>
      <button type="submit" class="btn">Log time trial</button>
    </form>`;
  }
  const done = S.log[d.date] === 'done';
  return `<div class="slide${done ? ' done' : ''}" data-slide="${d.date}">
    <button class="knob" type="button" aria-label="${done ? 'Logged. Tap to undo' : 'Log this run'}">${done ? ICON.check : ICON.run}</button>
    <span class="sl-label">${done ? 'Run logged' : 'Swipe to log run'}</span><span class="sl-chev" aria-hidden="true">›››</span>
  </div>`;
}

/* ---------- install hint (iPhone Safari, not yet on the Home Screen) ---------- */
const HINT_KEY = 'negsplit.hint';
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHint() {
  let seen = false; try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch (_) {}
  if (seen || standalone() || !isIOS()) return '';
  return `<div class="hint-card"><span class="ic-c">${svg('<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M7 11H5.5v9.5h13V11H17"/>')}</span><div><b>Install the app</b><small>Tap Share, then Add to Home Screen</small></div><button class="hint-x" data-hint-close aria-label="Dismiss">${ICON.x}</button></div>`;
}

/* ---------- views ---------- */
const head = title => `<header class="ph"><h1>${title}</h1><button class="round" data-edit aria-label="Edit plan">${ICON.pencil}</button></header>`;

function render() {
  today = localISO();
  const p = S.profile;
  plan = Engine.build(p, p.from && p.from < today && p.raceDate > today ? p.from : today);
  if (plan.error) {
    const msg = `${head('Set up')}<button class="dpill" data-edit><span class="dp-ic">${ICON.flag}</span><div><b>${esc(plan.error)}</b><small>Your race date has passed</small></div><span class="dp-btn">Edit</span></button>`;
    ['today', 'plan', 'race'].forEach(v => $('#v-' + v).innerHTML = msg);
    return;
  }
  plan.pre = preWeek();
  if (selWeek == null || selWeek >= N()) selWeek = curWeek();
  if (!selDay || !workoutAt(selDay)) selDay = defaultDay();
  renderToday(); renderPlan(); renderRace();
}

function renderToday() {
  const p = S.profile, d = workoutAt(selDay), wk = weekOf(selDay), toGo = between(today, plan.race);
  const done = weekDone(wk);
  const pill = p.example
    ? `<button class="dpill" data-edit><span class="dp-ic">${ICON.pencil}</span><div><b>This is a sample plan</b><small>Add your details</small></div><span class="dp-btn">Set up</span></button>`
    : `<button class="dpill" data-tab="plan"><span class="dp-ic">${ICON.cal}</span><div>${wk.pre ? `<b>Plan starts ${fmt(plan.start, { weekday: 'long' })}</b><small class="num">Week 1 · ${milesInt(plan.weeks[0].km)} miles</small>` : `<b>Week ${wk.i + 1} of ${N()} · ${PHASE[wk.phase]}</b><small class="num">${milesInt(done)} of ${milesInt(wk.km)} miles done</small>`}</div><span class="dp-btn">Plan</span></button>`;
  $('#v-today').innerHTML = `
    <header class="greet"><span class="avatar" aria-hidden="true">${p.name ? esc(p.name.trim()[0].toUpperCase()) : ICON.run}</span><div><small>Hi ${esc(p.name || 'there')}</small><b class="num">${toGo} day${toGo === 1 ? '' : 's'} to race day</b></div><button class="round" data-edit aria-label="Edit plan">${ICON.pencil}</button></header>
    ${pill}
    ${installHint()}
    <div class="strip" id="strip" role="group" aria-label="Days this week">${wk.days.map(x => `<button class="sd${x.date === selDay ? ' sel' : ''}${x.date === today ? ' today' : ''}${x.type === 'rest' ? ' rest' : ''}${S.log[x.date] === 'done' ? ' done' : ''}" data-day="${x.date}" aria-pressed="${x.date === selDay}" aria-label="${fmt(x.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${esc(titleOf(x))}"><small>${x.date === today ? 'Today' : DOW[x.dow]}</small><span class="num">${dUTC(x.date).getUTCDate()}</span></button>`).join('')}</div>
    ${cardHTML(d)}
    ${stepRows(d, wk.paces)}
    ${slideHTML(d)}`;
  bindSlides($('#v-today'));
  bindStrip();
}

function bindStrip() {
  const el = $('#strip');
  let x0 = null, y0 = 0;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const nd = addDays(selDay, dx < 0 ? 7 : -7);
      if (workoutAt(nd)) { selDay = nd; el._swiped = performance.now(); renderToday(); }
    }
  });
  el.addEventListener('pointercancel', () => x0 = null);
}

function renderPlan() {
  const ci = curWeek();
  const kmOf = w => w.days.reduce((a, d) => a + (d.type === 'race' ? 0 : d.km), 0);
  const max = Math.max(...plan.weeks.map(kmOf), 1);
  $('#v-plan').innerHTML = `
    ${head('Plan')}
    <article class="wcard">
      <div class="wc-top"><span class="ic-c">${ICON.cal}</span><span class="wc-pill" id="pc-pill"></span></div>
      <div class="wc-txt"><h2 id="pc-title"></h2><p id="pc-sub" class="num"></p></div>
      <div class="chart" id="chart" tabindex="0" role="slider" aria-label="Week" aria-valuemin="1" aria-valuemax="${N()}">${plan.weeks.map((w, i) => `<span class="bar${i < ci ? ' past' : ''}${i === ci ? ' now' : ''}" style="height:${Math.max(5, kmOf(w) / max * 100)}%"></span>`).join('')}</div>
    </article>
    <div class="pager" id="pager">${plan.weeks.map(w => `<section class="page" aria-label="Week ${w.i + 1}">${w.days.map(d => {
      const st = S.log[d.date];
      return `<button class="dr${d.type === 'rest' ? ' rest' : ''}${d.date === today ? ' today' : ''}${st ? ' is-' + st : ''}" data-open="${d.date}"><span class="dc"><small>${DOW[d.dow]}</small><b class="num">${dUTC(d.date).getUTCDate()}</b></span><span class="dr-txt"><b><i class="dot ${CAT[d.type]}"></i>${esc(titleOf(d))}</b><small class="num">${esc(summary(d, w.paces))}</small></span>${d.type === 'rest' ? '<span></span>' : `<span class="chk">${st === 'skip' ? ICON.x : ICON.check}</span>`}</button>`;
    }).join('')}</section>`).join('')}</div>`;
  bindPlan();
}
function summary(d, P) {
  if (d.type === 'rest') return d.tags.includes('strength') ? 'Optional' : 'Day off';
  if (d.type === 'race') return `26.2 mi · ${pace(P.M)} /mi`;
  const lead = `${miles(d.km)} mi`;
  if (d.type === 'strides') return `${lead} + strides`;
  if (d.type === 'hillsprints') return `${lead} + hill sprints`;
  if (d.type === 'longm') { const m = d.segs.find(s => s.z === 'M'); return `${lead} · last ${miles(m.km)} at marathon pace`; }
  const main = d.segs.find(s => s.z !== 'W' && s.z !== 'E');
  if (!main || CAT[d.type] !== 'hard') return lead;
  if (main.z === 'TT') return `${lead} · 5K hard`;
  if (main.reps) { const rep = Math.abs(main.repKm - MI) < 0.01 ? '1 mi' : main.timed ? `${main.timed} s` : `${Math.round(main.repKm * 1000)} m`; return `${lead} · ${main.reps} × ${rep}${main.timed ? '' : ' ' + ZSHORT[main.z]}`; }
  return `${lead} · ${miles(main.km)} at ${ZSHORT[main.z]}`;
}

let pagerSync = null;
function bindPlan() {
  const pg = $('#pager'), ch = $('#chart'), bars = $$('.bar', ch);
  const step = () => pg.clientWidth + 16;
  const setSel = (i, scroll, smooth) => {
    i = clamp(i, 0, N() - 1); selWeek = i;
    const w = plan.weeks[i];
    bars.forEach((b, j) => b.classList.toggle('sel', j === i));
    $('#pc-pill').textContent = `Week ${i + 1} of ${N()}`;
    $('#pc-title').textContent = `${PHASE[w.phase]}${w.rec ? ', lighter week' : ''}`;
    $('#pc-sub').textContent = `${milesInt(w.km)} mi · ${fmt(w.start, { month: 'short', day: 'numeric' })} – ${fmt(addDays(w.start, 6), { month: 'short', day: 'numeric' })}`;
    ch.setAttribute('aria-valuenow', i + 1); ch.setAttribute('aria-valuetext', `Week ${i + 1}`);
    if (scroll && pg.clientWidth) pg.scrollTo({ left: i * step(), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  };
  let t;
  pg.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { if (!pg.clientWidth) return; const i = Math.round(pg.scrollLeft / step()); if (i !== selWeek) setSel(i, false); }, 60); }, { passive: true });
  let drag = false;
  const at = e => { const r = ch.getBoundingClientRect(); return Math.floor((e.clientX - r.left) / r.width * N()); };
  ch.addEventListener('pointerdown', e => { drag = true; try { ch.setPointerCapture(e.pointerId); } catch (_) {} setSel(at(e), true, false); });
  ch.addEventListener('pointermove', e => { if (drag) setSel(at(e), true, false); });
  ['pointerup', 'pointercancel'].forEach(ev => ch.addEventListener(ev, () => drag = false));
  ch.addEventListener('keydown', e => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (k) { e.preventDefault(); setSel(selWeek + k, true, true); }
  });
  pagerSync = () => setSel(selWeek, true, false);
  setSel(selWeek, false);
  pagerSync();
}

function verdict() {
  const f = plan.feas;
  switch (f.level) {
    case 'ready': return ['Within reach', `Now: ${hms(f.curPred)}`];
    case 'achievable': return ['Achievable', `Now: ${hms(f.curPred)}`];
    case 'stretch': return ['Stretch goal', `Realistic: ${hms(f.suggest)}`];
    case 'aggressive': return ['Very ambitious', `Realistic: ${hms(f.suggest)}`];
    default: return ['Needs a 5K test', '5K test in week 2'];
  }
}

function renderRace() {
  const p = S.profile, kg = p.weightKg, T = p.goalSec, h = T / 3600;
  const P = plan.weeks[curWeek()].paces;
  const [vt, vb] = verdict();
  const halfKm = 42.195 / 2, s1 = T / 2 * 1.01, s2 = T - s1;
  const at = km => km <= halfKm ? s1 * km / halfKm : s1 + s2 * (km - halfKm) / halfKm;
  const splits = [['5 mi', 5 * MI], ['10 mi', 10 * MI], ['Halfway', halfKm], ['15 mi', 15 * MI], ['20 mi', 20 * MI], ['Finish', 42.195]];
  const gph = h < 2.5 ? 60 : 75;
  const gels = Math.max(1, Math.ceil(gph * (h - 0.5) / 25));
  const gap = (h * 60 - 30) / gels;
  const gelMiles = Array.from({ length: gels }, (_, i) => Math.round((30 + i * gap) * 60 / (T / 26.2188)));
  const r5 = x => Math.round(x / 5) * 5;
  const paceRow = (k, c, name, sub, v) => `<div class="r"><span class="ring ${c}" style="--p:${EFF[k]}"><i>${k}</i></span><div class="r-txt"><b>${name}</b><small>${sub}</small></div><div class="r-val"><b class="num">${v}</b><small>per mile</small></div></div>`;
  $('#v-race').innerHTML = `
    ${head('Race')}
    <article class="wcard">
      <div class="wc-top"><span class="ic-c">${ICON.flag}</span><span class="wc-pill">${vt}</span></div>
      <div class="wc-txt"><p>Goal · ${fmt(plan.race, { weekday: 'short', month: 'short', day: 'numeric' })}</p><span class="goal-t num">${hms(T)}</span><p class="num">${pace(T / 42.195)} /mi · ${esc(vb)}</p></div>
    </article>
    ${plan.warnings.map(w => `<p class="note">${ICON.warn}<span>${esc(w)}</span></p>`).join('')}
    <h2 class="sec-t">Training paces</h2>
    <div class="rows">
      ${paceRow('E', 'blue', 'Easy', 'Most runs', `${pace(P.E[0])}–${pace(P.E[1])}`)}
      ${paceRow('M', '', 'Marathon', 'Race rhythm', pace(P.M))}
      ${paceRow('T', '', 'Threshold', 'Comfortably hard', pace(P.T))}
      ${paceRow('I', '', 'Interval', 'Hard', pace(P.I))}
      ${paceRow('R', '', 'Repetition', 'Fast and relaxed', pace(P.R))}
    </div>
    <h2 class="sec-t">Race splits</h2>
    <div class="tiles">
      <div class="tile"><small>Miles 1–13</small><b class="num">${pace(s1 / halfKm)} <em>/mi</em></b><span>Hold back, stay even</span></div>
      <div class="tile"><small>Miles 14–26.2</small><b class="num">${pace(s2 / halfKm)} <em>/mi</em></b><span>Squeeze, finish strong</span></div>
    </div>
    <div class="tiles three">${splits.map(([l, km]) => `<div class="tile"><small>${l}</small><b class="num">${hms(at(km))}</b></div>`).join('')}</div>
    <h2 class="sec-t">Fuel</h2>
    <div class="tiles">
      <div class="tile wide"><small>During the race</small><b>${gph} g carbs per hour</b><span class="num">${gels} gels, at mile ${gelMiles.join(' · ')}</span></div>
      <div class="tile"><small>Carb-load</small><b class="num">${r5(10 * kg)}–${r5(12 * kg)} g</b><span>a day, 2 days before</span></div>
      <div class="tile"><small>Breakfast</small><b class="num">${r5(2 * kg)} g carbs</b><span>3 hours before</span></div>
      <div class="tile"><small>Fluids</small><b>14–27 oz</b><span>per hour, to thirst</span></div>
      <div class="tile"><small>Protein</small><b class="num">${r5(1.4 * kg)}–${r5(1.8 * kg)} g</b><span>every day</span></div>
    </div>`;
}

/* ---------- logging ---------- */
function setLog(date, val, msg) {
  const prev = S.log[date];
  if (val) S.log[date] = val; else delete S.log[date];
  save(); refresh();
  if (msg) toast(msg, () => { if (prev) S.log[date] = prev; else delete S.log[date]; save(); refresh(); });
}
// Save (sec > 0) or clear (sec = 0) a 5K time trial. Paces and the race prediction rebuild from it.
function logTT(date, sec) {
  const prevTT = S.profile.tt, prevLog = S.log[date];
  // Paces come from the engine, so a new time needs a full rebuild, not just a redraw.
  const rebuild = () => { save(); render(); if (!$('#ws').hidden && wsDate) fillWorkout(wsDate); };
  if (sec) { S.profile.tt = { date, sec }; S.log[date] = 'done'; } else { delete S.profile.tt; delete S.log[date]; }
  rebuild();
  toast(sec ? `5K in ${mss(sec)}. Paces updated.` : 'Time trial removed', () => {
    if (prevTT) S.profile.tt = prevTT; else delete S.profile.tt;
    if (prevLog) S.log[date] = prevLog; else delete S.log[date];
    rebuild();
  });
}
function refresh() {
  renderToday(); renderPlan(); renderRace();
  if (!$('#ws').hidden && wsDate) fillWorkout(wsDate);
}
let tt;
function toast(msg, undo) {
  const t = $('#toast'), b = $('button', t);
  $('span', t).textContent = msg;
  b.hidden = !undo;
  b.onclick = () => { undo && undo(); hideToast(); };
  t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(hideToast, 4000);
}
function hideToast() { $('#toast').classList.remove('show'); }

/* ---------- swipe-to-log slider ---------- */
function bindSlides(root) {
  $$('.slide', root).forEach(sl => {
    const knob = $('.knob', sl), date = sl.dataset.slide, label = $('.sl-label', sl);
    if (sl.classList.contains('done')) { knob.addEventListener('click', () => workoutAt(date)?.type === 'test' ? logTT(date, 0) : setLog(date, null, 'Log removed')); return; }
    let x0 = null, dx = 0, id = null;
    const max = () => sl.clientWidth - knob.offsetWidth - 16;
    knob.addEventListener('pointerdown', e => { if (e.button) return; id = e.pointerId; x0 = e.clientX; dx = 0; try { knob.setPointerCapture(id); } catch (_) {} sl.classList.add('dragging'); });
    knob.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      dx = clamp(e.clientX - x0, 0, max());
      knob.style.transform = `translateX(${dx}px)`;
      label.style.opacity = String(1 - dx / max());
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; sl.classList.remove('dragging');
      if (dx > max() * 0.72) { knob.style.transform = `translateX(${max()}px)`; setTimeout(() => setLog(date, 'done', 'Nice work. Run logged.'), 220); }
      else { knob.style.transform = ''; label.style.opacity = ''; if (dx < 4) { knob.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(18px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'ease-out' }); } }
    };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLog(date, 'done', 'Nice work. Run logged.'); } });
  });
}

/* ---------- sheets ---------- */
function openLayer(L) {
  L.hidden = false; void L.offsetHeight; L.classList.add('open');
  document.documentElement.classList.add('locked');
  L._ret = document.activeElement;
  setTimeout(() => { const f = $('.sheet', L); f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }, 50);
}
function closeLayer(L) {
  if (L.hidden) return;
  L.classList.remove('open');
  setTimeout(() => { L.hidden = true; if (!$$('.layer.open').length) document.documentElement.classList.remove('locked'); L._ret?.focus?.({ preventScroll: true }); }, 340);
}
function bindSheetDrag(L) {
  const sh = $('.sheet', L);
  let y0 = 0, dy = 0, t0 = 0, id = null, moved = false;
  sh.addEventListener('pointerdown', e => {
    if (e.button || !e.target.closest('[data-drag]') || e.target.closest('input,select,textarea')) return;
    id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0; moved = false;
  });
  sh.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const d = e.clientY - y0;
    if (!moved && Math.abs(d) > 6) { moved = true; try { sh.setPointerCapture(id); } catch (_) {} sh.classList.add('dragging'); }
    if (!moved) return;
    dy = d > 0 ? d : d / 4;
    sh.style.transform = `translateY(${dy}px)`;
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    if (!moved) return;
    sh._dragEnd = performance.now();
    const v = dy / Math.max(1, performance.now() - t0);
    sh.classList.remove('dragging');
    sh.style.transform = '';
    if (dy > 110 || (v > 0.5 && dy > 30)) closeLayer(L);
  };
  sh.addEventListener('pointerup', end);
  sh.addEventListener('pointercancel', end);
}

let wsDate = null;
function openWorkout(date) { if (!workoutAt(date)) return; wsDate = date; fillWorkout(date); openLayer($('#ws')); }
function fillWorkout(date) {
  const d = workoutAt(date), wk = weekOf(date);
  $('#ws .sheet').innerHTML = `<div class="grab" data-drag><span></span></div><div class="sheet-body">${cardHTML(d, true)}${stepRows(d, wk.paces)}${slideHTML(d)}</div>`;
  bindSlides($('#ws'));
}

/* ---------- setup ---------- */
function parseTime(str, mode) {
  const parts = String(str || '').trim().split(/[:.,\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some(n => !isFinite(n))) return 0;
  if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  const asH = mode === 'h' || (mode === 'auto' && parts[0] <= 6);
  if (parts.length === 2) return asH ? parts[0] * 3600 + parts[1] * 60 : parts[0] * 60 + parts[1];
  return asH ? parts[0] * 3600 : parts[0] * 60;
}
const radios = (name, items, val) => `<div class="seg" role="radiogroup">${items.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${String(v) === String(val) ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;

/* ---------- setup form controls ---------- */
const DISTS = [[0, 'None'], [5000, '5K'], [10000, '10K'], [21097.5, 'Half'], [42195, 'Full']];
const GOALS = ['3:00', '3:30', '4:00', '4:30', '5:00'];
const STEP = { 'f-age': [12, 90, 1], 'f-wt': [70, 440, 1], 'f-wk': [0, 150, 1], 'f-long': [0, 30, 1] };
const CHEV = svg('<path d="M9 6l6 6-6 6"/>', 16, 2.4);

const nextSunday = s => { let d = s; while (dUTC(d).getUTCDay() !== 0) d = addDays(d, 1); return d; };
const weeksOut = n => nextSunday(addDays(today, n * 7));
const segBox = (id, val, label, max, extra = '') => `<label class="tseg"${extra}><input id="${id}" inputmode="numeric" pattern="[0-9]*" maxlength="${max}" autocomplete="off" enterkeyhint="next" value="${val}" aria-label="${label}"><small>${label}</small></label>`;
const stepper = (id, label, val, unit = '') => `<div class="fr"><span id="l-${id}">${label}</span><div class="step"><button type="button" class="sbtn" data-step="${id}" data-d="-1" aria-label="Less">−</button><input id="${id}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" value="${val}" aria-labelledby="l-${id}"><button type="button" class="sbtn" data-step="${id}" data-d="1" aria-label="More">+</button>${unit ? `<span class="u">${unit}</span>` : ''}</div></div>`;

function openSetup() {
  const p = S.profile, totIn = Math.round(p.heightCm / 2.54), g = Math.round(p.goalSec / 60);
  const rd = DISTS.map(d => d[0]).find(x => x && Math.abs(x - (p.recentDist || 0)) < 1) || 0;
  const rs = Math.round(p.recentSec || 0);
  const raceDate = p.raceDate > today ? p.raceDate : weeksOut(16);
  $('#ss .sheet').innerHTML = `
    <form id="setup" novalidate>
      <div class="grab" data-drag><span></span></div>
      <div class="bar-top" data-drag><button type="button" class="tbtn" data-close>Cancel</button><h2 id="ss-title">Your plan</h2><button type="submit" class="tbtn strong">Save</button></div>
      <div class="sheet-body">
        <p class="form-err" id="ferr" role="alert" hidden></p>

        <h3 class="grp-h">Goal</h3>
        <div class="grp">
          <div class="fblock" id="b-goal">
            <div class="fb-head"><span id="l-goal">Goal time</span><span class="fb-aside num" id="goal-pace"></span></div>
            <div class="tbox" role="group" aria-labelledby="l-goal">${segBox('f-gh', Math.floor(g / 60), 'hours', 1)}<span class="tcolon">:</span>${segBox('f-gm', pad(g % 60), 'min', 2)}</div>
            <div class="chips" role="group" aria-label="Common goals">${GOALS.map(t => `<button type="button" class="chip" data-goal="${t}">${t}</button>`).join('')}</div>
          </div>
          <div class="fblock" id="b-date">
            <button type="button" class="fr-btn" id="date-toggle" aria-expanded="false" aria-controls="cal"><span>Race date</span><span class="fr-val"><b id="date-label"></b><small id="date-weeks"></small></span><span class="chev">${CHEV}</span></button>
            <div class="cal" id="cal" hidden></div>
            <input type="hidden" id="f-date" value="${esc(raceDate)}">
          </div>
        </div>

        <h3 class="grp-h">You</h3>
        <div class="grp">
          <label class="fr"><span>Name</span><input id="f-name" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" placeholder="Optional" value="${esc(p.name || '')}"></label>
          ${stepper('f-age', 'Age', p.age)}
          <div class="fr" id="b-ht"><span id="l-ht">Height</span><div class="minis" role="group" aria-labelledby="l-ht"><label class="mini"><input id="f-ft" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="off" enterkeyhint="next" value="${Math.floor(totIn / 12)}" aria-label="Feet"><small>ft</small></label><label class="mini"><input id="f-in" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" enterkeyhint="next" value="${totIn % 12}" aria-label="Inches"><small>in</small></label></div></div>
          ${stepper('f-wt', 'Weight', Math.round(p.weightKg * LB), 'lb')}
        </div>

        <h3 class="grp-h">Running now</h3>
        <div class="grp">
          <div class="fblock" id="b-race">
            <div class="fb-head"><span>Recent race</span><span class="fb-aside">last 6 weeks</span></div>
            ${radios('f-rdist', DISTS, rd)}
            <div id="rtime-wrap"${rd ? '' : ' hidden'}>
              <div class="tbox" role="group" aria-label="Race time">${segBox('f-rh', Math.floor(rs / 3600), 'hours', 1, ' id="rh-seg"')}<span class="tcolon" id="rh-colon">:</span>${segBox('f-rm', pad(Math.floor(rs % 3600 / 60)), 'min', 2)}<span class="tcolon">:</span>${segBox('f-rs', pad(rs % 60), 'sec', 2)}</div>
            </div>
            <p class="hint-line" id="race-hint"></p>
          </div>
          ${stepper('f-wk', 'Miles per week', Math.round((p.weeklyKm || 0) / MI), 'mi')}
          ${stepper('f-long', 'Longest recent run', Math.round((p.longestKm || 0) / MI), 'mi')}
          <div class="fr stack"><span>Marathons finished</span>${radios('f-exp', [['new', 'None'], ['mid', '1–2'], ['adv', '3+']], p.exp)}</div>
        </div>

        <h3 class="grp-h">Schedule</h3>
        <div class="grp">
          <div class="fr stack"><span>Run days per week</span>${radios('f-days', [[3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']], p.days)}</div>
          <div class="fr stack"><span>Long run day</span>${radios('f-lday', [[5, 'Saturday'], [6, 'Sunday']], p.longDay)}</div>
        </div>
      </div>
      <div class="sheet-foot"><button type="submit" class="btn">Build my plan</button></div>
    </form>`;
  bindSetup(raceDate);
  openLayer($('#ss'));
}

function bindSetup(raceDate) {
  const f = $('#setup');
  let calMonth = raceDate.slice(0, 7);

  /* goal time */
  const goalSec = () => (parseInt($('#f-gh').value, 10) || 0) * 3600 + (parseInt($('#f-gm').value, 10) || 0) * 60;
  const updGoal = () => {
    const s = goalSec();
    $('#goal-pace').textContent = s >= 2 * 3600 && s <= 7 * 3600 ? `${pace(s / 42.195)} /mi` : '';
    $$('[data-goal]', f).forEach(c => c.classList.toggle('on', parseTime(c.dataset.goal, 'h') === s));
  };

  /* race date + calendar */
  const updDate = () => {
    const d = $('#f-date').value, days = between(today, d), w = Math.floor(days / 7);
    $('#date-label').textContent = fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    $('#date-weeks').textContent = days < 14 ? `${days} days away` : `${w} weeks away${w < 12 ? ' · short build' : ''}`;
  };
  const drawCal = () => {
    const [y, m] = calMonth.split('-').map(Number), sel = $('#f-date').value;
    const first = `${calMonth}-01`, lead = (dUTC(first).getUTCDay() + 6) % 7, dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const minM = today.slice(0, 7), maxM = addDays(today, 730).slice(0, 7);
    const cells = Array.from({ length: lead }, () => '<span></span>').concat(Array.from({ length: dim }, (_, i) => {
      const d = `${calMonth}-${pad(i + 1)}`, dow = (lead + i) % 7, off = d <= today || d > addDays(today, 730);
      return `<button type="button" class="cd${d === sel ? ' sel' : ''}${d === today ? ' today' : ''}${dow >= 5 ? ' wkend' : ''}" data-cal="${d}"${off ? ' disabled' : ''} aria-pressed="${d === sel}" aria-label="${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}">${i + 1}</button>`;
    }));
    $('#cal').innerHTML = `
      <div class="cal-h"><button type="button" class="cal-nav" data-month="-1" aria-label="Previous month"${calMonth <= minM ? ' disabled' : ''}>${svg('<path d="M15 6l-6 6 6 6"/>', 16, 2.4)}</button><b>${dUTC(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><button type="button" class="cal-nav" data-month="1" aria-label="Next month"${calMonth >= maxM ? ' disabled' : ''}>${CHEV}</button></div>
      <div class="cal-grid" id="cal-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<small>${x}</small>`).join('')}${cells.join('')}</div>
      <div class="chips" role="group" aria-label="Weeks from now">${[12, 16, 20].map(n => `<button type="button" class="chip${weeksOut(n) === sel ? ' on' : ''}" data-weeks="${n}">${n} weeks</button>`).join('')}</div>`;
  };
  const moveMonth = k => {
    const [y, m] = calMonth.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + k, 1));
    const nm = d.toISOString().slice(0, 7);
    if (nm < today.slice(0, 7) || nm > addDays(today, 730).slice(0, 7)) return;
    calMonth = nm; drawCal();
  };
  const setDate = d => { $('#f-date').value = d; calMonth = d.slice(0, 7); updDate(); drawCal(); clearBad($('#b-date')); };

  /* recent race */
  const raceSec = () => (parseInt($('#f-rh').value, 10) || 0) * 3600 + (parseInt($('#f-rm').value, 10) || 0) * 60 + (parseInt($('#f-rs').value, 10) || 0);
  const updRace = () => {
    const dist = +($('input[name="f-rdist"]:checked', f)?.value || 0), long = dist >= 21000;
    $('#rtime-wrap').hidden = !dist;
    $('#rh-seg').hidden = $('#rh-colon').hidden = !long;
    if (!long) $('#f-rh').value = '0';
    const s = raceSec(), V = dist && s ? Engine.vdot(dist, s) : 0;
    $('#race-hint').textContent = !dist ? 'No race? Week 2 has a 5K time trial to set your paces.'
      : V >= 15 && V <= 90 ? `Predicts ${hms(Engine.raceTime(42195, V))} for a marathon today` : 'Enter your finish time';
  };

  /* typing behaviour for the boxed number fields */
  $$('.tseg input, .mini input, .step input', f).forEach(inp => {
    inp.addEventListener('focus', () => setTimeout(() => { try { inp.setSelectionRange(0, inp.value.length); } catch (_) {} }, 0));
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '');
      const ml = +inp.getAttribute('maxlength');
      if (ml && inp.value.length >= ml) focusNext(inp);
      clearBad(inp.closest('.fblock, .fr'));
      updGoal(); updRace();
    });
  });
  ['f-gm', 'f-rm', 'f-rs'].forEach(id => $('#' + id).addEventListener('blur', e => { const v = parseInt(e.target.value, 10); e.target.value = pad(isNaN(v) ? 0 : Math.min(59, v)); updGoal(); updRace(); }));
  $('#f-in').addEventListener('blur', e => { const v = parseInt(e.target.value, 10); e.target.value = String(isNaN(v) ? 0 : Math.min(11, v)); });

  /* steppers: tap or hold */
  $$('.sbtn', f).forEach(b => {
    const inp = $('#' + b.dataset.step), [lo, hi, st] = STEP[b.dataset.step], d = +b.dataset.d;
    const bump = () => { const v = clamp((parseInt(inp.value, 10) || 0) + d * st, lo, hi); inp.value = v; clearBad(inp.closest('.fr')); };
    let t1, t2;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); bump(); t1 = setTimeout(() => { t2 = setInterval(bump, 70); }, 380); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('click', e => { if (e.detail === 0) bump(); });
  });

  /* clicks inside the form */
  f.addEventListener('click', e => {
    let el;
    if ((el = e.target.closest('[data-goal]'))) { const [h, m] = el.dataset.goal.split(':'); $('#f-gh').value = h; $('#f-gm').value = m; clearBad($('#b-goal')); return updGoal(); }
    if (e.target.closest('#date-toggle')) { const c = $('#cal'), open = c.hidden; c.hidden = !open; $('#date-toggle').setAttribute('aria-expanded', open); if (open) { drawCal(); setTimeout(() => revealIn(c), 30); } return; }
    if ((el = e.target.closest('[data-cal]'))) return setDate(el.dataset.cal);
    if ((el = e.target.closest('[data-month]'))) return moveMonth(+el.dataset.month);
    if ((el = e.target.closest('[data-weeks]'))) return setDate(weeksOut(+el.dataset.weeks));
  });
  f.addEventListener('change', e => { if (e.target.name === 'f-rdist') { updRace(); clearBad($('#b-race')); if (e.target.value !== '0') setTimeout(() => ($('#f-rm')).focus(), 50); } });

  /* swipe the calendar to change month */
  let cx = null;
  $('#cal').addEventListener('pointerdown', e => { if (e.target.closest('.cal-grid')) cx = [e.clientX, e.clientY]; });
  $('#cal').addEventListener('pointerup', e => {
    if (!cx) return; const dx = e.clientX - cx[0], dy = e.clientY - cx[1]; cx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { moveMonth(dx < 0 ? 1 : -1); $('#cal')._swiped = performance.now(); }
  });
  $('#cal').addEventListener('click', e => { if ($('#cal')._swiped && performance.now() - $('#cal')._swiped < 300) e.stopPropagation(); }, true);

  /* Return moves to the next field; on the last one it closes the keyboard */
  f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input:not([type=radio])')) { e.preventDefault(); focusNext(e.target); } });

  f.addEventListener('submit', saveSetup);
  updGoal(); updDate(); updRace();
}

function focusNext(inp) {
  const all = $$('#setup input:not([type=hidden]):not([type=radio])').filter(x => !x.closest('[hidden]'));
  const nx = all[all.indexOf(inp) + 1];
  if (nx) nx.focus(); else inp.blur();
}
function revealIn(el) {
  const body = el.closest('.sheet-body'); if (!body) return;
  const r = el.getBoundingClientRect(), br = body.getBoundingClientRect();
  if (r.top < br.top + 12 || r.bottom > br.bottom - 12) body.scrollTo({ top: body.scrollTop + r.top - br.top - Math.max(16, (br.height - Math.min(r.height, br.height)) / 3), behavior: reduceMotion() ? 'auto' : 'smooth' });
}
const clearBad = el => { if (el) el.classList.remove('bad'); };

function saveSetup(e) {
  e.preventDefault();
  const sh = $('#ss .sheet');
  if (sh._dragEnd && performance.now() - sh._dragEnd < 350) return;
  const v = id => $('#' + id).value.trim(), num = id => parseInt(v(id), 10) || 0, rad = n => $(`#setup input[name="${n}"]:checked`)?.value;
  $$('#setup .bad').forEach(x => x.classList.remove('bad'));
  const err = (m, blockId) => {
    const el = $('#ferr'); el.textContent = m; el.hidden = false;
    const b = blockId && $('#' + blockId)?.closest('.fblock, .fr'); if (b) { b.classList.add('bad'); setTimeout(() => revealIn(b), 30); }
    else $('#ss .sheet-body').scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  const goalSec = num('f-gh') * 3600 + num('f-gm') * 60;
  if (!(goalSec >= 2 * 3600 && goalSec <= 7 * 3600)) return err('Enter a goal time between 2:00 and 7:00.', 'b-goal');
  const raceDate = v('f-date');
  if (!raceDate || raceDate <= today) return err('Pick a race date after today.', 'b-date');
  const age = num('f-age');
  if (!(age >= 12 && age <= 90)) return err('Enter an age between 12 and 90.', 'l-f-age');
  const heightCm = (num('f-ft') * 12 + num('f-in')) * 2.54;
  if (!(heightCm >= 120 && heightCm <= 230)) return err('Enter a height between 4 ft and 7 ft 6 in.', 'b-ht');
  const lb = num('f-wt');
  if (!(lb >= 70 && lb <= 440)) return err('Enter a weight between 70 and 440 lb.', 'l-f-wt');
  const rdist = +(rad('f-rdist') || 0);
  let rsec = 0;
  if (rdist) {
    rsec = num('f-rh') * 3600 + num('f-rm') * 60 + num('f-rs');
    const V = rsec ? Engine.vdot(rdist, rsec) : 0;
    if (!(V >= 15 && V <= 90)) return err(rsec ? "That race time doesn't look right for the distance." : 'Enter your race time, or choose None.', 'b-race');
  }
  const wk = num('f-wk'), lg = num('f-long');
  if (!(wk >= 0 && wk <= 150)) return err('Enter your miles per week, from 0 to 150.', 'l-f-wk');
  if (!(lg >= 0 && lg <= 30)) return err('Enter your longest recent run, from 0 to 30 miles.', 'l-f-long');
  const old = S.profile, sameRace = old.raceDate === raceDate && !old.example;
  const sameRecent = (old.recentDist || 0) === rdist && Math.round(old.recentSec || 0) === Math.round(rsec);
  S.profile = {
    example: false, from: sameRace && old.from ? old.from : today, tt: sameRace && sameRecent ? old.tt : undefined, name: v('f-name').slice(0, 40), age, sex: S.profile.sex || 'm', heightCm: Math.round(heightCm), weightKg: Math.round(lb / LB * 10) / 10,
    restHr: 0, maxHr: 0, goalSec, raceDate, recentDist: rdist, recentSec: rsec, weeklyKm: wk * MI, longestKm: lg * MI,
    exp: rad('f-exp') || 'mid', days: +(rad('f-days') || 5), longDay: +(rad('f-lday') || 6), units: 'mi',
  };
  save(); selWeek = null; selDay = null; render();
  closeLayer($('#ss'));
  toast('Plan updated');
}

/* ---------- keyboard: keep sheets inside the visible area above the iPhone keyboard ---------- */
(function trackKeyboard() {
  const vv = window.visualViewport, root = document.documentElement;
  if (!vv) return;
  const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(radio|checkbox|button|submit|hidden)$/.test(a.type))); };
  const upd = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-h', `${vv.height}px`);
    root.classList.toggle('kb', typing() && window.innerHeight - vv.height > 140);
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
  document.addEventListener('focusin', e => {
    upd();
    const el = e.target;
    if (el.matches?.('.sheet-body input')) setTimeout(() => { upd(); revealIn(el.closest('.tbox, .fr, .fblock') || el); }, 320);
  });
  document.addEventListener('focusout', () => setTimeout(upd, 60));
  upd();
})();

/* ---------- navigation ---------- */
function show(name, fromHash) {
  if (!['today', 'plan', 'race'].includes(name)) name = 'today';
  if (name === view && !fromHash) { window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
  view = name;
  $$('.view').forEach(v => v.hidden = v.id !== 'v-' + name);
  $$('.tab').forEach(t => { if (t.dataset.tab === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  if (name === 'plan' && pagerSync) pagerSync();
  if (!fromHash) try { history.replaceState(null, '', '#' + name); } catch (_) {}
}

document.addEventListener('click', e => {
  const sheet = e.target.closest('.sheet');
  if (sheet && sheet._dragEnd && performance.now() - sheet._dragEnd < 350) { e.preventDefault(); return; }
  let el;
  if ((el = e.target.closest('[data-day]'))) { const s = $('#strip'); if (s?._swiped && performance.now() - s._swiped < 400) return; selDay = el.dataset.day; return renderToday(); }
  if ((el = e.target.closest('[data-tab]'))) return show(el.dataset.tab);
  if (e.target.closest('[data-edit]')) return openSetup();
  if (e.target.closest('[data-hint-close]')) { try { localStorage.setItem(HINT_KEY, '1'); } catch (_) {} return renderToday(); }
  if ((el = e.target.closest('[data-close]'))) return closeLayer(el.closest('.layer'));
  if ((el = e.target.closest('[data-open]'))) return openWorkout(el.dataset.open);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('.tt-log'); if (!f) return;
  e.preventDefault();
  const m = +f.m.value || 0, sec = m * 60 + (+f.s.value || 0), V = sec ? Engine.vdot(5000, sec) : 0;
  const bad = $('.tt-err', f);
  if (!(V >= 15 && V <= 90) || +f.s.value > 59) { bad.textContent = sec ? 'That time doesn’t look right for a 5K.' : 'Enter your time, like 22:30.'; bad.hidden = false; f.classList.add('bad'); return; }
  document.activeElement?.blur?.();
  logTT(f.dataset.tt, sec);
});
document.addEventListener('input', e => {
  const f = e.target.closest('.tt-log'); if (!f) return;
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
  f.classList.remove('bad'); $('.tt-err', f).hidden = true;
  if (e.target.name === 'm' && e.target.value.length === 2) f.s.focus();
});
document.addEventListener('focusin', e => { if (e.target.closest?.('.tt-log input')) setTimeout(() => { try { e.target.select(); } catch (_) {} }, 0); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const L = $$('.layer.open').pop(); if (L) closeLayer(L); } });
window.addEventListener('hashchange', () => show(location.hash.slice(1), true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && localISO() !== today) { selDay = null; render(); } });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => pagerSync && view === 'plan' && pagerSync(), 120); });

bindSheetDrag($('#ws')); bindSheetDrag($('#ss'));
load(); render(); show(location.hash.slice(1) || 'today', true);

/* ---------- offline + storage ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Ask the browser not to clear saved runs when space is low.
navigator.storage?.persist?.().catch(() => {});
})();
