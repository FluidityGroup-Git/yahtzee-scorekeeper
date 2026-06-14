// PURE: build the rich, situational context for a commentary line from the entries log.
// No DOM, no I/O — fully testable. Roasts BOTH players; the AI picks what fits the moment.
import { valuesFor, computeTotals, filledBaseCount } from './scoring.js';
import { UPPER_KEYS, META } from './categories.js';

const BIG_SCRATCH = ['yahtzee', 'largeStraight', 'fourKind', 'fullHouse', 'smallStraight'];

// args: { entries, scorerSeat, names:[n0,n1], lastCategory, lastValue, leadBefore (g0-g1 before this score),
//         level, profanity }
export function buildContext({ entries, scorerSeat, names, lastCategory, lastValue, leadBefore = null, level = 1, profanity = false }) {
  const s = scorerSeat, o = 1 - s;
  const v = [valuesFor(entries, 0), valuesFor(entries, 1)];
  const t = [computeTotals(v[0]), computeTotals(v[1])];
  const g = [t[0].grand, t[1].grand];

  const leadAfter = g[0] - g[1];
  const margin = Math.abs(leadAfter);
  const leader = leadAfter === 0 ? null : (leadAfter > 0 ? 0 : 1);

  // Comeback: did the trailing player close the gap, pull level, or take the lead this score?
  let comeback = null;
  if (leadBefore !== null && lastValue != null) {
    const before = leadBefore, after = leadAfter;
    if (before !== 0 && after !== 0 && Math.sign(after) !== Math.sign(before)) {
      comeback = `${names[leader]} just TOOK the lead`;
    } else if (before !== 0 && after === 0) {
      comeback = `${names[s]} just pulled level`;
    } else if (leader !== null && leader !== s && Math.abs(after) < Math.abs(before)) {
      comeback = `${names[s]} clawed the gap back to ${margin}`;
    }
  }

  const bonusDist = i => Math.max(0, 63 - t[i].upper);
  const boxesLeft = i => 13 - filledBaseCount(v[i]);

  // Jab fodder
  const jabs = [];
  for (const i of [0, 1]) {
    const zeros = UPPER_KEYS.filter(k => v[i][k] === 0).map(k => META[k].name);
    if (zeros.length) jabs.push(`${names[i]} scratched ${zeros.join(' & ')}`);
    if (v[i].chance === undefined && filledBaseCount(v[i]) >= 6) jabs.push(`${names[i]} still hasn't used Chance`);
  }
  const bigK = BIG_SCRATCH.find(k => v[0][k] === 0 || v[1][k] === 0);
  if (bigK) { const who = v[0][bigK] === 0 ? 0 : 1; jabs.push(`${names[who]} threw away their ${META[bigK].name}`); }

  // "What the scorer needs to win" projection
  let needToWin;
  if (leadAfter === 0) needToWin = 'Dead even right now.';
  else if (leader === s) needToWin = `${names[s]} is up ${margin} with ${boxesLeft(o)} boxes left for ${names[o]} to answer.`;
  else needToWin = `${names[s]} needs ${margin} back across their last ${boxesLeft(s)} boxes.`;

  return {
    scorer: names[s], scorerSeat: s, opponent: names[o],
    category: META[lastCategory]?.name || lastCategory, categoryKey: lastCategory, value: lastValue,
    justScratched: lastCategory !== 'yahtzeeBonus' && lastValue === 0,
    justYahtzee: lastCategory === 'yahtzee' && lastValue === 50,
    justBonus: lastCategory === 'yahtzeeBonus' && lastValue > 0,
    wasChance: lastCategory === 'chance',
    scorerTotal: g[s], opponentTotal: g[o],
    leader: leader === null ? null : names[leader], margin, comeback,
    scorerBonusDist: bonusDist(s), scorerBonusSecured: bonusDist(s) === 0 && t[s].upper > 0,
    opponentBonusDist: bonusDist(o), opponentBonusSecured: bonusDist(o) === 0 && t[o].upper > 0,
    scorerBoxesLeft: boxesLeft(s), opponentBoxesLeft: boxesLeft(o),
    needToWin, jabs, level, profanity,
  };
}
