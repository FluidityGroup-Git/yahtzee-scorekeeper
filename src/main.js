import './styles.css';
import { UPPER, LOWER, META, BASE_KEYS, tierFor } from './game/categories.js';
import { valuesFor, computeTotals, filledBaseCount } from './game/scoring.js';
import { deriveTurnState, canClaimBonus, isGameOver, decideWinner } from './game/rules.js';
import { SoundEngine } from './sound.js';
import { fireCelebration, celebrationToast, showToast } from './ui/celebrations.js';
import { Speech } from './ui/speech.js';
import { AIPep, savageryLevel } from './ui/aiPep.js';
import { Voice } from './ui/voice.js';

// ---- dice glyph ----
const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieHTML(face) { let s = ''; for (let i = 0; i < 9; i++) s += FACES[face].includes(i) ? '<b></b>' : '<span></span>'; return `<span class="die">${s}</span>`; }

// ---- state: the entries log is canonical; turn state is derived by replaying it ----
const game = {
  players: [{ name: 'Dan' }, { name: 'Amber' }],
  startingSeat: 0,
  entries: [],        // { playerId, category, value, orderIndex, recordedAt }
  orderCounter: 0,
  status: 'setup',    // 'setup' | 'active' | 'finished'
};
let soundOn = true;
let pepOn = true;

const now = () => new Date().toISOString();
const valuesP = (p) => valuesFor(game.entries, p);
const turnState = () => deriveTurnState(game.entries, game.startingSeat);
const nameOf = (p) => (document.querySelector(`.pname[data-p="${p}"]`).value || ('Player ' + (p + 1)));
const device = document.getElementById('device');

// ---- build the scorecard ----
function catCell(c) {
  const die = c.face ? dieHTML(c.face) : '';
  return `<div class="cat">${die}<div><div class="catname">${c.name}</div><div class="cathint">${c.hint}</div></div></div>`;
}
function buildGrid(list, el) {
  el.innerHTML = list.map(c => `<div class="row" data-key="${c.key}">${catCell(c)}
    <div class="cell empty p0" data-key="${c.key}" data-p="0"></div>
    <div class="cell empty p1" data-key="${c.key}" data-p="1"></div></div>`).join('');
}
buildGrid(UPPER, document.getElementById('upperGrid'));
buildGrid(LOWER, document.getElementById('lowerGrid'));
function calcRow(name, hint, id0, id1, cls) {
  return `<div class="row calc ${cls || ''}"><div class="cat"><div><div class="catname">${name}</div>${hint ? `<div class="cathint">${hint}</div>` : ''}</div></div>
    <div class="cell p0" id="${id0}">0</div><div class="cell p1" id="${id1}">0</div></div>`;
}
document.getElementById('upperCalc').innerHTML =
  calcRow('Bonus', '+35 if subtotal ≥ 63', 'bon0', 'bon1', 'bonus') +
  calcRow('Upper total', '', 'up0', 'up1', 'uptot');
document.getElementById('lowerCalc').innerHTML =
  calcRow('Lower total', '', 'low0', 'low1', 'lowtot');

// Count-up animation for the big HUD totals. Sets the final value synchronously (so reads are
// always correct), then animates from the previous shown value — rAF runs before paint, so no
// flash of the final value. Skipped under reduced motion.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const countAnim = new Map();
function setTotal(el, target) {
  if (!el) return;
  const from = Number(el.dataset.shown ?? '0') || 0;
  el.dataset.shown = String(target);
  el.textContent = String(target);
  if (reducedMotion() || from === target) return;
  if (countAnim.has(el)) cancelAnimationFrame(countAnim.get(el));
  let start = null;
  const dur = 480;
  const step = (ts) => {
    if (start === null) start = ts;
    const t = Math.min(1, (ts - start) / dur);
    el.textContent = String(Math.round(from + (target - from) * t));
    if (t < 1) countAnim.set(el, requestAnimationFrame(step));
    else { el.textContent = String(target); countAnim.delete(el); }
  };
  countAnim.set(el, requestAnimationFrame(step));
}
let prevLeadSeat = null;   // for the comeback flash

// Display value + order badge for a cell (bonus accumulates across rows).
function displayCell(p, k) {
  if (k === 'yahtzeeBonus') {
    const bs = game.entries.filter(e => e.playerId === p && e.category === 'yahtzeeBonus');
    if (!bs.length) return null;
    return { value: bs.reduce((s, e) => s + e.value, 0), order: Math.max(...bs.map(e => e.orderIndex)) };
  }
  const e = game.entries.find(e => e.playerId === p && e.category === k);
  return e ? { value: e.value, order: e.orderIndex } : null;
}

function refresh() {
  const st = turnState();
  const active = st.activePlayer;
  // cells
  document.querySelectorAll('.cell[data-key]').forEach(cell => {
    const p = +cell.dataset.p, k = cell.dataset.key, d = displayCell(p, k);
    cell.classList.remove('empty', 'zero', 'filled', 'lastbox');
    if (d) { cell.innerHTML = d.value + `<span class="ord">${d.order}</span>`; cell.classList.add('filled'); if (d.value === 0) cell.classList.add('zero'); }
    else { cell.innerHTML = ''; cell.classList.add('empty'); }
  });
  // final-box flag: 12 of 13 base boxes filled
  [0, 1].forEach(p => {
    if (filledBaseCount(valuesP(p)) === 12) {
      const k = BASE_KEYS.find(k => valuesP(p)[k] === undefined);
      const cell = document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
      if (cell) { cell.classList.add('lastbox'); cell.classList.remove('empty'); cell.innerHTML = ''; }
    }
  });
  // totals + per-player HUD
  const grand = [0, 0];
  [0, 1].forEach(p => {
    const t = computeTotals(valuesP(p));
    grand[p] = t.grand;
    document.getElementById('bon' + p).textContent = t.bonus;
    document.getElementById('up' + p).textContent = t.upperTotal;
    document.getElementById('low' + p).textContent = t.lower;
    setTotal(document.getElementById('tot' + p), t.grand);
    document.getElementById('meta' + p).textContent = filledBaseCount(valuesP(p)) + ' / 13 boxes';
    document.getElementById('pmini' + p).textContent = `${t.upper} up · ${Math.max(0, 63 - t.upper)} to +35`;
  });
  document.querySelectorAll('.row.bonus').forEach((r, i) => r.classList.toggle('hit', computeTotals(valuesP(i)).bonus > 0));

  // ---- HUD center: round / leader / gap bar / savagery ----
  const f0 = filledBaseCount(valuesP(0)), f1 = filledBaseCount(valuesP(1));
  const over = game.status === 'finished';
  document.getElementById('roundLabel').textContent = over ? 'Final' : `Round ${Math.min(13, Math.min(f0, f1) + 1)} of 13`;
  const diff = grand[0] - grand[1];
  document.getElementById('leaderLabel').textContent = diff === 0 ? 'Tied' : `${nameOf(diff > 0 ? 0 : 1)} +${Math.abs(diff)}`;
  const gap = document.getElementById('gapFill');
  const pct = Math.min(50, (Math.abs(diff) / 80) * 50);    // cap the bar at a 80-point gap
  if (diff >= 0) { gap.style.left = (50 - pct) + '%'; gap.style.background = 'var(--p1)'; }
  else { gap.style.left = '50%'; gap.style.background = 'var(--p2)'; }
  gap.style.width = pct + '%';
  const lvl = savageryLevel((f0 + f1) / 26, maxSavagery);
  const sav = document.getElementById('savageLabel');
  sav.textContent = 'L' + lvl; sav.dataset.lvl = lvl;

  // comeback flash when the lead changes hands (or ties up)
  const leadSeat = diff > 0 ? 0 : diff < 0 ? 1 : -1;
  if (prevLeadSeat !== null && leadSeat !== prevLeadSeat && !reducedMotion()) {
    const c = document.querySelector('.center');
    if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
  }
  prevLeadSeat = leadSeat;

  // active highlight: panel scale + whole-screen tint (derived, advisory)
  const lit = game.status === 'active';
  document.querySelectorAll('.ppanel').forEach(c => c.classList.toggle('active', +c.dataset.p === active && lit));
  device.classList.toggle('turn-0', active === 0 && lit);
  device.classList.toggle('turn-1', active === 1 && lit);
  document.body.classList.toggle('turn-0', active === 0 && lit);
  document.body.classList.toggle('turn-1', active === 1 && lit);
  updateStatus(st);
}

function updateStatus(st = turnState()) {
  const sl = document.getElementById('statusLine');
  const active = st.activePlayer, nm = nameOf(active);
  if (game.status === 'finished') {
    const w = decideWinner(game.entries);
    sl.className = 'statusline win';
    if (w.result === 'tie') sl.innerHTML = `🤝 <b>Dead heat</b> — ${w.totals[0].grand} apiece. Rematch?`;
    else { const wp = w.result === 'p0' ? 0 : 1; sl.innerHTML = `🏆 <b>${nameOf(wp)} wins</b> ${w.totals[wp].grand}–${w.totals[1 - wp].grand}!`; }
  } else if (st.makeupOwed[active] > 0) {
    sl.className = 'statusline makeup';
    const owe = st.makeupOwed[active];
    sl.innerHTML = `💎 <b>Bonus Yahtzee!</b> ${nm} takes a whole extra turn — fill ${owe > 1 ? owe + ' open boxes' : 'an open box'} to even up.`;
  } else {
    sl.className = 'statusline turn p' + active;
    sl.innerHTML = `🎲 <b>${nm}</b>'s turn — roll, then tap a box to score.`;
  }
}

// ---- recording ----
function recordEntry(p, k, value) {
  const beforeTotals = computeTotals(valuesP(p));
  const prevActive = turnState().activePlayer;
  if (k === 'yahtzeeBonus') {
    if (value > 0) game.entries.push({ playerId: p, category: k, value: 100, orderIndex: ++game.orderCounter, recordedAt: now() });
    else game.entries = game.entries.filter(e => !(e.playerId === p && e.category === 'yahtzeeBonus')); // reset
  } else {
    const ex = game.entries.find(e => e.playerId === p && e.category === k);
    if (ex) { ex.value = value; ex.recordedAt = now(); }            // edit in place — keeps orderIndex
    else game.entries.push({ playerId: p, category: k, value, orderIndex: ++game.orderCounter, recordedAt: now() });
  }
  const afterTotals = computeTotals(valuesP(p));
  const crossedBonus = beforeTotals.bonus === 0 && afterTotals.bonus === 35;
  const isBonusTick = (k === 'yahtzeeBonus' && value > 0);
  refresh();
  celebrate(p, k, value, crossedBonus, isBonusTick);
  const newActive = turnState().activePlayer;
  const over = isGameOver(game.entries);
  if (!over && !isBonusTick && newActive !== prevActive) SoundEngine.play('turnpass');
  Speech.onTurn(nameOf(newActive), soundOn);
  if (over && game.status !== 'finished') onGameOver();
}

function clearScore(p, k) {
  if (k === 'yahtzeeBonus') game.entries = game.entries.filter(e => !(e.playerId === p && e.category === 'yahtzeeBonus'));
  else game.entries = game.entries.filter(e => !(e.playerId === p && e.category === k));
  refresh();
  Speech.onTurn(nameOf(turnState().activePlayer), soundOn);
}

const SLOT = { mega: 'bonus', legendary: 'yahtzee', epic: 'epic', great: 'great', nice: 'nice', bust: 'bust' };
function celebrate(p, k, value, crossedBonus, isBonusTick) {
  if (k === 'yahtzeeBonus' && !isBonusTick) return; // resetting the bonus box isn't a celebration
  const tier = tierFor({ category: k, value, crossedBonus, isBonusTick });
  const cell = document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
  if (cell) { cell.classList.remove('pop', 'bust'); void cell.offsetWidth; cell.classList.add(tier === 'bust' ? 'bust' : 'pop'); }
  SoundEngine.play(SLOT[tier] || 'tick');
  if (tier !== 'normal') Speech.noteCelebration();
  fireCelebration(tier);
  const ptsText = k === 'yahtzeeBonus' ? '+100' : (value === 0 ? '+0' : '+' + value);
  if (crossedBonus && tier === 'great') celebrationToast('great', '+' + value, 'UPPER BONUS! +35');
  else celebrationToast(tier, ptsText);
  if (tier === 'mega') Speech.announce('Extra turn!');
}

function onGameOver() {
  game.status = 'finished';
  Speech.stop();
  refresh();
  const w = decideWinner(game.entries);
  let msg;
  if (w.result === 'tie') msg = `Tie at ${w.totals[0].grand}`;
  else { const wp = w.result === 'p0' ? 0 : 1; msg = `${nameOf(wp)} ${w.totals[wp].grand}–${w.totals[1 - wp].grand}`; }
  showToast('🏆', 'GAME OVER', msg);
  fireCelebration('legendary');
  SoundEngine.play('yahtzee');
}

// ---- bottom-sheet entry ----
const scrim = document.getElementById('scrim'), entry = document.getElementById('entry');
let cur = { p: null, k: null };
function openEntry(p, k) {
  SoundEngine.warm(); Speech.warm();
  cur = { p, k };
  const c = META[k], pname = nameOf(p), die = c.face ? dieHTML(c.face) : '';
  let body = '';
  if (c.type === 'count') {
    let btns = ''; for (let n = 0; n <= 5; n++) btns += `<button class="countbtn" data-n="${n}"><span class="n">${n}</span><span class="v">= ${n * c.face}</span></button>`;
    body = `<p class="eodds">How many ${c.name.toLowerCase()} did ${pname} roll?</p><div class="countgrid">${btns}</div>
      <button class="bigbtn scratch" data-v="0" style="width:100%;margin-top:10px;">Scratch this box · 0</button>`;
  } else if (c.type === 'fixed') {
    body = `<p class="eodds">${c.hint}</p><div class="fixedwrap">
      <button class="bigbtn score" data-v="${c.value}">Score ${c.value}</button>
      <button class="bigbtn scratch" data-v="0">Scratch · 0</button></div>`;
  } else if (c.type === 'bonus') {
    const have = valuesP(p).yahtzeeBonus || 0;
    const yv = valuesP(p).yahtzee;
    if (canClaimBonus(valuesP(p))) {
      body = `<p class="eodds">Extra Yahtzee = +100 and a full extra turn to even up. Currently +${have}.</p>
        <div class="fixedwrap"><button class="bigbtn add" data-add="100">Add +100 🎉</button>
        ${have > 0 ? '<button class="bigbtn scratch" data-v="0">Reset · 0</button>' : ''}</div>`;
    } else {
      const why = yv === 0 ? `${pname} scratched the Yahtzee box — no bonuses this game.`
        : 'Score the Yahtzee box (50) first to unlock bonus Yahtzees.';
      body = `<p class="eodds">🔒 ${why}</p>${have > 0 ? '<div class="fixedwrap"><button class="bigbtn scratch" data-v="0">Reset · 0</button></div>' : ''}`;
    }
  } else { // sum
    body = `<p class="eodds">${c.hint}. Enter the total of all 5 dice (0–${c.max}).</p>
      <div class="padshow" id="padShow">0</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="key" data-d="${d}">${d}</button>`).join('')}</div>
      <div class="padrow2"><button class="key wide" data-back="1">⌫ Back</button><button class="key" data-d="0">0</button></div>
      <button class="bigbtn score" id="padConfirm" style="width:100%;margin-top:8px;">Save score</button>
      <button class="bigbtn scratch" data-v="0" style="width:100%;margin-top:8px;">Scratch this box · 0</button>`;
  }
  const clr = displayCell(p, k) ? '<div class="clearcell"><button id="clearBtn">Clear this entry</button></div>' : '';
  entry.innerHTML = `<div class="grab"></div><div class="ehead">${die}<div><div class="etitle">${c.name}</div><div class="ewho p${p}">${pname}</div></div></div>${body}${clr}`;
  wireEntry(c); scrim.classList.add('open');
}
function closeEntry() { scrim.classList.remove('open'); }
scrim.addEventListener('click', e => { if (e.target === scrim) closeEntry(); });
function wireEntry(c) {
  const cb = document.getElementById('clearBtn'); if (cb) cb.onclick = () => { clearScore(cur.p, cur.k); closeEntry(); };
  entry.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { recordEntry(cur.p, cur.k, +b.dataset.v); closeEntry(); });
  if (c.type === 'count') {
    entry.querySelectorAll('.countbtn').forEach(b => b.onclick = () => { recordEntry(cur.p, cur.k, (+b.dataset.n) * c.face); closeEntry(); });
  } else if (c.type === 'bonus') {
    const add = entry.querySelector('[data-add]'); if (add) add.onclick = () => { recordEntry(cur.p, cur.k, 100); closeEntry(); };
  } else if (c.type === 'sum') {
    let buf = ''; const show = document.getElementById('padShow'), draw = () => show.textContent = buf === '' ? '0' : buf;
    entry.querySelectorAll('[data-d]').forEach(key => key.onclick = () => { let n = (buf + key.dataset.d).replace(/^0+/, ''); if (n === '') buf = '0'; else if (+n <= c.max) buf = n; draw(); });
    entry.querySelector('[data-back]').onclick = () => { buf = buf.slice(0, -1); draw(); };
    document.getElementById('padConfirm').onclick = () => { recordEntry(cur.p, cur.k, buf === '' ? 0 : +buf); closeEntry(); };
  }
}
document.querySelectorAll('.cell[data-key]').forEach(cell => cell.addEventListener('click', () => openEntry(+cell.dataset.p, cell.dataset.key)));

// ---- who-goes-first setup (B) ----
const setupScrim = document.getElementById('setupScrim'), setupCard = document.getElementById('setupCard');
function showSetup() {
  game.status = 'setup';
  refresh();
  setupCard.innerHTML = `
    <div class="setuptitle">🎲 New game</div>
    <p class="setupnote">Set the names, then pick who rolls first.</p>
    <div class="setupnames">
      <input class="setup0" maxlength="12" value="${nameOf(0)}" aria-label="Player 1 name">
      <input class="setup1" maxlength="12" value="${nameOf(1)}" aria-label="Player 2 name">
    </div>
    <div class="setuplabel">Who rolls first?</div>
    <div class="firstpick">
      <button class="bigbtn first" data-seat="0">${nameOf(0)}</button>
      <button class="bigbtn first" data-seat="1">${nameOf(1)}</button>
    </div>
    <button class="bigbtn random" id="randomFirst">🪙 Random</button>
    <div class="coin" id="coin" hidden></div>`;
  const s0 = setupCard.querySelector('.setup0'), s1 = setupCard.querySelector('.setup1');
  const syncBtns = () => { setupCard.querySelector('[data-seat="0"]').textContent = s0.value || 'Player 1'; setupCard.querySelector('[data-seat="1"]').textContent = s1.value || 'Player 2'; };
  s0.addEventListener('input', syncBtns); s1.addEventListener('input', syncBtns);
  setupCard.querySelectorAll('.first').forEach(b => b.onclick = () => startGame(+b.dataset.seat));
  setupCard.querySelector('#randomFirst').onclick = () => {
    SoundEngine.warm(); Speech.warm();
    const seat = Math.random() < 0.5 ? 0 : 1;
    const coin = setupCard.querySelector('#coin');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { startGame(seat); return; }
    coin.hidden = false; coin.textContent = '🎲'; coin.classList.remove('flip'); void coin.offsetWidth; coin.classList.add('flip');
    SoundEngine.play('turnpass');
    setTimeout(() => { coin.classList.remove('flip'); coin.textContent = (seat === 0 ? s0.value : s1.value) || ('Player ' + (seat + 1)); SoundEngine.play('nice'); }, 1100);
    setTimeout(() => startGame(seat), 1700);
  };
  setupScrim.classList.add('open');
}
function startGame(seat) {
  const s0 = setupCard.querySelector('.setup0'), s1 = setupCard.querySelector('.setup1');
  setName(0, s0.value); setName(1, s1.value);
  game.startingSeat = seat; game.entries = []; game.orderCounter = 0; game.status = 'active';
  prevLeadSeat = null;
  setupScrim.classList.remove('open');
  refresh();
  Speech.onTurn(nameOf(seat), soundOn);
}
function setName(p, v) {
  const val = (v || '').trim() || ('Player ' + (p + 1));
  document.querySelector(`.pname[data-p="${p}"]`).value = val;
  game.players[p].name = val;
}

// ---- header controls ----
document.querySelectorAll('.pname').forEach(inp => inp.addEventListener('input', () => { game.players[+inp.dataset.p].name = inp.value; updateStatus(); }));

document.getElementById('soundBtn').addEventListener('click', function () {
  soundOn = !soundOn; SoundEngine.setEnabled(soundOn); this.textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) { SoundEngine.warm(); SoundEngine.play('nice'); }
  Speech.onTurn(nameOf(turnState().activePlayer), soundOn);
});
function togglePep(on = !pepOn) {
  pepOn = on; Speech.setEnabled(pepOn);
  const b = document.getElementById('pepBtn');
  b.textContent = pepOn ? '💬' : '🔕'; b.classList.toggle('off', !pepOn);
  b.title = pepOn ? 'Amber pep talks: on' : 'Amber pep talks: off';
  Speech.onTurn(nameOf(turnState().activePlayer), soundOn);
}
document.getElementById('pepBtn').addEventListener('click', () => togglePep());
document.getElementById('setBtn').addEventListener('click', openSettings);
document.getElementById('newBtn').addEventListener('click', () => {
  if (game.entries.length > 0 && !confirm('Start a new game? Current scores clear.')) return;
  showSetup();
});
document.getElementById('dataBtn').addEventListener('click', () => {
  SoundEngine.warm();
  const rec = {
    startedAt: game.entries[0]?.recordedAt?.slice(0, 10) || now().slice(0, 10),
    firstPlayer: nameOf(game.startingSeat),
    status: game.status,
    players: [0, 1].map(p => ({ seat: p, name: nameOf(p), totals: computeTotals(valuesP(p)) })),
    entries: [...game.entries].sort((a, b) => a.orderIndex - b.orderIndex)
      .map(e => ({ gameId: '(unsaved)', playerId: e.playerId, category: e.category, value: e.value, orderIndex: e.orderIndex, recordedAt: e.recordedAt })),
  };
  entry.innerHTML = `<div class="grab"></div><div class="ehead"><div><div class="etitle">Captured game data</div><div class="ewho" style="color:var(--ink-soft)">Flat one-row-per-entry log</div></div></div>
    <p class="data-note">Each entry stores its <b>value</b>, the <b>order</b> it was recorded, and a timestamp — the canonical shape that drives stats and later mining.</p>
    <div class="data-json">${JSON.stringify(rec, null, 2).replace(/</g, '&lt;')}</div>`;
  scrim.classList.add('open');
});

// ---- AI commentary (items G/H): live game context + escalation for Claude ----
let maxSavagery = 5;   // 1..5 cap
let profanityOn = false;
try { maxSavagery = Math.max(1, Math.min(5, parseInt(localStorage.getItem('yz_savagery') || '5', 10) || 5)); } catch { /* ignore */ }
try { profanityOn = localStorage.getItem('yz_profanity') === '1'; } catch { /* ignore */ }

function aiContext() {
  const seat = [0, 1].find(p => /^amber$/i.test(nameOf(p).trim()));
  const me = seat == null ? 1 : seat;          // default to seat 1 if no "Amber"
  const them = me === 0 ? 1 : 0;
  const amber = computeTotals(valuesP(me)).grand;
  const dan = computeTotals(valuesP(them)).grand;
  const mine = game.entries.filter(e => e.playerId === me).sort((a, b) => b.orderIndex - a.orderIndex);
  const lastE = mine[0];
  let last = null, justScratched = false, justYahtzee = false, justBonus = false;
  if (lastE) {
    last = { label: META[lastE.category]?.name || lastE.category, value: lastE.category === 'yahtzeeBonus' ? 100 : lastE.value };
    justScratched = lastE.value === 0 && lastE.category !== 'yahtzeeBonus';
    justYahtzee = lastE.category === 'yahtzee' && lastE.value === 50;
    justBonus = lastE.category === 'yahtzeeBonus' && lastE.value > 0;
  }
  // progress resets each game (entries cleared on new game); drives the savagery ladder.
  const progress = (filledBaseCount(valuesP(0)) + filledBaseCount(valuesP(1))) / 26;
  return {
    amber, dan, lead: amber - dan, boxesLeft: 13 - filledBaseCount(valuesP(me)),
    last, justScratched, justYahtzee, justBonus,
    level: savageryLevel(progress, maxSavagery), profanity: profanityOn,
  };
}
AIPep.setContextProvider(aiContext);
AIPep.setSynth({ ready: () => Voice.ready(), make: (t) => Voice.make(t) });
Speech.setAI({ ready: () => AIPep.ready(), prefetch: () => AIPep.prefetch(), generate: () => AIPep.generateNow() });
Speech.setVoicePlayer((blob) => Voice.play(blob));
Voice.load();
try { AIPep.setEnabled(localStorage.getItem('yz_ai_pep') === '1'); } catch { /* ignore */ }

function setAi(on) { AIPep.setEnabled(on); try { localStorage.setItem('yz_ai_pep', on ? '1' : '0'); } catch { /* ignore */ } }

function setMaxSavagery(n) { maxSavagery = Math.max(1, Math.min(5, n)); try { localStorage.setItem('yz_savagery', String(maxSavagery)); } catch { /* ignore */ } }
function setProfanity(on) { profanityOn = on; try { localStorage.setItem('yz_profanity', on ? '1' : '0'); } catch { /* ignore */ } }

function openSettings() {
  SoundEngine.warm(); Speech.warm();
  const masked = AIPep.maskedKey();
  const aiOn = AIPep.isEnabled();
  const v = Voice.get();
  const opt = (sel, val, label) => `<option value="${val}"${sel === val ? ' selected' : ''}>${label}</option>`;
  entry.innerHTML = `<div class="grab"></div>
    <div class="ehead"><div><div class="etitle">Settings</div><div class="ewho" style="color:var(--ink-soft)">Commentary &amp; voice</div></div></div>

    <div class="setrow"><span>Amber pep talks</span><button class="toggle ${pepOn ? 'on' : ''}" id="setPep">${pepOn ? 'On' : 'Off'}</button></div>
    <div class="setrow"><span>AI commentary (Claude)</span><button class="toggle ${aiOn ? 'on' : ''}" id="setAi">${aiOn ? 'On' : 'Off'}</button></div>
    <p class="eodds" style="margin:10px 0 6px;">Anthropic API key — generates escalating, situational lines live. Stays on this device; sent only to api.anthropic.com.</p>
    <input class="keyinput" id="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="${masked || 'sk-ant-…'}">
    <div class="fixedwrap" style="margin-top:8px;">
      <button class="bigbtn score" id="keySave">Save</button>
      <button class="bigbtn add" id="keyTest">Test</button>
      <button class="bigbtn scratch" id="keyClear">Clear</button>
    </div>
    <div class="data-note" id="keyStatus" style="margin-top:10px;">${masked ? 'Key saved: ' + masked : 'No key — using the built-in pep talks.'}</div>

    <div class="setrow" style="margin-top:6px;"><span>Max savagery</span>
      <select class="selinput" id="setSav">${[1, 2, 3, 4, 5].map(n => opt(maxSavagery, n, 'L' + n)).join('')}</select></div>
    <div class="setrow"><span>Allow profanity</span><button class="toggle ${profanityOn ? 'on' : ''}" id="setProf">${profanityOn ? 'On' : 'Off'}</button></div>
    <p class="data-note" style="color:var(--ink-soft);margin-top:6px;">Burns escalate L1→L5 as the board fills (resets each game). Amber is always the hero; only Dan gets roasted. Hard guardrails apply at every level.</p>

    <div class="seclabel" style="margin:16px 2px 6px;">ElevenLabs voice</div>
    <div class="setrow"><span>Use ElevenLabs</span><button class="toggle ${v.on ? 'on' : ''}" id="setEl">${v.on ? 'On' : 'Off'}</button></div>
    <input class="keyinput" id="elVoice" style="margin-top:8px;" autocomplete="off" spellcheck="false" placeholder="Voice ID" value="${v.voiceId}">
    <div class="setrow" style="margin-top:8px;"><span>Model</span>
      <select class="selinput" id="elModel">${opt(v.model, 'eleven_v3', 'v3 (expressive)') + opt(v.model, 'eleven_multilingual_v2', 'multilingual v2')}</select></div>
    <div class="setrow"><span>Stability</span>
      <select class="selinput" id="elStab">${opt(v.stability, 'creative', 'Creative') + opt(v.stability, 'natural', 'Natural') + opt(v.stability, 'robust', 'Robust')}</select></div>
    <div class="setrow"><span>Style (0–1)</span>
      <input class="selinput" id="elStyle" type="number" min="0" max="1" step="0.1" value="${v.style}"></div>
    <div class="fixedwrap" style="margin-top:10px;">
      <button class="bigbtn add" id="elTest">Test voice</button>
    </div>
    <div class="data-note" id="elStatus" style="margin-top:10px;">${v.voiceId ? 'Voice ID set.' : 'No voice ID yet.'}</div>
    <p class="data-note" style="color:var(--ink-soft);">The ElevenLabs key is server-side: set <b>ELEVENLABS_API_KEY</b> in <b>.env</b> (not stored in the browser). Model <b>eleven_v3</b> performs the bracketed tags; with no key/offline it falls back to the device voice automatically.</p>`;

  const status = document.getElementById('keyStatus');
  const elStatus = document.getElementById('elStatus');
  document.getElementById('setPep').onclick = () => { togglePep(); openSettings(); };
  document.getElementById('setAi').onclick = () => {
    if (!AIPep.hasKey()) { status.textContent = 'Add an API key first.'; return; }
    setAi(!AIPep.isEnabled()); openSettings();
  };
  document.getElementById('keySave').onclick = () => {
    const val = document.getElementById('keyInput').value.trim();
    if (!val) { status.textContent = 'Paste a key, then Save.'; return; }
    AIPep.setKey(val); status.textContent = 'Key saved: ' + AIPep.maskedKey();
    document.getElementById('keyInput').value = '';
  };
  document.getElementById('keyClear').onclick = () => { AIPep.setKey(''); setAi(false); openSettings(); };
  document.getElementById('keyTest').onclick = async () => {
    const typed = document.getElementById('keyInput').value.trim();
    if (!typed && !AIPep.hasKey()) { status.textContent = 'Enter a key to test.'; return; }
    status.textContent = 'Testing…';
    const r = await AIPep.test(typed || undefined);
    status.textContent = r.ok ? '✓ ' + r.text : '✗ ' + r.error;
    if (r.ok && typed) { AIPep.setKey(typed); document.getElementById('keyInput').value = ''; }
  };

  document.getElementById('setSav').onchange = (e) => setMaxSavagery(parseInt(e.target.value, 10));
  document.getElementById('setProf').onclick = () => { setProfanity(!profanityOn); openSettings(); };

  document.getElementById('setEl').onclick = () => { Voice.setEnabled(!Voice.isEnabled()); openSettings(); };
  document.getElementById('elVoice').onchange = (e) => Voice.set({ voiceId: e.target.value.trim() });
  document.getElementById('elModel').onchange = (e) => Voice.set({ model: e.target.value });
  document.getElementById('elStab').onchange = (e) => Voice.set({ stability: e.target.value });
  document.getElementById('elStyle').onchange = (e) => Voice.set({ style: parseFloat(e.target.value) || 0 });
  document.getElementById('elTest').onclick = async () => {
    Voice.set({ voiceId: document.getElementById('elVoice').value.trim() });
    if (!Voice.get().voiceId) { elStatus.textContent = 'Enter a Voice ID first.'; return; }
    elStatus.textContent = 'Testing voice…';
    const r = await Voice.test();
    elStatus.textContent = r.ok ? '✓ Played a sample.' : '✗ ' + r.error;
  };

  scrim.classList.add('open');
}

// Unlock audio + speech on the first user gesture.
window.addEventListener('pointerdown', () => { SoundEngine.warm(); Speech.warm(); }, { once: true });

// ---- boot ----
refresh();
showSetup();
