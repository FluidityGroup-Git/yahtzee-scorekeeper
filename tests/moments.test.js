// Pure score-moment mapping for the celebration sequencer: the right { event, sfx, celebrate } per
// case, and celebrate set ONLY for the marquee moments (yahtzee / bonusYahtzee / winGame).
import { describe, it, expect } from 'vitest';
import { momentFor, sfxFor, celebrateFor } from '../src/game/moments.js';

describe('momentFor (pure)', () => {
  it('a Yahtzee (50 in the yahtzee box): event+sfx yahtzee, celebrate yahtzee', () => {
    const m = momentFor(0, 'yahtzee', 50, 0, 10, false);
    expect(m).toEqual({ event: 'yahtzee', sfx: 'yahtzee', celebrate: 'yahtzee' });
  });

  it('a bonus Yahtzee (+100) outranks everything and celebrates', () => {
    const m = momentFor(1, 'yahtzeeBonus', 100, 5, -5, false);
    expect(m.event).toBe('bonusYahtzee');
    expect(m.sfx).toBe('bonusYahtzee');
    expect(m.celebrate).toBe('bonusYahtzee');
  });

  it('a scratch (0) is scratch and does NOT celebrate', () => {
    const m = momentFor(0, 'fours', 0, 10, 10, false);
    expect(m.event).toBe('scratch');
    expect(m.sfx).toBe('scratch');
    expect(m.celebrate).toBeNull();
  });

  it('taking the lead (sign flip) is takeLead, no celebration', () => {
    const m = momentFor(0, 'sixes', 18, -5, 13, false);   // was behind, now ahead
    expect(m.event).toBe('takeLead');
    expect(m.sfx).toBe('takeLead');
    expect(m.celebrate).toBeNull();
  });

  it('crossing the upper bonus (no flip) is upperBonus, no celebration', () => {
    const m = momentFor(1, 'sixes', 18, 20, 20, true);    // still leading, just earned +35
    expect(m.event).toBe('upperBonus');
    expect(m.sfx).toBe('upperBonus');
    expect(m.celebrate).toBeNull();
  });

  it('a plain positive score is goodScore (generic blip), no celebration', () => {
    const m = momentFor(0, 'threes', 9, 30, 39, false);   // already ahead, stays ahead
    expect(m.event).toBe('goodScore');
    expect(m.sfx).toBe('goodScore');
    expect(m.celebrate).toBeNull();
  });

  it('priority: a 50-point yahtzee that also flips the lead still reads as yahtzee', () => {
    expect(momentFor(0, 'yahtzee', 50, -5, 45, false).event).toBe('yahtzee');
  });

  it('celebrateFor marks ONLY the marquee moments', () => {
    expect(celebrateFor('yahtzee')).toBe('yahtzee');
    expect(celebrateFor('bonusYahtzee')).toBe('bonusYahtzee');
    expect(celebrateFor('winGame')).toBe('winGame');
    ['scratch', 'takeLead', 'upperBonus', 'goodScore', 'loseGame'].forEach(e =>
      expect(celebrateFor(e)).toBeNull());
  });

  it('sfxFor falls back to goodScore for an unknown event', () => {
    expect(sfxFor('mysteryEvent')).toBe('goodScore');
  });
});
