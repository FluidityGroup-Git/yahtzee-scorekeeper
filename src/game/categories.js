// Category metadata for the scorecard. Pure data + a pure tier mapping (no DOM).

export const UPPER = [
  { key: 'aces',   name: 'Aces',   face: 1, hint: 'Add up your 1s', type: 'count' },
  { key: 'twos',   name: 'Twos',   face: 2, hint: 'Add up your 2s', type: 'count' },
  { key: 'threes', name: 'Threes', face: 3, hint: 'Add up your 3s', type: 'count' },
  { key: 'fours',  name: 'Fours',  face: 4, hint: 'Add up your 4s', type: 'count' },
  { key: 'fives',  name: 'Fives',  face: 5, hint: 'Add up your 5s', type: 'count' },
  { key: 'sixes',  name: 'Sixes',  face: 6, hint: 'Add up your 6s', type: 'count' },
];

export const LOWER = [
  { key: 'threeKind',     name: 'Three of a Kind', hint: 'Sum all 5 · ~21% a roll', type: 'sum', max: 30 },
  { key: 'fourKind',      name: 'Four of a Kind',  hint: 'Sum all 5 · ~2% a roll',  type: 'sum', max: 30 },
  { key: 'fullHouse',     name: 'Full House',      hint: '25 pts · ~4% a roll',     type: 'fixed', value: 25 },
  { key: 'smallStraight', name: 'Small Straight',  hint: '30 pts · ~15% a roll',    type: 'fixed', value: 30 },
  { key: 'largeStraight', name: 'Large Straight',  hint: '40 pts · ~3% a roll',     type: 'fixed', value: 40 },
  { key: 'yahtzee',       name: 'Yahtzee',         hint: '50 pts · ~0.08% a roll 🤯', type: 'fixed', value: 50 },
  { key: 'chance',        name: 'Chance',          hint: 'Sum all 5 · freebie',     type: 'sum', max: 30 },
  { key: 'yahtzeeBonus',  name: 'Yahtzee Bonus',   hint: '+100 · then take a whole extra turn', type: 'bonus' },
];

export const ALL = [...UPPER, ...LOWER];
export const META = Object.fromEntries(ALL.map(c => [c.key, c]));

export const UPPER_KEYS = UPPER.map(c => c.key);
export const LOWER_KEYS = LOWER.map(c => c.key);
// The 13 base scoring boxes (Yahtzee Bonus is NOT one of them — it's a separate running bonus).
export const BASE_KEYS = [...UPPER_KEYS, 'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];

// Pure rarity-tier mapping for celebrations (ported from the mockup's tierFor).
// ctx: { category, value, crossedBonus, isBonusTick }
export function tierFor({ category, value, crossedBonus = false, isBonusTick = false }) {
  const c = META[category];
  if (category === 'yahtzeeBonus' && isBonusTick) return 'mega';
  if (value === 0) return 'bust';
  if (category === 'yahtzee') return 'legendary';
  if (category === 'largeStraight' || category === 'fourKind') return 'epic';
  if (category === 'smallStraight' || category === 'fullHouse') return 'great';
  if (c && c.type === 'count' && value === c.face * 5) return 'great';
  if (crossedBonus) return 'great';
  if (c && c.type === 'count' && value === c.face * 4) return 'nice';
  if (category === 'chance' && value >= 24) return 'nice';
  return 'normal';
}
