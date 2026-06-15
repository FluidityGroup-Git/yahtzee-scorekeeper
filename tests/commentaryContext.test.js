// Pure commentary-context builder: comeback detection + the new situational fields.
import { describe, it, expect } from 'vitest';
import { buildContext } from '../src/game/commentaryContext.js';

const NAMES = ['Dan', 'Amber'];
let n = 0;
const E = (playerId, category, value) => ({ playerId, category, value, orderIndex: ++n, recordedAt: '' });

describe('comeback detection', () => {
  it('flags when the trailing player TAKES the lead', () => {
    // After this score: Dan 20, Amber 25 (Amber ahead). Before: Dan was +3.
    const entries = [E(0, 'chance', 20), E(1, 'chance', 25)];
    const c = buildContext({ entries, scorerSeat: 1, names: NAMES, lastCategory: 'chance', lastValue: 25, leadBefore: 3 });
    expect(c.comeback).toMatch(/Amber just TOOK the lead/);
    expect(c.leader).toBe('Amber');
    expect(c.margin).toBe(5);
  });

  it('flags when the scorer claws the gap back while still behind', () => {
    // After: Dan 28, Amber 20 (Dan ahead by 8). Before: Dan was +20. Amber (scorer) closed it.
    const entries = [E(0, 'chance', 28), E(1, 'chance', 20)];
    const c = buildContext({ entries, scorerSeat: 1, names: NAMES, lastCategory: 'chance', lastValue: 20, leadBefore: 20 });
    expect(c.comeback).toMatch(/Amber clawed the gap back to 8/);
  });

  it('no comeback when the leader extends their own lead', () => {
    const entries = [E(0, 'chance', 30), E(1, 'chance', 10)];
    const c = buildContext({ entries, scorerSeat: 0, names: NAMES, lastCategory: 'chance', lastValue: 30, leadBefore: 5 });
    expect(c.comeback).toBeNull();
  });
});

describe('situational fields + jab fodder', () => {
  it('computes bonus distance, boxes left, scratched uppers, and unused Chance', () => {
    // Dan: scratched Aces & Twos, scored 3-6 upper, no Chance -> upper 54, dist 9, 6 base boxes filled.
    const entries = [
      E(0, 'aces', 0), E(0, 'twos', 0), E(0, 'threes', 9), E(0, 'fours', 12), E(0, 'fives', 15), E(0, 'sixes', 18),
    ];
    const c = buildContext({ entries, scorerSeat: 0, names: NAMES, lastCategory: 'sixes', lastValue: 18, leadBefore: null });
    expect(c.scorer).toBe('Dan');
    expect(c.scorerBonusDist).toBe(9);
    expect(c.scorerBonusSecured).toBe(false);
    expect(c.scorerBoxesLeft).toBe(7);
    expect(c.jabs.join(' | ')).toMatch(/Dan scratched Aces & Twos/);
    expect(c.jabs.join(' | ')).toMatch(/Dan still hasn't used Chance/);
    expect(c.justScratched).toBe(false);
  });

  it('detects a 3-scratch streak and clears it after a real score', () => {
    const a = buildContext({ entries: [E(0, 'aces', 0), E(0, 'twos', 0), E(0, 'threes', 0)], scorerSeat: 0, names: NAMES, lastCategory: 'threes', lastValue: 0, leadBefore: null });
    expect(a.scorerScratchStreak).toBe(3);
    expect(a.trends.join(' | ')).toMatch(/Dan has scratched 3 in a row/);

    const b = buildContext({ entries: [E(0, 'fours', 0), E(0, 'fives', 0), E(0, 'sixes', 18)], scorerSeat: 0, names: NAMES, lastCategory: 'sixes', lastValue: 18, leadBefore: null });
    expect(b.scorerScratchStreak).toBe(0);
  });

  it('marks a fresh scratch and a secured bonus', () => {
    const entries = [
      E(1, 'aces', 3), E(1, 'twos', 6), E(1, 'threes', 9), E(1, 'fours', 12), E(1, 'fives', 15), E(1, 'sixes', 18), // upper 63 -> secured
      E(1, 'yahtzee', 0),
    ];
    const c = buildContext({ entries, scorerSeat: 1, names: NAMES, lastCategory: 'yahtzee', lastValue: 0, leadBefore: null });
    expect(c.justScratched).toBe(true);
    expect(c.scorerBonusSecured).toBe(true);
    expect(c.scorerBonusDist).toBe(0);
  });
});
