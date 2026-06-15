// Pure custom-trigger logic: matching, most-specific selection, placeholder substitution,
// and repeat-avoiding line pick.
import { describe, it, expect } from 'vitest';
import { selectRule, substitute, pickLine } from '../src/ui/customTriggers.js';

const scoreCtx = (over = {}) => ({
  scorer: 'Amber', opponent: 'Dan', categoryKey: 'chance', category: 'Chance', value: 30,
  justScratched: false, justYahtzee: false, justBonus: false,
  scorerTotal: 140, opponentTotal: 120, leader: 'Amber', margin: 20, ...over,
});

describe('selectRule', () => {
  it('fires a value trigger and returns it', () => {
    const rules = [{ id: 'a', when: { type: 'value', value: 30 }, lines: ['x'], enabled: true }];
    expect(selectRule(rules, scoreCtx())).toBe(rules[0]);
  });

  it('the most-specific rule wins when several match', () => {
    const rules = [
      { id: 'val', when: { type: 'value', value: 30 }, lines: ['v'], enabled: true },
      { id: 'cat', when: { type: 'category', category: 'chance' }, lines: ['c'], enabled: true },
      { id: 'cv', when: { type: 'categoryValue', category: 'chance', value: 30 }, lines: ['cv'], enabled: true },
    ];
    expect(selectRule(rules, scoreCtx()).id).toBe('cv');     // categoryValue is most specific
  });

  it('a player filter scopes the match', () => {
    const rules = [{ id: 'p', when: { type: 'value', value: 30, player: 'amber' }, lines: ['x'], enabled: true }];
    expect(selectRule(rules, scoreCtx({ scorer: 'Amber' }))).toBe(rules[0]);
    expect(selectRule(rules, scoreCtx({ scorer: 'Dan' }))).toBeNull();
  });

  it('returns null when nothing matches or the rule is disabled', () => {
    expect(selectRule([{ id: 'a', when: { type: 'value', value: 17 }, lines: ['x'], enabled: true }], scoreCtx())).toBeNull();
    expect(selectRule([{ id: 'a', when: { type: 'value', value: 30 }, lines: ['x'], enabled: false }], scoreCtx())).toBeNull();
  });

  it('matches scratch and event triggers', () => {
    expect(selectRule([{ id: 's', when: { type: 'scratch' }, lines: ['x'], enabled: true }], scoreCtx({ justScratched: true })).id).toBe('s');
    expect(selectRule([{ id: 'y', when: { type: 'event', event: 'yahtzee' }, lines: ['x'], enabled: true }], scoreCtx({ justYahtzee: true })).id).toBe('y');
    expect(selectRule([{ id: 'g', when: { type: 'event', event: 'gameOver' }, lines: ['x'], enabled: true }], { gameOver: true }).id).toBe('g');
  });
});

describe('substitute', () => {
  it('replaces all placeholders from context', () => {
    const out = substitute('{scorer} hit {value} in {category}; {leader} +{margin} over {opponent} ({scorerTotal}-{opponentTotal})', scoreCtx());
    expect(out).toBe('Amber hit 30 in Chance; Amber +20 over Dan (140-120)');
  });
  it('leaves unknown-but-empty tokens blank and ignores non-tokens', () => {
    expect(substitute('{scorer} did {nonsense} {value}', scoreCtx({ value: 0 }))).toBe('Amber did {nonsense} 0');
  });
});

describe('pickLine', () => {
  it('returns the only line', () => { expect(pickLine(['solo'], undefined)).toBe('solo'); });
  it('avoids an immediate repeat', () => {
    expect(pickLine(['A', 'B'], 'A')).toBe('B');     // deterministic with two lines
    for (let i = 0; i < 60; i++) expect(pickLine(['A', 'B', 'C'], 'B')).not.toBe('B');
  });
});
