import './styles.css';
import { UPPER, LOWER, META, BASE_KEYS, tierFor } from './game/categories.js';
import { valuesFor, computeTotals, filledBaseCount } from './game/scoring.js';
import { deriveTurnState, canClaimBonus, isGameOver, decideWinner } from './game/rules.js';
import { SoundEngine } from './sound.js';
import { fireCelebration, celebrationToast, showToast } from './ui/celebrations.js';
import { Speech } from './ui/speech.js';

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
  calcRow('Subtotal', '', 'sub0', 'sub1', 'sub') +
  calcRow('Bonus', '+35 if subtotal ≥ 63', 'bon0', 'bon1', 'bonus') +
  calcRow('Upper total', '', 'up0', 'up1', 'uptot');
document.getElementById('lowerCalc').innerHTML =
  calcRow('Lower total', '', 'low0', 'low1', 'lowtot') +
  calcRow('GRAND TOTAL', '', 'grand0', 'grand1', 'grand');

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
  // totals
  [0, 1].forEach(p => {
    const t = computeTotals(valuesP(p));
    document.getElementById('sub' + p).textContent = t.upper;
    document.getElementById('bon' + p).textContent = t.bonus;
    document.getElementById('up' + p).textContent = t.upperTotal;
    document.getElementById('low' + p).textContent = t.lower;
    document.getElementById('grand' + p).textContent = t.grand;
    document.getElementById('tot' + p).textContent = t.grand;
    document.getElementById('meta' + p).textContent = filledBaseCount(valuesP(p)) + ' / 13 boxes';
  });
  document.querySelectorAll('.row.bonus').forEach((r, i) => r.classList.toggle('hit', computeTotals(valuesP(i)).bonus > 0));
  // active-column highlight (A) — derived, advisory
  document.querySelectorAll('.pcard').forEach(c => c.classList.toggle('active', +c.dataset.p === active && game.status === 'active'));
  device.classList.toggle('turn-0', active === 0 && game.status === 'active');
  device.classList.toggle('turn-1', active === 1 && game.status === 'active');
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
document.getElementById('pepBtn').addEventListener('click', function () {
  pepOn = !pepOn; Speech.setEnabled(pepOn); this.textContent = pepOn ? '💬' : '🔕'; this.classList.toggle('off', !pepOn);
  this.title = pepOn ? 'Amber pep talks: on' : 'Amber pep talks: off';
  Speech.onTurn(nameOf(turnState().activePlayer), soundOn);
});
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

// Unlock audio + speech on the first user gesture.
window.addEventListener('pointerdown', () => { SoundEngine.warm(); Speech.warm(); }, { once: true });

// ---- boot ----
refresh();
showSetup();
