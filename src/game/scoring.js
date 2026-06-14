// PURE scoring: totals from a per-player category->value map. No DOM, no I/O.
import { UPPER_KEYS, LOWER_KEYS, BASE_KEYS } from './categories.js';

// Build a {category: value} map for one player from the ordered entries log.
// Base boxes are single-valued (last write wins); yahtzeeBonus accumulates (+100 each).
export function valuesFor(entries, playerId) {
  const v = {};
  for (const e of entries) {
    if (e.playerId !== playerId) continue;
    if (e.category === 'yahtzeeBonus') v.yahtzeeBonus = (v.yahtzeeBonus || 0) + e.value;
    else v[e.category] = e.value;
  }
  return v;
}

export function upperSubtotal(values) {
  return UPPER_KEYS.reduce((s, k) => s + (values[k] ?? 0), 0);
}

export function upperBonus(subtotal) {
  return subtotal >= 63 ? 35 : 0;
}

export function lowerTotal(values) {
  return LOWER_KEYS.reduce((s, k) => s + (values[k] ?? 0), 0);
}

export function computeTotals(values) {
  const upper = upperSubtotal(values);
  const bonus = upperBonus(upper);
  const upperTotal = upper + bonus;
  const lower = lowerTotal(values);
  return { upper, bonus, upperTotal, lower, grand: upperTotal + lower };
}

// How many of the 13 base boxes are filled (a scratch counts — value 0 is a real entry).
export function filledBaseCount(values) {
  return BASE_KEYS.filter(k => values[k] !== undefined).length;
}
