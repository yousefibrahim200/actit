'use strict';

/* ===================== Helpers ===================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };

/* ===================== Audio (Web Audio API) ===================== */
const Sfx = {
  ctx: null, on: true,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  correct() { this.tone(660, .1, 'triangle'); this.tone(990, .18, 'triangle', .15, .09); },
  skip()    { this.tone(260, .12, 'square', .08); this.tone(190, .15, 'square', .08, .09); },
  tick(hi)  { this.tone(hi ? 1400 : 1000, .05, 'square', .05); },
  buzzer()  { this.tone(140, .9, 'sawtooth', .22); this.tone(110, .9, 'square', .1); },
  win()     { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .25, 'triangle', .15, i * .12)); },
  ready()   { this.tone(520, .08, 'sine'); this.tone(780, .12, 'sine', .12, .08); }
};

/* ===================== Confetti ===================== */
const Confetti = {
  cv: $('#confetti'), parts: [], raf: 0,
  fire(count = 140) {
    const cv = this.cv, dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    this.ctx = cv.getContext('2d'); this.ctx.scale(dpr, dpr);
    const colors = ['#00e5ff', '#ff2e93', '#a07bff', '#3dffa2', '#ffb020', '#fff'];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: innerWidth / 2, y: innerHeight * 0.55,
        vx: (Math.random() - .5) * 18, vy: -Math.random() * 18 - 4,
        s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        c: colors[(Math.random() * colors.length) | 0], life: 1
      });
    }
    if (!this.raf) this.loop();
  },
  loop() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.parts = this.parts.filter((p) => p.life > 0 && p.y < innerHeight + 20);
    for (const p of this.parts) {
      p.vy += .45; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .006;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (this.parts.length) this.raf = requestAnimationFrame(() => this.loop());
    else { this.raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
};

/* ===================== Word metadata (words.json stays untouched) ===================== */
const CATS = {
  sport: { label: 'رياضة وحركة', ids: [1,3,4,13,19,28,29,36,39,40,43,82,111,112,113,114,115,116,117,134,135,139,140,141,142,143,155,157,158,159,160,169,180] },
  food:  { label: 'أكل وشرب', ids: [6,9,15,17,24,27,35,41,44,46,49,58,59,60,61,62,63,64,65,66,67,68,69,70,71,103,104,105,106,152,153] },
  fun:   { label: 'تمثيل مضحك', ids: [10,25,51,52,54,55,85,118,119,120,121,122,123,124,125,127,156,163,179,181,182,183,184,191] }
};
const HARD = new Set([148,153,181,182,183,184,121,85,143,180,154]);
const CHALLENGES = ['بحركة واحدة بس', 'وإنت واقف على رجل واحدة', 'بالحركة البطيئة', 'من غير ما تستخدم إيديك', 'وإنت مقفل عينيك', 'وإنت بتلف حوالين نفسك'];
const DEFAULT_NAMES = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث', 'الفريق الرابع'];
const RING_LEN = 2 * Math.PI * 52;
const KEY = 'actit.v2';

function meta(w) {
  const cat = Object.keys(CATS).find((k) => CATS[k].ids.includes(w.id)) || 'daily';
  const n = w.title.length;
  return { id: w.id, title: w.title, cat, diff: HARD.has(w.id) || n > 16 ? 3 : n > 9 ? 2 : 1 };
}

/* ===================== State ===================== */
const S = { duration: 60, rounds: 3, teams: 2, cat: 'all', diff: 'all', penalty: 'off', fun: 'on' };
const G = {
  words: [], pool: [], deck: [], teams: [], turn: 0, log: [], pts: 0, streak: 0, skips: 0, cur: null,
  endAt: 0, remaining: 0, timer: null, lastTick: -1, running: false, paused: false
};
const idx = () => G.turn % G.teams.length;
const totalTurns = () => S.rounds * G.teams.length;
const show = (id) => $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
const overlay = (id, on) => $(id).classList.toggle('show', on);

/* ===================== Words ===================== */
async function loadWords() {
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(res.status);
    G.words = (await res.json()).filter((w) => w && w.title).map(meta);
    if (!G.words.length) throw new Error('empty');
    $('#start-btn').disabled = false;
  } catch (e) { $('#load-error').hidden = false; }
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function buildDeck() {
  let p = G.words.filter((w) => (S.cat === 'all' || w.cat === S.cat) && (S.diff === 'all' || w.diff === +S.diff));
  if (p.length < 8) p = G.words; // filter too narrow: fall back to everything
  G.pool = p; G.deck = shuffle([...p]);
}
function drawWord() {
  if (!G.deck.length) G.deck = shuffle([...G.pool]);
  return G.deck.pop();
}
function nextWord(animate = true) {
  const w = G.cur = drawWord();
  w.ch = S.fun === 'on' && Math.random() < 0.25 ? CHALLENGES[(Math.random() * CHALLENGES.length) | 0] : '';
  const card = $('#card');
  const paint = () => {
    $('#word-display').textContent = w.title;
    $('#stars').textContent = '⭐'.repeat(w.diff);
    $('#challenge').textContent = w.ch ? `🎯 ${w.ch} (+1)` : '';
  };
  if (!animate) return paint();
  card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
  setTimeout(paint, 190);
}

/* ===================== Setup & persistence ===================== */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ S, names: [0, 1, 2, 3].map((i) => [$(`#name-${i}`).value, $(`#player-${i}`).value]) }));
  } catch (_) {}
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d) return;
    Object.assign(S, d.S);
    (d.names || []).forEach((n, i) => { $(`#name-${i}`).value = n[0] || ''; $(`#player-${i}`).value = n[1] || ''; });
  } catch (_) {}
}
function syncSetup() {
  $$('.chips').forEach((box) => box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.v === String(S[box.dataset.key]))));
  [0, 1, 2, 3].forEach((i) => ($(`#tf-${i}`).hidden = i >= S.teams));
}
function initSetup() {
  $('#team-fields').innerHTML = [0, 1, 2, 3].map((i) => `
    <label class="field team-f" id="tf-${i}" style="--c:var(--c${i})"><span>${DEFAULT_NAMES[i]}</span>
      <input id="name-${i}" maxlength="16" placeholder="${DEFAULT_NAMES[i]}" autocomplete="off">
      <input id="player-${i}" maxlength="16" placeholder="اسم اللاعب (اختياري)" autocomplete="off">
    </label>`).join('');
  restore(); syncSetup();
  $$('.chips').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    S[box.dataset.key] = isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v;
    syncSetup(); Sfx.init(); Sfx.tone(700, .05, 'sine', .08); buzz(8);
  }));
  $('#start-btn').addEventListener('click', () => { Sfx.init(); startGame(); });
}
function startGame() {
  save();
  G.teams = Array.from({ length: S.teams }, (_, i) => ({
    name: $(`#name-${i}`).value.trim() || DEFAULT_NAMES[i], player: $(`#player-${i}`).value.trim(), score: 0
  }));
  $('#scoreboard').innerHTML = G.teams.map((t, i) =>
    `<div class="score" id="sc-${i}" style="--c:var(--c${i})"><b></b><em>0</em></div>`).join('');
  G.teams.forEach((t, i) => { $(`#sc-${i} b`).textContent = t.name; });
  G.turn = 0; G.log = []; buildDeck();
  show('game'); showTurn('', []);
}

/* ===================== Turn flow ===================== */
function showTurn(summary, log) {
  const t = G.teams[idx()];
  document.body.className = `team-${idx()}`;
  $('#turn-summary').textContent = summary;
  $('#turn-log').innerHTML = '';
  log.forEach((l) => {
    const s = document.createElement('span');
    s.className = 'lg ' + (l.ok ? 'ok' : 'sk'); s.textContent = (l.ok ? '✓ ' : '✗ ') + l.w;
    $('#turn-log').appendChild(s);
  });
  $('#turn-emoji').textContent = ['🎬', '🎤', '🎭', '🎪'][idx()];
  $('#turn-title').textContent = `استعدوا يا ${t.name}!`;
  $('#turn-sub').textContent = t.player
    ? `مرّر الجهاز إلى ${t.player} — ولا أحد غيره يشوف الشاشة.`
    : 'مرّر الجهاز للاعب الذي سيمثّل — ولا أحد غيره يشوف الشاشة.';
  $('#team-turn').textContent = t.name;
  $('#round-info').textContent = `الدور ${Math.floor(G.turn / G.teams.length) + 1} من ${S.rounds}`;
  $('#word-display').textContent = '…'; $('#stars').textContent = ''; $('#challenge').textContent = ''; $('#streak').textContent = '';
  $('#card').classList.remove('golden');
  setTimer(S.duration);
  overlay('#turn-modal', true);
}
function countdown() {
  Sfx.init(); overlay('#turn-modal', false); overlay('#cd', true);
  let n = 3;
  const step = () => {
    if (n === 0) { overlay('#cd', false); return startTurn(); }
    $('#cd-num').textContent = n; Sfx.tone(600, .1, 'sine', .15); buzz(15); n--;
    setTimeout(step, 800);
  };
  step();
}
function startTurn() {
  Sfx.tone(1000, .25, 'triangle', .18); buzz(30);
  G.pts = 0; G.streak = 0; G.skips = 0; G.log = [];
  G.running = true; G.paused = false; G.lastTick = -1;
  $('#pause-btn').textContent = '⏸';
  nextWord(false);
  G.endAt = Date.now() + S.duration * 1000;
  clearInterval(G.timer); G.timer = setInterval(tick, 200);
}
function setTimer(sec) {
  $('#timer').textContent = Math.max(0, Math.ceil(sec));
  $('.timer-wrap').classList.toggle('danger', sec <= 10 && G.running);
  $('#ring-fg').style.strokeDasharray = RING_LEN;
  $('#ring-fg').style.strokeDashoffset = RING_LEN * (1 - Math.max(0, sec) / S.duration);
}
function tick() {
  const left = (G.endAt - Date.now()) / 1000;
  setTimer(left);
  $('#card').classList.toggle('golden', left <= 10 && left > 0);
  const s = Math.ceil(left);
  if (s <= 10 && s > 0 && s !== G.lastTick) { G.lastTick = s; Sfx.tick(s % 2); buzz(10); }
  if (left <= 0) endTurn();
}
function endTurn() {
  clearInterval(G.timer); G.running = false; setTimer(0);
  $('.timer-wrap').classList.remove('danger');
  Sfx.buzzer(); buzz([200, 80, 200]);
  const t = G.teams[idx()], pts = G.pts, log = G.log;
  if (pts >= 8) { Confetti.fire(120); Sfx.win(); }
  G.turn++;
  const summary = `⏰ ${t.name}: ${pts} نقطة في هذا الدور`;
  setTimeout(() => (G.turn >= totalTurns() ? finish(summary, log) : showTurn(summary, log)), 900);
}
function popText(txt) {
  const p = $('#pop'); p.textContent = txt;
  p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
}
function addScore(delta) {
  const i = idx(), t = G.teams[i];
  const before = t.score; t.score = Math.max(0, t.score + delta); G.pts += t.score - before;
  const box = $(`#sc-${i}`); box.querySelector('em').textContent = t.score;
  box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
}
function mark(correct) {
  if (!G.running || G.paused) return;
  const w = G.cur;
  G.log.push({ w: w.title, ok: correct });
  if (correct) {
    G.streak++;
    let p = w.diff + (w.ch ? 1 : 0) + (G.streak >= 3 ? 1 : 0);
    const golden = G.endAt - Date.now() <= 10000;
    if (golden) p *= 2;
    addScore(p); popText(`+${p}${golden ? ' ⚡' : ''}`);
    Sfx.correct(); buzz(25);
  } else {
    G.streak = 0; G.skips++;
    if (S.penalty === 'on' && G.skips > 3) { addScore(-1); popText('-1'); }
    Sfx.skip(); buzz(12);
  }
  $('#streak').textContent = G.streak >= 2 ? `🔥 x${G.streak}` : '';
  nextWord();
}

/* ===================== Pause ===================== */
function pause() {
  if (!G.running || G.paused) return;
  G.paused = true; G.remaining = G.endAt - Date.now(); clearInterval(G.timer);
  $('#card').classList.add('hidden-word'); overlay('#pause-modal', true);
}
function resume() {
  if (!G.paused) return;
  G.paused = false; G.endAt = Date.now() + G.remaining;
  $('#card').classList.remove('hidden-word'); overlay('#pause-modal', false);
  G.timer = setInterval(tick, 200);
}

/* ===================== Result ===================== */
function finish(summary, log) {
  const max = Math.max(...G.teams.map((t) => t.score));
  const winners = G.teams.filter((t) => t.score === max);
  const wi = G.teams.indexOf(winners[0]);
  document.body.className = `team-${wi}`;
  $('#result-title').textContent = winners.length > 1 ? `تعادل بين ${winners.map((t) => t.name).join(' و')} 🤝` : `الفائز: ${winners[0].name}`;
  $('#result-sub').textContent = [...G.teams].sort((a, b) => b.score - a.score).map((t) => `${t.name}: ${t.score}`).join(' | ');
  $('#result-last').textContent = summary;
  overlay('#result-modal', true);
  Sfx.win(); buzz([100, 50, 100, 50, 300]);
  Confetti.fire(220); setTimeout(() => Confetti.fire(160), 500);
}

/* ===================== Card tilt ===================== */
function initTilt() {
  const card = $('#card'), scene = $('#scene');
  const move = (e) => {
    const r = scene.getBoundingClientRect();
    card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 18}deg`);
    card.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - .5) * 18}deg`);
  };
  const reset = () => { card.style.setProperty('--ry', '0deg'); card.style.setProperty('--rx', '0deg'); };
  scene.addEventListener('pointermove', move); scene.addEventListener('pointerdown', move);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => scene.addEventListener(ev, reset));
}

/* ===================== Init ===================== */
function init() {
  initSetup(); initTilt(); loadWords();
  $('#go-btn').addEventListener('click', countdown);
  $('#correct-btn').addEventListener('click', () => mark(true));
  $('#skip-btn').addEventListener('click', () => mark(false));
  $('#pause-btn').addEventListener('click', pause);
  $('#resume-btn').addEventListener('click', resume);
  $('#sound-btn').addEventListener('click', (e) => { Sfx.init(); Sfx.on = !Sfx.on; e.currentTarget.textContent = Sfx.on ? '🔊' : '🔇'; });
  $('#again-btn').addEventListener('click', () => { overlay('#result-modal', false); document.body.className = ''; syncSetup(); show('setup'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}
init();
