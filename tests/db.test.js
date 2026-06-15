// Dexie persistence round-trips. fake-indexeddb provides an in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, createGame, saveActive, flushSaves, finishGame, loadActiveGame, abandonActive, allFinished, exportData, importData } from '../src/db.js';
import { deriveTurnState } from '../src/game/rules.js';

let n = 0;
const E = (playerId, category, value, orderIndex) => ({ playerId, category, value, orderIndex, recordedAt: '2026-06-14T00:00:00.000Z' });

beforeEach(async () => { await db.games.clear(); await db.entries.clear(); });

describe('save -> load round-trip', () => {
  it('rebuilds the entries and derives the SAME turn state', async () => {
    const id = await createGame({ startingSeat: 0, players: [{ seat: 0, name: 'Dan' }, { seat: 1, name: 'Amber' }], startedAt: '2026-06-14T10:00:00Z' });
    const game = {
      id, status: 'active', startingSeat: 0, players: [{ seat: 0, name: 'Dan' }, { seat: 1, name: 'Amber' }], startedAt: '2026-06-14T10:00:00Z',
      entries: [E(0, 'aces', 3, 1), E(1, 'aces', 2, 2), E(0, 'yahtzee', 50, 3), E(0, 'yahtzeeBonus', 100, 4)],
    };
    saveActive(game);
    await flushSaves();

    const loaded = await loadActiveGame();
    expect(loaded.id).toBe(id);
    expect(loaded.startingSeat).toBe(0);
    expect(loaded.entries.map(e => [e.category, e.value])).toEqual([['aces', 3], ['aces', 2], ['yahtzee', 50], ['yahtzeeBonus', 100]]);
    // derived turn state matches the in-memory game exactly
    expect(deriveTurnState(loaded.entries, loaded.startingSeat)).toEqual(deriveTurnState(game.entries, game.startingSeat));
  });

  it('full-replaces entries on edit (no stale/duplicate rows)', async () => {
    const id = await createGame({ startingSeat: 0, players: [], startedAt: 'x' });
    const game = { id, status: 'active', startingSeat: 0, players: [], startedAt: 'x', entries: [E(0, 'aces', 3, 1)] };
    saveActive(game); await flushSaves();
    game.entries[0].value = 5;          // edit in place
    saveActive(game); await flushSaves();
    const loaded = await loadActiveGame();
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].value).toBe(5);
  });
});

describe('finishGame', () => {
  it('records winner / result / totals and stops resuming', async () => {
    const id = await createGame({ startingSeat: 1, players: [], startedAt: 'x' });
    const game = { id, status: 'active', startingSeat: 1, players: [], startedAt: 'x', entries: [E(0, 'aces', 3, 1)] };
    await finishGame(game, { result: 'p0', winnerSeat: 0, winnerName: 'Dan', totalsSnapshot: [{ grand: 200 }, { grand: 150 }] });
    expect(await loadActiveGame()).toBeNull();                 // finished -> not resumable
    const row = await db.games.get(id);
    expect(row.status).toBe('finished');
    expect(row.winnerName).toBe('Dan');
    expect(row.result).toBe('p0');
    expect(row.totalsSnapshot[0].grand).toBe(200);
    expect(row.endedAt).toBeTruthy();
    const fin = await allFinished();
    expect(fin).toHaveLength(1);
    expect(fin[0].entries).toHaveLength(1);
  });
});

describe('abandonActive', () => {
  it('starting a new game abandons the prior active one', async () => {
    const first = await createGame({ startingSeat: 0, players: [], startedAt: 'a' });
    await db.entries.bulkPut([{ gameId: first, ...E(0, 'aces', 1, 1) }]);
    await abandonActive();
    const second = await createGame({ startingSeat: 1, players: [], startedAt: 'b' });
    const loaded = await loadActiveGame();
    expect(loaded.id).toBe(second);                            // only the new game resumes
    expect((await db.games.get(first)).status).toBe('abandoned');
    expect(await allFinished()).toHaveLength(0);               // abandoned excluded from stats
  });
});

describe('backup / restore (exportData / importData)', () => {
  async function makeFinished(seed, winnerName) {
    const id = await createGame({ startingSeat: 0, players: [], startedAt: 'x' });
    const game = { id, status: 'active', startingSeat: 0, players: [], startedAt: 'x',
      entries: [E(0, 'aces', seed, 1), E(1, 'twos', seed + 1, 2)] };
    await finishGame(game, { result: 'p0', winnerSeat: 0, winnerName, totalsSnapshot: [{ grand: 100 + seed }, { grand: 90 }] });
    return id;
  }

  it('round-trips finished games + entries through clear + restore, with matching counts', async () => {
    await makeFinished(3, 'Dan');
    await makeFinished(7, 'Amber');
    const exported = await exportData();
    expect(exported.version).toBeTruthy();
    expect(exported.games).toHaveLength(2);
    expect(exported.games[0].entries).toHaveLength(2);     // entries travel with the game

    await db.games.clear(); await db.entries.clear();
    expect(await allFinished()).toHaveLength(0);

    const res = await importData(exported);
    expect(res.games).toBe(2);
    const restored = await allFinished();
    expect(restored).toHaveLength(2);
    expect(restored[0].entries).toHaveLength(2);           // entries came back
    expect(restored.map(r => r.game.winnerName).sort()).toEqual(['Amber', 'Dan']);
  });

  it('re-importing the same backup does NOT duplicate (upsert by id)', async () => {
    await makeFinished(5, 'Dan');
    const exported = await exportData();
    await importData(exported);
    await importData(exported);                            // twice
    const restored = await allFinished();
    expect(restored).toHaveLength(1);                      // still one game
    expect(restored[0].entries).toHaveLength(2);           // entries not duplicated
  });

  it('rejects a malformed object', async () => {
    await expect(importData({ nope: true })).rejects.toThrow();
    await expect(importData(null)).rejects.toThrow();
  });
});

describe('loading an already-complete active game', () => {
  it('is detectable as over so the app finalizes rather than resumes', async () => {
    const BASE = ['aces', 'twos', 'threes', 'fours', 'fives', 'sixes', 'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
    const entries = [];
    let o = 0;
    [0, 1].forEach(p => BASE.forEach(c => entries.push(E(p, c, 2, ++o))));
    const id = await createGame({ startingSeat: 0, players: [], startedAt: 'x' });
    const game = { id, status: 'active', startingSeat: 0, players: [], startedAt: 'x', entries };
    saveActive(game); await flushSaves();
    const loaded = await loadActiveGame();
    const filled = p => loaded.entries.filter(e => e.playerId === p && e.category !== 'yahtzeeBonus').length;
    expect(filled(0)).toBe(13);
    expect(filled(1)).toBe(13);   // both at 13 -> main calls finalizeLoaded() instead of resuming
  });
});
