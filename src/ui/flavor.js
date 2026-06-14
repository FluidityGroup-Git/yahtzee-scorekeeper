// Randomized, lightly-dark toast flavour text per rarity tier. A shuffle-bag keeps it
// fresh and avoids immediate repeats.

const EMOJI = { mega: '💎', legendary: '🎲✨', epic: '🔥', great: '🙌', nice: '👍', bust: '😬' };

const POOLS = {
  mega: ['BONUS YAHTZEE!!', 'Absolutely feral.', 'The statisticians are screaming.', 'Unfair. Continue.'],
  legendary: ['YAHTZEE!', 'Frame it.', 'The dice fear you, as they should.', 'Certified all five.'],
  epic: ['BIG ROLL!', 'Filthy.', 'Certified heater.', 'Okay, show-off.'],
  great: ['NICE ONE!', 'Tidy.', 'We respect it.', 'Quietly excellent.'],
  nice: ['Solid.', 'Acceptable.', "I'll allow it.", 'Points are points.'],
  bust: [
    'Bold strategy.',
    "We don't speak of that box.",
    'The dice giveth, and then mostly taketh.',
    'A zero is just a circle of infinite potential.',
    'Write it down. Cry later.',
    'Character development.',
  ],
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Bag {
  constructor(items) { this.items = items; this.queue = []; this.last = null; }
  next() {
    if (!this.items.length) return '';
    if (!this.queue.length) this.queue = shuffle(this.items);
    let pick = this.queue.pop();
    if (pick === this.last && this.queue.length) { const alt = this.queue.pop(); this.queue.push(pick); pick = alt; }
    this.last = pick;
    return pick;
  }
}

const bags = Object.fromEntries(Object.entries(POOLS).map(([k, v]) => [k, new Bag(v)]));

// Returns { emo, label } for a tier, or null for tiers with no toast (e.g. 'normal').
export function flavorFor(tier) {
  if (!bags[tier]) return null;
  return { emo: EMOJI[tier], label: bags[tier].next() };
}
