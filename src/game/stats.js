// PURE stats over finished games (from db.allFinished() -> [{ game, entries }]). No DOM, no I/O.
// All per-player aggregates are keyed by trimmed player NAME so 'Dan'/'Amber' group across games.
import { valuesFor, computeTotals } from './scoring.js';
import { BASE_KEYS, META } from './categories.js';

const trim = s => String(s ?? '').trim();

function normalize({ game, entries }) {
  const players = game.players || [];
  const nm = seat => { const p = players.find(x => x.seat === seat); return p && p.name ? trim(p.name) : 'Player ' + (seat + 1); };
  const seats = [0, 1].map(s => {
    const values = valuesFor(entries, s);
    return { seat: s, name: nm(s), grand: computeTotals(values).grand, values };
  });
  return { id: game.id || 0, startedAt: game.startedAt || '', endedAt: game.endedAt || '', seats };
}
function winnerOf(g) { const [a, b] = g.seats; return a.grand > b.grand ? a.name : b.grand > a.grand ? b.name : null; }

export function computeStats(finished) {
  const games = (finished || []).filter(f => f && f.game && f.entries).map(normalize)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || (a.id - b.id));
  const totalGames = games.length;
  if (!totalGames) return { totalGames: 0 };

  const names = [];
  games.forEach(g => g.seats.forEach(s => { if (!names.includes(s.name)) names.push(s.name); }));

  // head-to-head + win share
  const winsByName = {}; names.forEach(n => winsByName[n] = 0);
  let ties = 0;
  games.forEach(g => { const w = winnerOf(g); if (w) winsByName[w]++; else ties++; });
  const headToHead = { winsByName, ties };
  const winShare = { labels: [...names, 'Ties'], data: [...names.map(n => winsByName[n]), ties] };

  // current streak (walk back from the newest game)
  let streak = { name: null, length: 0 };
  for (let i = games.length - 1; i >= 0; i--) {
    const w = winnerOf(games[i]);
    if (i === games.length - 1) { if (w) streak = { name: w, length: 1 }; else { streak = { name: null, length: 0 }; break; } }
    else if (w && w === streak.name) streak.length++;
    else break;
  }
  const lastWinner = winnerOf(games[games.length - 1]) || 'Tie';

  // per-name accumulators + counters
  const sum = {}, cnt = {}, catSum = {}, catCnt = {}, yahtzees = {}, bonusYahtzees = {};
  names.forEach(n => { sum[n] = 0; cnt[n] = 0; catSum[n] = {}; catCnt[n] = {}; yahtzees[n] = 0; bonusYahtzees[n] = 0; });
  const scratchCount = {}; BASE_KEYS.forEach(k => scratchCount[k] = 0);
  let bestGame = { name: null, score: -Infinity }, worstMeltdown = { name: null, score: Infinity };
  let durSum = 0, durN = 0;
  let biggestBlowout = { margin: -Infinity, winner: null }, closestGame = { margin: Infinity, winner: null };
  const totalsOverTime = [], allGrands = [];

  games.forEach((g, i) => {
    const row = { n: i + 1, datePlayed: (g.startedAt || '').slice(0, 10) };
    g.seats.forEach(s => {
      sum[s.name] += s.grand; cnt[s.name]++;
      row[s.name] = s.grand; allGrands.push(s.grand);
      if (s.grand > bestGame.score) bestGame = { name: s.name, score: s.grand };
      if (s.grand < worstMeltdown.score) worstMeltdown = { name: s.name, score: s.grand };
      BASE_KEYS.forEach(k => {
        const val = s.values[k];
        if (val !== undefined) { catSum[s.name][k] = (catSum[s.name][k] || 0) + val; catCnt[s.name][k] = (catCnt[s.name][k] || 0) + 1; if (val === 0) scratchCount[k]++; }
      });
      if (s.values.yahtzee === 50) yahtzees[s.name]++;
      if (s.values.yahtzeeBonus) bonusYahtzees[s.name] += Math.round(s.values.yahtzeeBonus / 100);
    });
    totalsOverTime.push(row);
    const margin = Math.abs(g.seats[0].grand - g.seats[1].grand);
    const w = winnerOf(g);
    if (w) {
      if (margin > biggestBlowout.margin) biggestBlowout = { margin, winner: w };
      if (margin < closestGame.margin) closestGame = { margin, winner: w };
    }
    if (g.startedAt && g.endedAt) { const d = Date.parse(g.endedAt) - Date.parse(g.startedAt); if (Number.isFinite(d) && d >= 0) { durSum += d; durN++; } }
  });

  const avgScore = {}; names.forEach(n => avgScore[n] = cnt[n] ? Math.round(sum[n] / cnt[n]) : 0);
  const avgByCategory = {}; names.forEach(n => { avgByCategory[n] = {}; BASE_KEYS.forEach(k => { avgByCategory[n][k] = catCnt[n][k] ? Math.round(catSum[n][k] / catCnt[n][k]) : 0; }); });

  let mostScratchedCategory = { category: null, name: null, count: 0 };
  BASE_KEYS.forEach(k => { if (scratchCount[k] > mostScratchedCategory.count) mostScratchedCategory = { category: k, name: META[k]?.name || k, count: scratchCount[k] }; });

  // final-score histogram (all final grands, binned by 50)
  const binSize = 50;
  const maxBin = allGrands.length ? Math.floor(Math.max(...allGrands) / binSize) : 0;
  const histLabels = [], histData = [];
  for (let b = 0; b <= maxBin; b++) { const lo = b * binSize; histLabels.push(`${lo}–${lo + binSize - 1}`); histData.push(allGrands.filter(x => x >= lo && x < lo + binSize).length); }

  return {
    totalGames, names, headToHead, winShare, streak, lastWinner,
    avgScore, avgByCategory, totalsOverTime,
    finalScoreHistogram: { labels: histLabels, data: histData, binSize },
    counters: {
      yahtzees, bonusYahtzees, bestGame, worstMeltdown, mostScratchedCategory,
      avgDurationMs: durN ? Math.round(durSum / durN) : 0,
      biggestBlowout: biggestBlowout.margin >= 0 ? biggestBlowout : { margin: 0, winner: null },
      closestGame: Number.isFinite(closestGame.margin) ? closestGame : { margin: 0, winner: null },
    },
  };
}
