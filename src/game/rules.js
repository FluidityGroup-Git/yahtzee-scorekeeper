// PURE rules: turn passing, bonus-Yahtzee make-up, game over & winner. No DOM, no I/O.
// The entries log is canonical; turn state is DERIVED by replaying it (per the agreed design).
import { BASE_KEYS } from './categories.js';
import { valuesFor, computeTotals, filledBaseCount } from './scoring.js';

const other = p => (p === 0 ? 1 : 0);

// Replay the ordered entries log to derive whose turn it is and how many make-up
// boxes each player still owes from bonus Yahtzees.
//
// Rules encoded:
//  - A bonus Yahtzee (+100) keeps control with that player and owes ONE make-up box.
//  - Filling a NEW base box consumes one owed make-up if any; control passes only when
//    none remain (so back-to-back bonus Yahtzees owe multiple boxes).
//  - With nothing owed, filling a base box passes control normally.
//  - Editing a base box is NOT a new entry (it's upserted in place), so it never appears
//    as an extra fill here — "edit doesn't pass the turn" falls out for free.
export function deriveTurnState(entries, startingSeat = 0) {
  let activePlayer = startingSeat;
  const makeupOwed = [0, 0];
  const ordered = [...entries].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const e of ordered) {
    const p = e.playerId;
    if (e.category === 'yahtzeeBonus') {
      if (e.value > 0) { makeupOwed[p] += 1; activePlayer = p; }
    } else if (BASE_KEYS.includes(e.category)) {
      if (makeupOwed[p] > 0) {
        makeupOwed[p] -= 1;
        activePlayer = makeupOwed[p] > 0 ? p : other(p);
      } else {
        activePlayer = other(p);
      }
    }
  }
  return { activePlayer, makeupOwed };
}

// A bonus Yahtzee may only be claimed once the Yahtzee box is already scored 50.
export function canClaimBonus(values) {
  return values.yahtzee === 50;
}

// Game ends when BOTH players have all 13 base boxes filled.
export function isGameOver(entries) {
  return [0, 1].every(p => filledBaseCount(valuesFor(entries, p)) === 13);
}

// Winner by grand total. Returns { result: 'p0' | 'p1' | 'tie', totals: [t0, t1] }.
export function decideWinner(entries) {
  const totals = [0, 1].map(p => computeTotals(valuesFor(entries, p)));
  const [a, b] = [totals[0].grand, totals[1].grand];
  const result = a === b ? 'tie' : a > b ? 'p0' : 'p1';
  return { result, totals };
}
