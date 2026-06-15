import './styles.css';
import { UPPER, LOWER, META, BASE_KEYS, tierFor } from './game/categories.js';
import { valuesFor, computeTotals, filledBaseCount } from './game/scoring.js';
import { deriveTurnState, canClaimBonus, isGameOver, decideWinner } from './game/rules.js';
import { SoundEngine } from './sound.js';
import { fireCelebration, celebrationToast, showToast } from './ui/celebrations.js';
import { Speech } from './ui/speech.js';
import { AIPep, savageryLevel } from './ui/aiPep.js';
import { Voice } from './ui/voice.js';
import { Commentary } from './ui/commentary.js';
import { buildContext, rivalryDigest } from './game/commentaryContext.js';
import { CustomTriggers } from './ui/customTriggers.js';
import { createGame, saveActive, finishGame, loadActiveGame, abandonActive, allFinished } from './db.js';
import { computeStats } from './game/stats.js';
import { openStats, closeStats } from './ui/stats.js';
import { Mascots } from './ui/mascots.js';

const persist = typeof indexedDB !== 'undefined';   // skip DB where unavailable (e.g. jsdom tests)

// ---- dice glyph ----
const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieHTML(face) { let s = ''; for (let i = 0; i < 9; i++) s += FACES[face].includes(i) ? '<b></b>' : '<span></span>'; return `<span class="die">${s}</span>`; }

// ---- state: the entries log is canonical; turn state is derived by replaying it ----
const game = {
  id: undefined,      // Dexie games row id (set on createGame / resume)
  players: [{ name: 'Dan' }, { name: 'Amber' }],
  startingSeat: 0,
  startedAt: undefined,
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
  const hint = (c.hint || '').replace(/"/g, '');   // odds/help move to a tooltip to declutter the row
  return `<div class="cat" title="${hint}">${die}<span class="catname">${c.name}</span></div>`;
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
let lastTurnAnnounced = [false, false];   // "last turn" announced once per player per game
let rivalry = null;        // digest of FINISHED games before the current one (refreshed per game)

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
    cell.classList.remove('empty', 'zero', 'filled', 'lastbox', 'open-active', 'open-idle');
    if (d) { cell.innerHTML = d.value + `<span class="ord">${d.order}</span>`; cell.classList.add('filled'); if (d.value === 0) cell.classList.add('zero'); }
    // open cells: only the player-to-move's empties glow; the idle player's recede.
    else { cell.innerHTML = ''; cell.classList.add('empty', (p === active && game.status === 'active') ? 'open-active' : 'open-idle'); }
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
  const leadBefore = computeTotals(valuesP(0)).grand - computeTotals(valuesP(1)).grand;
  const beforeBonus = computeTotals(valuesP(p)).bonus;
  const prevActive = turnState().activePlayer;
  const existing = k !== 'yahtzeeBonus' && game.entries.find(e => e.playerId === p && e.category === k);
  // A NEW score (fires commentary): a fresh base fill/scratch, or a bonus +100. Edits don't fire.
  const isNewScore = (k === 'yahtzeeBonus' && value > 0) || (k !== 'yahtzeeBonus' && !existing);
  if (k === 'yahtzeeBonus') {
    if (value > 0) game.entries.push({ playerId: p, category: k, value: 100, orderIndex: ++game.orderCounter, recordedAt: now() });
    else game.entries = game.entries.filter(e => !(e.playerId === p && e.category === 'yahtzeeBonus')); // reset
  } else if (existing) { existing.value = value; existing.recordedAt = now(); }  // edit in place — keeps orderIndex
  else game.entries.push({ playerId: p, category: k, value, orderIndex: ++game.orderCounter, recordedAt: now() });

  const crossedBonus = beforeBonus === 0 && computeTotals(valuesP(p)).bonus === 35;
  const isBonusTick = (k === 'yahtzeeBonus' && value > 0);
  refresh();
  celebrate(p, k, value, crossedBonus, isBonusTick);
  const newActive = turnState().activePlayer;
  const over = isGameOver(game.entries);
  if (!over && !isBonusTick && newActive !== prevActive) SoundEngine.play('turnpass');
  if (persist) saveActive(game);   // debounced autosave
  // Commentary: the SFX above lands immediately and covers generation latency; the voice follows.
  if (over && game.status !== 'finished') onGameOver();
  else if (isNewScore) { fireCommentary(p, k, value, leadBefore); fireMascots(p, k, value, leadBefore, crossedBonus); }

  // Announce a player's last turn (one base box left) once per player, during an active game.
  if (!over && game.status === 'active' && isNewScore) {
    [0, 1].forEach(i => {
      if (filledBaseCount(valuesP(i)) === 12 && !lastTurnAnnounced[i]) {
        lastTurnAnnounced[i] = true;
        showToast('⏳', 'Last turn — ' + nameOf(i), 'one box to go');
        if (soundOn) SoundEngine.play('nice');
        Mascots.react('lastTurn', { seat: i, level: maxSavagery });
      }
    });
  }
}

function clearScore(p, k) {
  if (k === 'yahtzeeBonus') game.entries = game.entries.filter(e => !(e.playerId === p && e.category === 'yahtzeeBonus'));
  else game.entries = game.entries.filter(e => !(e.playerId === p && e.category === k));
  refresh();
  if (persist) saveActive(game);
}

const SLOT = { mega: 'bonus', legendary: 'yahtzee', epic: 'epic', great: 'great', nice: 'nice', bust: 'bust' };
function celebrate(p, k, value, crossedBonus, isBonusTick) {
  if (k === 'yahtzeeBonus' && !isBonusTick) return; // resetting the bonus box isn't a celebration
  const tier = tierFor({ category: k, value, crossedBonus, isBonusTick });
  const cell = document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
  if (cell) { cell.classList.remove('pop', 'bust'); void cell.offsetWidth; cell.classList.add(tier === 'bust' ? 'bust' : 'pop'); }
  SoundEngine.play(SLOT[tier] || 'tick');
  fireCelebration(tier);
  const ptsText = k === 'yahtzeeBonus' ? '+100' : (value === 0 ? '+0' : '+' + value);
  if (crossedBonus && tier === 'great') celebrationToast('great', '+' + value, 'UPPER BONUS! +35');
  else celebrationToast(tier, ptsText);
}

function onGameOver() {
  game.status = 'finished';
  refresh();
  const w = decideWinner(game.entries);
  if (persist) {
    const winnerSeat = w.result === 'tie' ? null : (w.result === 'p0' ? 0 : 1);
    finishGame(game, { result: w.result, winnerSeat, winnerName: winnerSeat == null ? null : nameOf(winnerSeat), totalsSnapshot: w.totals }).catch(() => {});
  }
  let msg;
  if (w.result === 'tie') msg = `Tie at ${w.totals[0].grand}`;
  else { const wp = w.result === 'p0' ? 0 : 1; msg = `${nameOf(wp)} ${w.totals[wp].grand}–${w.totals[1 - wp].grand}`; }
  showToast('🏆', 'GAME OVER', msg);
  fireCelebration('legendary');
  SoundEngine.play('yahtzee');
  // Mascots: winner centre-stage with the loser slumped in the corner (both shrug on a tie). ONE call.
  if (w.result === 'tie') Mascots.react('tie', { seat: 0, level: maxSavagery });
  else { const wp = w.result === 'p0' ? 0 : 1; Mascots.react('winGame', { seat: wp, level: maxSavagery }); }
  // Closing commentary: winner hype + loser roast (or roast both on a tie).
  const level = savageryLevel(1, maxSavagery);
  let goCtx;
  if (w.result === 'tie') {
    goCtx = { gameOver: true, tie: true, winScore: w.totals[0].grand, loseScore: w.totals[1].grand, level, profanity: profanityOn, rivalry,
      scorerSeat: 0, scorer: nameOf(0), opponent: nameOf(1), scorerTotal: w.totals[0].grand, opponentTotal: w.totals[1].grand, leader: null, margin: 0 };
  } else {
    const wp = w.result === 'p0' ? 0 : 1;
    goCtx = { gameOver: true, winner: nameOf(wp), loser: nameOf(1 - wp), winScore: w.totals[wp].grand, loseScore: w.totals[1 - wp].grand,
      level, profanity: profanityOn, rivalry, scorerSeat: wp, scorer: nameOf(wp), opponent: nameOf(1 - wp),
      scorerTotal: w.totals[wp].grand, opponentTotal: w.totals[1 - wp].grand, leader: nameOf(wp), margin: w.totals[wp].grand - w.totals[1 - wp].grand };
  }
  Commentary.react(goCtx);
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
async function startGame(seat) {
  const s0 = setupCard.querySelector('.setup0'), s1 = setupCard.querySelector('.setup1');
  setName(0, s0.value); setName(1, s1.value);
  game.startingSeat = seat; game.entries = []; game.orderCounter = 0; game.status = 'active';
  game.startedAt = new Date().toISOString();
  prevLeadSeat = null;
  lastTurnAnnounced = [false, false];
  Commentary.cancel();
  Mascots.reset();
  if (persist) {
    try { await abandonActive(); game.id = await createGame({ startingSeat: seat, players: [{ seat: 0, name: nameOf(0) }, { seat: 1, name: nameOf(1) }], startedAt: game.startedAt }); }
    catch { game.id = undefined; }
  }
  setupScrim.classList.remove('open');
  refresh();
  refreshRivalry();   // rivalry of finished games before this one
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
  else Commentary.cancel();
});
function togglePep(on = !pepOn) {
  pepOn = on; Speech.setEnabled(pepOn);
  const b = document.getElementById('pepBtn');
  b.textContent = pepOn ? '💬' : '🔕'; b.classList.toggle('off', !pepOn);
  b.title = pepOn ? 'Commentary voice: on' : 'Commentary voice: off';
  if (!pepOn) Commentary.cancel();
}
document.getElementById('pepBtn').addEventListener('click', () => togglePep());
document.getElementById('setBtn').addEventListener('click', openSettings);
document.getElementById('statsBtn').addEventListener('click', () => { openStats().catch(() => {}); });
document.getElementById('statsBack').addEventListener('click', closeStats);
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
      .map(e => ({ gameId: game.id ?? '(unsaved)', playerId: e.playerId, category: e.category, value: e.value, orderIndex: e.orderIndex, recordedAt: e.recordedAt })),
  };
  entry.innerHTML = `<div class="grab"></div><div class="ehead"><div><div class="etitle">Captured game data</div><div class="ewho" style="color:var(--ink-soft)">Flat one-row-per-entry log</div></div></div>
    <p class="data-note">Each entry stores its <b>value</b>, the <b>order</b> it was recorded, and a timestamp — the canonical shape that drives stats and later mining.</p>
    <div class="data-json">${JSON.stringify(rec, null, 2).replace(/</g, '&lt;')}</div>`;
  scrim.classList.add('open');
});

// ---- live commentary (reacts to every score, roasts both players) ----
let maxSavagery = 5;   // 1..5 cap
let profanityOn = false;
try { maxSavagery = Math.max(1, Math.min(5, parseInt(localStorage.getItem('yz_savagery') || '5', 10) || 5)); } catch { /* ignore */ }
try { profanityOn = localStorage.getItem('yz_profanity') === '1'; } catch { /* ignore */ }
Voice.load();
CustomTriggers.load();
try { AIPep.setEnabled(localStorage.getItem('yz_ai_pep') === '1'); } catch { /* ignore */ }

const captionEl = document.getElementById('caption');
let captionTimer = null;
function showCaption(text, seat) {
  if (!captionEl) return;
  captionEl.textContent = text;
  captionEl.className = 'caption show' + (seat === 0 || seat === 1 ? ' p' + seat : '');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => captionEl.classList.remove('show'), 7000);
}

Commentary.configure({
  canSpeak: () => soundOn && pepOn,                   // voice gate (custom lines work without a key)
  ready: () => soundOn && pepOn && AIPep.ready(),     // AI gate: also needs a Claude key
  customLine: (ctx) => CustomTriggers.lineFor(ctx),   // user-defined lines take priority
  generate: (ctx, opts) => AIPep.generateLine(ctx, opts),
  voiceReady: () => Voice.ready(),
  voiceUsesTags: () => Voice.usesTags(),
  voiceFast: () => Voice.isFast(),
  synth: (t, opts) => Voice.make(t, opts),
  playAudio: (b, opts) => Voice.play(b, opts),
  stopVoice: () => { Voice.stop(); Speech.stop(); },
  speak: (t, opts) => Speech.say(t, opts),
  caption: (t, seat) => showCaption(t, seat),
  onLineEnd: () => Mascots.dismiss(),                 // centre-stage pop dismisses when the voice ends
});

// Mascots: a single centre stage. Mount once on boot.
Mascots.mount(document.getElementById('mascot-stage'));

// Derive the mascot moment from the same score values commentary uses. Priority when several could
// fire on one score: bonusYahtzee > yahtzee > scratch > takeLead > upperBonus > goodScore. ONE call —
// the stage renders the opponent cameo internally.
function fireMascots(p, k, value, leadBefore, crossedBonus) {
  const level = maxSavagery;
  const leadAfter = computeTotals(valuesP(0)).grand - computeTotals(valuesP(1)).grand;
  const flipped = Math.sign(leadBefore) !== 0 && Math.sign(leadAfter) !== 0 && Math.sign(leadAfter) !== Math.sign(leadBefore);
  let ev;
  if (k === 'yahtzeeBonus' && value > 0) ev = 'bonusYahtzee';
  else if (k === 'yahtzee' && value === 50) ev = 'yahtzee';
  else if (value === 0) ev = 'scratch';
  else if (flipped) ev = 'takeLead';          // a score only ever lifts the scorer, so they're the new leader
  else if (crossedBonus) ev = 'upperBonus';
  else ev = 'goodScore';
  Mascots.react(ev, { seat: p, level });
}

// Rivalry digest of FINISHED games — reflects the head-to-head *before* the current game.
async function refreshRivalry() {
  if (!persist) { rivalry = null; return; }
  try { rivalry = rivalryDigest(computeStats(await allFinished()), nameOf(0), nameOf(1)); }
  catch { rivalry = null; }
}

// Fire a commentary line for a new score by either player.
function fireCommentary(scorerSeat, category, value, leadBefore) {
  const progress = (filledBaseCount(valuesP(0)) + filledBaseCount(valuesP(1))) / 26;
  const ctx = buildContext({
    entries: game.entries, scorerSeat, names: [nameOf(0), nameOf(1)],
    lastCategory: category, lastValue: category === 'yahtzeeBonus' ? 100 : value,
    leadBefore, level: savageryLevel(progress, maxSavagery), profanity: profanityOn, rivalry,
  });
  Commentary.react(ctx);
}

function setAi(on) { AIPep.setEnabled(on); try { localStorage.setItem('yz_ai_pep', on ? '1' : '0'); } catch { /* ignore */ } }

function setMaxSavagery(n) { maxSavagery = Math.max(1, Math.min(5, n)); try { localStorage.setItem('yz_savagery', String(maxSavagery)); } catch { /* ignore */ } }
function setProfanity(on) { profanityOn = on; try { localStorage.setItem('yz_profanity', on ? '1' : '0'); } catch { /* ignore */ } }

// ---- custom-trigger settings (author lines in-app) ----
let customDraft = null;   // the rule being added/edited, or null
const esc = (s) => String(s).replace(/</g, '&lt;');
function triggerSummary(r) {
  const w = r.when || {};
  let s = w.type;
  if (w.type === 'value') s = `value = ${w.value}`;
  else if (w.type === 'category') s = META[w.category]?.name || w.category;
  else if (w.type === 'categoryValue') s = `${META[w.category]?.name || w.category} = ${w.value}`;
  else if (w.type === 'scratch') s = 'any scratch';
  else if (w.type === 'event') s = `event: ${w.event}`;
  if (w.player && w.player !== 'any') s += ` · ${w.player}`;
  return s;
}
function captureDraft() {
  if (!customDraft) return;
  const w = customDraft.when;
  const playerEl = document.getElementById('ctPlayer'); if (playerEl) w.player = playerEl.value;
  const valEl = document.getElementById('ctValue'); if (valEl) w.value = valEl.value === '' ? undefined : parseInt(valEl.value, 10);
  const catEl = document.getElementById('ctCat'); if (catEl) w.category = catEl.value;
  const evEl = document.getElementById('ctEvent'); if (evEl) w.event = evEl.value;
  const linesEl = document.getElementById('ctLines'); if (linesEl) customDraft.lines = linesEl.value.split('\n').map(s => s.trim()).filter(Boolean);
}
function customListHTML() {
  const rows = CustomTriggers.all().map(r => `<div class="ctrow" data-id="${r.id}">
      <button class="toggle mini ${r.enabled === false ? '' : 'on'}" data-act="toggle">${r.enabled === false ? 'Off' : 'On'}</button>
      <div class="ctinfo" data-act="edit"><div class="ctcond">${esc(triggerSummary(r))}</div>
        <div class="ctline">“${esc((r.lines && r.lines[0]) || '').slice(0, 48)}”${r.lines && r.lines.length > 1 ? ' +' + (r.lines.length - 1) : ''}</div></div>
      <button class="ctdel" data-act="del" title="Delete">✕</button></div>`).join('');
  return (rows || '<p class="data-note" style="color:var(--ink-soft);">No custom lines yet — they take priority over the AI.</p>')
    + '<button class="bigbtn add" id="ctAdd" style="width:100%;margin-top:8px;">+ Add custom line</button>';
}
function customFormHTML(d) {
  const t = d.when.type;
  const opt = (sel, val, label) => `<option value="${val}"${sel === val ? ' selected' : ''}>${label}</option>`;
  const catOpts = [...UPPER, ...LOWER].map(c => opt(d.when.category, c.key, c.name)).join('');
  let fields;
  if (t === 'value') fields = `<input class="selinput" id="ctValue" type="number" placeholder="value" value="${d.when.value ?? ''}" style="max-width:100px;">`;
  else if (t === 'category') fields = `<select class="selinput" id="ctCat">${catOpts}</select>`;
  else if (t === 'categoryValue') fields = `<select class="selinput" id="ctCat">${catOpts}</select><input class="selinput" id="ctValue" type="number" placeholder="value" value="${d.when.value ?? ''}" style="max-width:80px;">`;
  else if (t === 'event') fields = `<select class="selinput" id="ctEvent">${opt(d.when.event, 'yahtzee', 'Yahtzee') + opt(d.when.event, 'bonusYahtzee', 'Bonus Yahtzee') + opt(d.when.event, 'gameOver', 'Game over')}</select>`;
  else fields = '<span class="data-note" style="color:var(--ink-soft);">fires on any scratch</span>';
  const playerOpts = opt(d.when.player || 'any', 'any', 'Any player') + opt(d.when.player, nameOf(0).toLowerCase(), nameOf(0)) + opt(d.when.player, nameOf(1).toLowerCase(), nameOf(1));
  return `<div class="ctform">
    <div class="setrow"><span>When</span><select class="selinput" id="ctType">${opt(t, 'value', 'value =') + opt(t, 'category', 'category') + opt(t, 'categoryValue', 'category + value') + opt(t, 'scratch', 'any scratch') + opt(t, 'event', 'event')}</select></div>
    <div class="setrow"><span>Match</span><span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">${fields}</span></div>
    <div class="setrow"><span>Player</span><select class="selinput" id="ctPlayer">${playerOpts}</select></div>
    <textarea class="keyinput" id="ctLines" rows="3" style="margin-top:8px;resize:vertical;" placeholder="One line per row. Tokens: {scorer} {opponent} {value} {category} {scorerTotal} {opponentTotal} {leader} {margin}">${esc((d.lines || []).join('\n'))}</textarea>
    <div class="fixedwrap" style="margin-top:8px;"><button class="bigbtn score" id="ctSave">Save line</button><button class="bigbtn scratch" id="ctCancel">Cancel</button></div>
    <div class="data-note" id="ctErr" style="color:var(--p2);"></div></div>`;
}
function wireCustomSection() {
  if (customDraft) {
    document.getElementById('ctType').onchange = (e) => { captureDraft(); customDraft.when = { ...customDraft.when, type: e.target.value }; openSettings(); };
    document.getElementById('ctCancel').onclick = () => { customDraft = null; openSettings(); };
    document.getElementById('ctSave').onclick = () => {
      captureDraft();
      const w = customDraft.when, t = w.type, err = document.getElementById('ctErr');
      if ((t === 'value' || t === 'categoryValue') && (w.value == null || Number.isNaN(w.value))) { err.textContent = 'Enter a value.'; return; }
      if ((t === 'category' || t === 'categoryValue') && !w.category) { err.textContent = 'Pick a category.'; return; }
      if (t === 'event' && !w.event) { err.textContent = 'Pick an event.'; return; }
      if (!customDraft.lines || !customDraft.lines.length) { err.textContent = 'Add at least one line.'; return; }
      const payload = { when: w, lines: customDraft.lines, enabled: customDraft.enabled !== false };
      if (customDraft.id) CustomTriggers.update(customDraft.id, payload); else CustomTriggers.add(payload);
      customDraft = null; openSettings();
    };
  } else {
    const addBtn = document.getElementById('ctAdd');
    if (addBtn) addBtn.onclick = () => { customDraft = { when: { type: 'value', player: 'any' }, lines: [''], enabled: true }; openSettings(); };
    entry.querySelectorAll('.ctrow').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-act="toggle"]').onclick = () => { const r = CustomTriggers.all().find(x => x.id === id); CustomTriggers.update(id, { enabled: r.enabled === false }); openSettings(); };
      row.querySelector('[data-act="del"]').onclick = () => { CustomTriggers.remove(id); openSettings(); };
      row.querySelector('[data-act="edit"]').onclick = () => { const r = CustomTriggers.all().find(x => x.id === id); customDraft = JSON.parse(JSON.stringify(r)); openSettings(); };
    });
  }
}

function openSettings() {
  SoundEngine.warm(); Speech.warm();
  const masked = AIPep.maskedKey();
  const aiOn = AIPep.isEnabled();
  const v = Voice.get();
  const opt = (sel, val, label) => `<option value="${val}"${sel === val ? ' selected' : ''}>${label}</option>`;
  entry.innerHTML = `<div class="grab"></div>
    <div class="ehead"><div><div class="etitle">Settings</div><div class="ewho" style="color:var(--ink-soft)">Commentary &amp; voice</div></div></div>

    <div class="setrow"><span>Commentary voice</span><button class="toggle ${pepOn ? 'on' : ''}" id="setPep">${pepOn ? 'On' : 'Off'}</button></div>
    <div class="setrow"><span>AI commentary (Claude)</span><button class="toggle ${aiOn ? 'on' : ''}" id="setAi">${aiOn ? 'On' : 'Off'}</button></div>
    <p class="eodds" style="margin:10px 0 6px;">Anthropic API key — reacts to every score and roasts both players. Stays on this device; sent only to api.anthropic.com.</p>
    <input class="keyinput" id="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="${masked || 'sk-ant-…'}">
    <div class="fixedwrap" style="margin-top:8px;">
      <button class="bigbtn score" id="keySave">Save</button>
      <button class="bigbtn add" id="keyTest">Test</button>
      <button class="bigbtn scratch" id="keyClear">Clear</button>
    </div>
    <div class="data-note" id="keyStatus" style="margin-top:10px;">${masked ? 'Key saved: ' + masked : 'No key — commentary stays quiet without one.'}</div>

    <div class="setrow" style="margin-top:6px;"><span>Max savagery</span>
      <select class="selinput" id="setSav">${[1, 2, 3, 4, 5].map(n => opt(maxSavagery, n, 'L' + n)).join('')}</select></div>
    <div class="setrow"><span>Allow profanity</span><button class="toggle ${profanityOn ? 'on' : ''}" id="setProf">${profanityOn ? 'On' : 'Off'}</button></div>
    <p class="data-note" style="color:var(--ink-soft);margin-top:6px;">Burns escalate L1→L5 as the board fills (resets each game) and roast BOTH players. Hard guardrails apply at every level.</p>

    <div class="seclabel" style="margin:16px 2px 6px;">ElevenLabs voice</div>
    <div class="setrow"><span>Use ElevenLabs</span><button class="toggle ${v.on ? 'on' : ''}" id="setEl">${v.on ? 'On' : 'Off'}</button></div>
    <input class="keyinput" id="elVoice" style="margin-top:8px;" autocomplete="off" spellcheck="false" placeholder="Voice ID" value="${v.voiceId}">
    <div class="setrow" style="margin-top:8px;"><span>Model</span>
      <select class="selinput" id="elModel">${opt(v.model, 'eleven_v3', 'v3 (expressive)') + opt(v.model, 'eleven_flash_v2_5', 'Flash v2.5 (fast)') + opt(v.model, 'eleven_multilingual_v2', 'multilingual v2')}</select></div>
    <div class="setrow"><span>Stability</span>
      <select class="selinput" id="elStab">${opt(v.stability, 'creative', 'Creative') + opt(v.stability, 'natural', 'Natural') + opt(v.stability, 'robust', 'Robust')}</select></div>
    <div class="setrow"><span>Style (0–1)</span>
      <input class="selinput" id="elStyle" type="number" min="0" max="1" step="0.1" value="${v.style}"></div>
    <div class="fixedwrap" style="margin-top:10px;">
      <button class="bigbtn add" id="elTest">Test voice</button>
    </div>
    <div class="data-note" id="elStatus" style="margin-top:10px;">${v.voiceId ? 'Voice ID set.' : 'No voice ID yet.'}</div>
    <p class="data-note" style="color:var(--ink-soft);">The ElevenLabs key is server-side: set <b>ELEVENLABS_API_KEY</b> in <b>.env</b> (not stored in the browser). <b>v3</b> performs the bracketed tags (most expressive); <b>Flash v2.5</b> is faster but ignores tags. With no key/offline it falls back to the device voice automatically.</p>

    <div class="seclabel" style="margin:16px 2px 6px;">Custom lines</div>
    ${customDraft ? customFormHTML(customDraft) : customListHTML()}`;

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

  wireCustomSection();
  scrim.classList.add('open');
}

// Unlock audio + speech on the first user gesture.
window.addEventListener('pointerdown', () => { SoundEngine.warm(); Speech.warm(); }, { once: true });

// ---- boot: resume an autosaved game, finalize a complete one, or start fresh ----
function hydrateSaved(saved) {
  game.id = saved.id;
  game.entries = saved.entries;
  game.startingSeat = saved.startingSeat;
  game.startedAt = saved.startedAt;
  game.status = 'active';
  game.orderCounter = saved.entries.reduce((m, e) => Math.max(m, e.orderIndex), 0);
  (saved.players || []).forEach(p => { if (p && typeof p.seat === 'number') setName(p.seat, p.name); });
  prevLeadSeat = null; lastTurnAnnounced = [false, false]; Commentary.cancel(); Mascots.reset();
}
async function finalizeLoaded() {
  game.status = 'finished';
  refresh();
  const w = decideWinner(game.entries);
  const winnerSeat = w.result === 'tie' ? null : (w.result === 'p0' ? 0 : 1);
  try { await finishGame(game, { result: w.result, winnerSeat, winnerName: winnerSeat == null ? null : nameOf(winnerSeat), totalsSnapshot: w.totals }); } catch { /* ignore */ }
}
async function boot() {
  if (persist) {
    try {
      const saved = await loadActiveGame();
      if (saved) {
        hydrateSaved(saved);
        if (isGameOver(game.entries)) await finalizeLoaded();   // already complete -> finalize, don't resume
        else refresh();                                          // resume exactly where we left off
        refreshRivalry();
        return;
      }
    } catch { /* fall through to a fresh setup */ }
  }
  refresh();
  showSetup();
  refreshRivalry();
}
boot();
