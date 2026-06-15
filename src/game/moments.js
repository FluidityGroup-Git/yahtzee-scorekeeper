// Pure, DOM-free score-moment mapping for the celebration sequencer. Given a score, returns the
// { event, sfx, celebrate } triple the orchestrator in main.js needs:
//   event     — the mascot reaction event (same priority the old fireMascots used)
//   sfx       — the SoundEngine moment name to play immediately (matched for big moments, a soft
//               blip for a plain score)
//   celebrate — the full-canvas celebration type, set ONLY for the marquee moments
//               (yahtzee / bonusYahtzee / winGame); null otherwise, so the big spectacle stays rare.
//
// Event priority when several could fire on one score: bonusYahtzee > yahtzee > scratch > takeLead
// > upperBonus > goodScore. winGame is decided by the game-over path, not here.

// event -> SoundEngine moment name (mapped to real files / fallbacks inside the SoundEngine).
const SFX_FOR = {
  bonusYahtzee: 'bonusYahtzee',
  yahtzee:      'yahtzee',
  scratch:      'scratch',
  takeLead:     'takeLead',
  upperBonus:   'upperBonus',
  goodScore:    'goodScore',
  winGame:      'winGame',
  loseGame:     'loseGame',
};

// The marquee moments that earn the full-screen celebration layer.
const MARQUEE = new Set(['yahtzee', 'bonusYahtzee', 'winGame']);

export function celebrateFor(event) { return MARQUEE.has(event) ? event : null; }
export function sfxFor(event) { return SFX_FOR[event] || 'goodScore'; }

// A score landed for `seat`. leadBefore/leadAfter are (p0 grand − p1 grand) before/after the score;
// a sign flip means the scorer just took the lead. Mirrors the old fireMascots decision exactly.
export function momentFor(seat, category, value, leadBefore, leadAfter, crossedBonus) {
  const flipped = Math.sign(leadBefore) !== 0 && Math.sign(leadAfter) !== 0
    && Math.sign(leadAfter) !== Math.sign(leadBefore);
  let event;
  if (category === 'yahtzeeBonus' && value > 0) event = 'bonusYahtzee';
  else if (category === 'yahtzee' && value === 50) event = 'yahtzee';
  else if (value === 0) event = 'scratch';
  else if (flipped) event = 'takeLead';
  else if (crossedBonus) event = 'upperBonus';
  else event = 'goodScore';
  return { event, sfx: sfxFor(event), celebrate: celebrateFor(event) };
}
