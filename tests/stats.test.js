// computeStats over a small fixture of finished games.
import { describe, it, expect } from 'vitest';
import { computeStats } from '../src/game/stats.js';

let o = 0;
function entriesFrom(p0, p1) {
  const es = [];
  const add = (pid, obj) => { for (const [category, value] of Object.entries(obj)) {
    if (category === 'yahtzeeBonus') { for (let i = 0; i < Math.round(value / 100); i++) es.push({ playerId: pid, category, value: 100, orderIndex: ++o, recordedAt: '' }); }
    else es.push({ playerId: pid, category, value, orderIndex: ++o, recordedAt: '' });
  } };
  add(0, p0); add(1, p1); return es;
}
const game = (id, startedAt, endedAt, p0, p1) => ({
  game: { id, players: [{ seat: 0, name: 'Dan' }, { seat: 1, name: 'Amber' }], startedAt, endedAt, status: 'finished' },
  entries: entriesFrom(p0, p1),
});

// A: Dan 200 (chance150+yahtzee50, aces scratched) vs Amber 120 (chance120, twos scratched) -> Dan +80, 5min
// B: 100 vs 100 -> tie, 5min
// C: Dan 90 vs Amber 360 (chance160 + 2x bonus) -> Amber +270, 10min
const FIXTURE = [
  game(1, '2026-06-10T10:00:00.000Z', '2026-06-10T10:05:00.000Z', { chance: 150, yahtzee: 50, aces: 0 }, { chance: 120, twos: 0 }),
  game(2, '2026-06-11T10:00:00.000Z', '2026-06-11T10:05:00.000Z', { chance: 100 }, { chance: 100 }),
  game(3, '2026-06-12T10:00:00.000Z', '2026-06-12T10:10:00.000Z', { chance: 90 }, { chance: 160, yahtzeeBonus: 200 }),
];

describe('computeStats', () => {
  const s = computeStats(FIXTURE);

  it('empty state', () => { expect(computeStats([])).toEqual({ totalGames: 0 }); });

  it('head-to-head + ties', () => {
    expect(s.totalGames).toBe(3);
    expect(s.headToHead).toEqual({ winsByName: { Dan: 1, Amber: 1 }, ties: 1 });
    expect(s.winShare.labels).toEqual(['Dan', 'Amber', 'Ties']);
    expect(s.winShare.data).toEqual([1, 1, 1]);
  });

  it('current streak + last winner', () => {
    // newest is C (Amber win); B is a tie, so the streak is just length 1.
    expect(s.streak).toEqual({ name: 'Amber', length: 1 });
    expect(s.lastWinner).toBe('Amber');
  });

  it('avg score + avg by category', () => {
    expect(s.avgScore).toEqual({ Dan: 130, Amber: 193 });        // (200+100+90)/3, (120+100+360)/3
    expect(s.avgByCategory.Dan.chance).toBe(113);                // (150+100+90)/3
    expect(s.avgByCategory.Dan.yahtzee).toBe(50);                // only game A
    expect(s.avgByCategory.Dan.aces).toBe(0);
  });

  it('counters', () => {
    const c = s.counters;
    expect(c.yahtzees).toEqual({ Dan: 1, Amber: 0 });
    expect(c.bonusYahtzees).toEqual({ Dan: 0, Amber: 2 });
    expect(c.bestGame).toEqual({ name: 'Amber', score: 360 });
    expect(c.worstMeltdown).toEqual({ name: 'Dan', score: 90 });
    expect(c.mostScratchedCategory).toEqual({ category: 'aces', name: 'Aces', count: 1 });
    expect(c.biggestBlowout).toEqual({ margin: 270, winner: 'Amber' });
    expect(c.closestGame).toEqual({ margin: 80, winner: 'Dan' });
    expect(c.avgDurationMs).toBe(400000);                        // (300000+300000+600000)/3
  });

  it('totals-over-time + histogram shapes', () => {
    expect(s.totalsOverTime).toHaveLength(3);
    expect(s.totalsOverTime[0]).toMatchObject({ n: 1, datePlayed: '2026-06-10', Dan: 200, Amber: 120 });
    expect(s.finalScoreHistogram.binSize).toBe(50);
    expect(s.finalScoreHistogram.data.reduce((a, b) => a + b, 0)).toBe(6); // 2 players x 3 games
  });
});
