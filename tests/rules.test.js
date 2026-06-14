import { describe, it, expect } from 'vitest';
import { deriveTurnState, canClaimBonus, isGameOver, decideWinner } from '../src/game/rules.js';
import { BASE_KEYS } from '../src/game/categories.js';

// Ordered-log builder.
function log(...steps) {
  return steps.map(([playerId, category, value], i) => ({
    playerId, category, value, orderIndex: i + 1, recordedAt: '2026-06-14T00:00:00.000Z',
  }));
}

describe('turn passing', () => {
  it('a new base-box fill passes control to the other player', () => {
    const entries = log([0, 'aces', 3]);
    expect(deriveTurnState(entries, 0).activePlayer).toBe(1);
  });

  it('alternates as both players fill boxes', () => {
    const entries = log([0, 'aces', 3], [1, 'aces', 2], [0, 'twos', 4]);
    expect(deriveTurnState(entries, 0).activePlayer).toBe(1);
  });

  it('editing an existing box does NOT pass the turn (upsert keeps one row)', () => {
    // After p0 fills aces and p1 fills aces, it's p0's turn.
    const before = log([0, 'aces', 3], [1, 'aces', 2]);
    expect(deriveTurnState(before, 0).activePlayer).toBe(0);
    // p0 edits their aces to a different value — still one row, same orderIndex.
    const afterEdit = log([0, 'aces', 5], [1, 'aces', 2]);
    expect(deriveTurnState(afterEdit, 0).activePlayer).toBe(0);
  });
});

describe('scratch', () => {
  it('a scratch (0) is a real entry that counts as a turn and passes control', () => {
    const entries = log([0, 'sixes', 0]);
    const st = deriveTurnState(entries, 0);
    expect(st.activePlayer).toBe(1);
  });
});

describe('bonus Yahtzee make-up', () => {
  it('a +100 keeps control with the roller and owes one make-up', () => {
    const entries = log([0, 'yahtzee', 50], [1, 'aces', 1], [0, 'yahtzeeBonus', 100]);
    const st = deriveTurnState(entries, 0);
    expect(st.activePlayer).toBe(0);
    expect(st.makeupOwed).toEqual([1, 0]);
  });

  it('the next new fill clears the make-up and passes control', () => {
    const entries = log([0, 'yahtzee', 50], [1, 'aces', 1], [0, 'yahtzeeBonus', 100], [0, 'threes', 9]);
    const st = deriveTurnState(entries, 0);
    expect(st.makeupOwed).toEqual([0, 0]);
    expect(st.activePlayer).toBe(1);
  });

  it('two back-to-back bonus Yahtzees owe two make-ups (control stays until both are filled)', () => {
    const entries = log(
      [0, 'yahtzee', 50], [1, 'aces', 1],
      [0, 'yahtzeeBonus', 100], [0, 'yahtzeeBonus', 100],
    );
    let st = deriveTurnState(entries, 0);
    expect(st.makeupOwed).toEqual([2, 0]);
    expect(st.activePlayer).toBe(0);

    // First make-up box filled — still owes one, keeps control.
    const after1 = [...entries, { playerId: 0, category: 'threes', value: 9, orderIndex: 99, recordedAt: '' }];
    st = deriveTurnState(after1, 0);
    expect(st.makeupOwed).toEqual([1, 0]);
    expect(st.activePlayer).toBe(0);

    // Second make-up box filled — evened up, passes.
    const after2 = [...after1, { playerId: 0, category: 'fours', value: 8, orderIndex: 100, recordedAt: '' }];
    st = deriveTurnState(after2, 0);
    expect(st.makeupOwed).toEqual([0, 0]);
    expect(st.activePlayer).toBe(1);
  });

  it('respects the starting seat', () => {
    expect(deriveTurnState([], 1).activePlayer).toBe(1);
    expect(deriveTurnState(log([1, 'aces', 1]), 1).activePlayer).toBe(0);
  });
});

describe('bonus gating', () => {
  it('only allows a +100 when the Yahtzee box is already 50', () => {
    expect(canClaimBonus({ yahtzee: 50 })).toBe(true);
    expect(canClaimBonus({ yahtzee: 0 })).toBe(false); // scratched
    expect(canClaimBonus({})).toBe(false);             // not yet filled
  });
});

describe('game over & winner', () => {
  // Fill all 13 base boxes for a player with a constant value.
  const fillAll = (p, val, startOrder) => BASE_KEYS.map((category, i) => ({
    playerId: p, category, value: val, orderIndex: startOrder + i, recordedAt: '',
  }));

  it('is not over until both players have all 13 base boxes', () => {
    const partial = fillAll(0, 2, 1);
    expect(isGameOver(partial)).toBe(false);
    const full = [...fillAll(0, 2, 1), ...fillAll(1, 1, 100)];
    expect(isGameOver(full)).toBe(true);
  });

  it('picks the winner by grand total', () => {
    const entries = [...fillAll(0, 3, 1), ...fillAll(1, 1, 100)];
    const w = decideWinner(entries);
    expect(w.result).toBe('p0');
    expect(w.totals[0].grand).toBeGreaterThan(w.totals[1].grand);
  });

  it('reports a tie when totals match', () => {
    const entries = [...fillAll(0, 2, 1), ...fillAll(1, 2, 100)];
    expect(decideWinner(entries).result).toBe('tie');
  });
});
