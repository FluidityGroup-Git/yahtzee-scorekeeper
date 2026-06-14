import { describe, it, expect } from 'vitest';
import {
  valuesFor, upperSubtotal, upperBonus, lowerTotal, computeTotals, filledBaseCount,
} from '../src/game/scoring.js';

// Helper to build an entries log quickly.
let n = 0;
const E = (playerId, category, value) => ({ playerId, category, value, orderIndex: ++n, recordedAt: '2026-06-14T00:00:00.000Z' });

describe('upper section + bonus', () => {
  it('sums the upper categories', () => {
    const v = { aces: 3, twos: 6, threes: 9 };
    expect(upperSubtotal(v)).toBe(18);
  });

  it('no +35 bonus at subtotal 62, but +35 at exactly 63', () => {
    expect(upperBonus(62)).toBe(0);
    expect(upperBonus(63)).toBe(35);
    expect(upperBonus(100)).toBe(35);
  });

  it('upper total folds in the bonus', () => {
    // 63 exactly across the six upper boxes -> +35
    const v = { aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(upperSubtotal(v)).toBe(63);
    const t = computeTotals(v);
    expect(t.bonus).toBe(35);
    expect(t.upperTotal).toBe(98);
  });
});

describe('lower section + grand total', () => {
  it('Yahtzee Bonus contributes to the lower total and grand total', () => {
    const v = { yahtzee: 50, yahtzeeBonus: 200, chance: 17 };
    expect(lowerTotal(v)).toBe(267);
    const t = computeTotals(v);
    expect(t.grand).toBe(267);
  });

  it('grand total = upper total + lower total', () => {
    const v = { aces: 3, sixes: 18, fullHouse: 25, yahtzee: 50 };
    const t = computeTotals(v);
    expect(t.grand).toBe(t.upperTotal + t.lower);
    expect(t.grand).toBe(21 + 75);
  });
});

describe('valuesFor (log -> map)', () => {
  it('takes the latest value for base boxes and accumulates bonus Yahtzees', () => {
    const entries = [
      E(0, 'aces', 3), E(1, 'aces', 2),
      E(0, 'yahtzee', 50),
      E(0, 'yahtzeeBonus', 100), E(0, 'yahtzeeBonus', 100),
    ];
    const v0 = valuesFor(entries, 0);
    expect(v0.aces).toBe(3);
    expect(v0.yahtzee).toBe(50);
    expect(v0.yahtzeeBonus).toBe(200);
    expect(valuesFor(entries, 1).aces).toBe(2);
  });
});

describe('filledBaseCount', () => {
  it('counts scratches (value 0) as filled, excludes yahtzeeBonus', () => {
    const v = { aces: 0, twos: 6, yahtzee: 50, yahtzeeBonus: 100 };
    expect(filledBaseCount(v)).toBe(3);
  });
});
