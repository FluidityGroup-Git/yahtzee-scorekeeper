// Dexie persistence: autosave the active game (debounced full-replace), resume on load, and keep
// finished games for History/Stats. The entries log stays canonical; per game it's ~30 rows, so a
// full delete+bulkPut on each save is simplest and correct (handles edits, scratches, multi-row
// yahtzeeBonus). All functions are async.
import Dexie from 'dexie';

export const db = new Dexie('yahtzeeDB');
db.version(1).stores({
  games: '++id, status, startedAt, endedAt',
  entries: '++id, gameId, [gameId+orderIndex]',
  players: '++id, &name',
});
// Seed the two regulars on first run (setup name defaults / future cross-game identity).
db.on('populate', () => { db.players.bulkAdd([{ name: 'Dan' }, { name: 'Amber' }]); });

function snapshot(game) {
  return {
    id: game.id, status: game.status || 'active', startingSeat: game.startingSeat, players: game.players,
    startedAt: game.startedAt, endedAt: game.endedAt ?? null,
    winnerSeat: game.winnerSeat ?? null, winnerName: game.winnerName ?? null, result: game.result ?? null,
    totalsSnapshot: game.totalsSnapshot ?? null,
    entries: (game.entries || []).map(e => ({ playerId: e.playerId, category: e.category, value: e.value, orderIndex: e.orderIndex, recordedAt: e.recordedAt })),
  };
}

async function persist(g) {
  if (g.id == null) return;
  await db.transaction('rw', db.games, db.entries, async () => {
    await db.games.put({
      id: g.id, status: g.status, startingSeat: g.startingSeat, players: g.players, startedAt: g.startedAt,
      endedAt: g.endedAt, winnerSeat: g.winnerSeat, winnerName: g.winnerName, result: g.result, totalsSnapshot: g.totalsSnapshot,
    });
    await db.entries.where('gameId').equals(g.id).delete();
    if (g.entries.length) await db.entries.bulkPut(g.entries.map(e => ({ gameId: g.id, ...e })));
  });
}

export async function createGame({ startingSeat, players, startedAt }) {
  return db.games.add({ status: 'active', startingSeat, players, startedAt: startedAt || new Date().toISOString(), endedAt: null });
}

// Debounced (~250ms) autosave of the active game + its entries.
let saveTimer = null, savePending = null;
export function saveActive(game) {
  if (game.id == null) return;
  savePending = snapshot(game);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { const g = savePending; savePending = null; saveTimer = null; persist(g); }, 250);
}
// Force any pending debounced save to land now (used before finishing, and by tests).
export async function flushSaves() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (savePending) { const g = savePending; savePending = null; await persist(g); }
}

export async function finishGame(game, { result, winnerSeat, winnerName, totalsSnapshot }) {
  await flushSaves();
  game.status = 'finished';
  game.endedAt = new Date().toISOString();
  game.result = result;
  game.winnerSeat = winnerSeat ?? null;
  game.winnerName = winnerName ?? null;
  game.totalsSnapshot = totalsSnapshot ?? null;
  await persist(snapshot(game));
}

function loadEntries(gameId) {
  return db.entries.where('gameId').equals(gameId).toArray()
    .then(es => es.sort((a, b) => a.orderIndex - b.orderIndex)
      .map(e => ({ playerId: e.playerId, category: e.category, value: e.value, orderIndex: e.orderIndex, recordedAt: e.recordedAt })));
}

// The single active game (newest if more than one) + its ordered entries, or null.
export async function loadActiveGame() {
  const actives = await db.games.where('status').equals('active').toArray();
  if (!actives.length) return null;
  actives.sort((a, b) => b.id - a.id); // newest first
  const g = actives[0];
  return {
    id: g.id, status: g.status, startingSeat: g.startingSeat, players: g.players,
    startedAt: g.startedAt, endedAt: g.endedAt, entries: await loadEntries(g.id),
  };
}

// Mark any active game as abandoned (won't resume; excluded from stats).
export async function abandonActive() {
  await db.games.where('status').equals('active').modify({ status: 'abandoned' });
}

// All finished games with their ordered entries (for Stats/History).
export async function allFinished() {
  const games = (await db.games.where('status').equals('finished').toArray()).sort((a, b) => a.id - b.id);
  const out = [];
  for (const g of games) out.push({ game: g, entries: await loadEntries(g.id) });
  return out;
}

// ---- backup / restore (survive an origin change; data is per-origin in IndexedDB) ----
const EXPORT_VERSION = 1;

// A JSON-serialisable snapshot of every FINISHED game (with its entries embedded) + the players table.
// The active in-progress game is intentionally skipped.
export async function exportData() {
  const games = (await db.games.where('status').equals('finished').toArray()).sort((a, b) => a.id - b.id);
  const players = await db.players.toArray();
  const withEntries = [];
  for (const g of games) withEntries.push({ ...g, entries: await db.entries.where('gameId').equals(g.id).toArray() });
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), games: withEntries, players };
}

// Merge a backup into the DB by primary key (upsert — never wipes existing rows). Each game's entries
// are replaced (delete-then-insert) so re-importing the same backup is idempotent. Returns a count.
export async function importData(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.games)) throw new Error('Invalid backup file');
  const players = Array.isArray(obj.players) ? obj.players : [];
  let count = 0;
  await db.transaction('rw', db.games, db.entries, db.players, async () => {
    if (players.length) { try { await db.players.bulkPut(players); } catch { /* &name collision — keep existing players */ } }
    for (const g of obj.games) {
      const { entries, ...row } = g;
      if (row.id == null) continue;
      await db.games.put(row);                                   // upsert by id
      await db.entries.where('gameId').equals(row.id).delete();  // replace this game's entries
      if (Array.isArray(entries) && entries.length) {
        await db.entries.bulkPut(entries.map(({ id, ...e }) => ({ ...e, gameId: row.id })));
      }
      count++;
    }
  });
  return { games: count };
}
