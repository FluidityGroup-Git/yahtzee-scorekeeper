// @vitest-environment jsdom
// Boots the real main.js against the real index.html DOM and drives clicks, to catch
// integration/wiring bugs the pure-logic tests can't. Audio/confetti/speech are stubbed.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fakeAudioNode() {
  const param = { value: 0, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } };
  return { type: '', frequency: { ...param }, gain: { ...param }, connect() { return this; }, start() {}, stop() {} };
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
  resume() {} createOscillator() { return fakeAudioNode(); } createGain() { return fakeAudioNode(); }
  createBiquadFilter() { return fakeAudioNode(); } createBufferSource() { return fakeAudioNode(); }
  decodeAudioData() { return Promise.resolve({}); }
}

beforeAll(async () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;

  window.AudioContext = FakeAudioContext;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  globalThis.fetch = () => Promise.reject(new Error('no files in test')); // force synth fallback

  await import('../src/main.js');
});

const $ = (sel) => document.querySelector(sel);
const cell = (p, k) => document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
const startWith = (seat) => $(`.setupcard .first[data-seat="${seat}"]`).click();
function scoreCount(p, k, n) { cell(p, k).click(); document.querySelector(`#entry .countbtn[data-n="${n}"]`).click(); }
function scoreFixed(p, k) { cell(p, k).click(); document.querySelector('#entry .bigbtn.score[data-v]').click(); }
function scratch(p, k) { cell(p, k).click(); document.querySelector('#entry .bigbtn.scratch[data-v="0"]').click(); }

describe('boot + setup', () => {
  it('builds the scorecard and shows the who-goes-first overlay', () => {
    expect(document.querySelectorAll('.cell[data-key]').length).toBe(14 * 2); // 13 base + Yahtzee Bonus, per column
    expect($('#setupScrim').classList.contains('open')).toBe(true);
    expect($('.setupcard .first[data-seat="0"]').textContent).toBe('Dan');
  });
});

describe('scoring + turn highlight', () => {
  it('Dan-first: scoring an upper box updates totals and passes the column highlight', () => {
    startWith(0);
    expect($('#setupScrim').classList.contains('open')).toBe(false);
    expect($('#device').classList.contains('turn-0')).toBe(true);

    scoreCount(0, 'threes', 3);            // three 3s = 9
    expect($('#tot0').textContent).toBe('9');
    expect($('#meta0').textContent).toBe('1 / 13 boxes');
    expect($('#device').classList.contains('turn-1')).toBe(true); // control passed to Amber
  });

  it('a scratch is a real 0 entry that also passes the turn', () => {
    scratch(1, 'sixes');
    expect(cell(1, 'sixes').classList.contains('zero')).toBe(true);
    expect($('#meta1').textContent).toBe('1 / 13 boxes');
    expect($('#device').classList.contains('turn-0')).toBe(true);
  });
});

describe('bonus Yahtzee gating', () => {
  it('locks the +100 until the Yahtzee box is 50, then unlocks it', () => {
    // Yahtzee not yet scored -> locked (no Add button)
    cell(0, 'yahtzeeBonus').click();
    expect(document.querySelector('#entry [data-add]')).toBeNull();
    $('#scrim').classList.remove('open');

    // Score Yahtzee 50 (it's Dan's turn) -> bonus unlocks
    scoreFixed(0, 'yahtzee');
    expect($('#tot0').textContent).toBe(String(9 + 50));
    cell(1, 'yahtzeeBonus').click();        // wrong player still locked
    expect(document.querySelector('#entry [data-add]')).toBeNull();
    $('#scrim').classList.remove('open');
    cell(0, 'yahtzeeBonus').click();
    expect(document.querySelector('#entry [data-add]')).not.toBeNull();
    $('#scrim').classList.remove('open');
  });
});

describe('bonus Yahtzee make-up turn', () => {
  it('+100 keeps control with the roller and shows the make-up banner', () => {
    // After scoring Yahtzee above, turn passed to Amber; bring it back to Dan.
    scratch(1, 'fives');
    // Now Dan's turn. Record a bonus +100.
    cell(0, 'yahtzeeBonus').click();
    document.querySelector('#entry [data-add]').click();
    expect($('#statusLine').classList.contains('makeup')).toBe(true);
    expect($('#device').classList.contains('turn-0')).toBe(true); // Dan keeps control
    // Fill an open box -> make-up satisfied, control passes.
    scoreCount(0, 'fours', 2);
    expect($('#device').classList.contains('turn-1')).toBe(true);
    expect($('#statusLine').classList.contains('makeup')).toBe(false);
  });
});
