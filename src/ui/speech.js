// Web Speech pep talks — spoken ONLY while it's Amber's turn. A random quote fires at a
// random 20–60s delay after she becomes active and after each quote; the timer is cleared
// the instant control passes, the game ends, or sound/pep-talks are muted. Also used for the
// one-off "EXTRA TURN!" announce on a bonus Yahtzee.

// Static fallback pool — every line names Amber (used when AI pep talks are off/unavailable).
const QUOTES = [
  'Amber. Greatness is a choice. Roll like you mean it.',
  'The dice fear you, Amber, as they should.',
  'You are the main character, Amber. Dan is set dressing.',
  'Amber, destiny is just probability with better marketing. Go get it.',
  'Breathe, Amber. Center yourself. Crush him.',
  'The universe is vast, indifferent, and currently rooting for you, Amber.',
  "Amber, you miss one hundred percent of the Yahtzees you don't roll. Probably.",
  'Fortune favors the bold, Amber, and the slightly smug.',
  'Somewhere a statistician is weeping at your standard deviation, Amber. In a good way.',
  "Win or lose, Amber, you're still better than Dan at this. Allegedly.",
  'Channel your inner chaos, Amber. The dice respect chaos.',
  'One roll closer to immortality, Amber.',
];

const MIN_DELAY = 20000, MAX_DELAY = 60000;

let enabled = true;          // the "Amber pep talks" toggle
let warmed = false;
let timer = null;
let bag = [];
let last = null;
let chosenVoice = null;
let quietUntil = 0;          // don't talk over a celebration sound until this time
let ai = null;               // optional AI line provider: { ready, prefetch, generate }
let supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function nextQuote() {
  if (!bag.length) bag = shuffle(QUOTES);
  let q = bag.pop();
  if (q === last && bag.length) { const alt = bag.pop(); bag.push(q); q = alt; }
  last = q;
  return q;
}
function pickVoice() {
  if (!supported) return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  // Prefer an offline (localService) English voice for reliability.
  chosenVoice = voices.find(v => v.localService && /^en/i.test(v.lang))
    || voices.find(v => v.localService)
    || voices.find(v => /^en/i.test(v.lang))
    || voices[0];
}
function utter(text, { rate = 1, pitch = 1.05, volume = 1 } = {}) {
  if (!supported) return;
  const u = new SpeechSynthesisUtterance(text);
  if (chosenVoice) u.voice = chosenVoice;
  u.rate = rate; u.pitch = pitch; u.volume = volume;
  speechSynthesis.speak(u);
}

function schedule() {
  clear();
  const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  timer = setTimeout(fire, delay);
}
async function fire() {
  if (!enabled || !supported) return;
  const wait = quietUntil - Date.now();
  if (wait > 0) { timer = setTimeout(fire, wait + 200); return; } // defer past a celebration
  let line = null;
  if (ai && ai.ready()) {
    // Race the AI line against a 2s budget; fall back to a static line if it's slow/fails.
    try { line = await Promise.race([ai.generate(), new Promise(r => setTimeout(() => r(null), 2000))]); }
    catch { line = null; }
  }
  if (!enabled) return; // muted while we awaited
  utter(line || nextQuote());
  schedule(); // queue the next one
}
function clear() { if (timer) { clearTimeout(timer); timer = null; } }

export const Speech = {
  // Unlock speech on the first user gesture (alongside the AudioContext unlock).
  warm() {
    if (!supported || warmed) return;
    warmed = true;
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
    utter(' ', { volume: 0 }); // silent priming utterance
  },
  setEnabled(on) { enabled = on; if (!on) { clear(); if (supported) speechSynthesis.cancel(); } },
  isEnabled() { return enabled; },
  // Inject the optional AI line provider: { ready(), prefetch(), generate() -> Promise<string|null> }.
  setAI(provider) { ai = provider; },
  // Call after every turn change. activeName = current active player's name; on = master sound on.
  onTurn(activeName, on) {
    if (on && enabled && supported && /^amber$/i.test((activeName || '').trim())) {
      if (ai && ai.ready()) ai.prefetch();   // warm a batch ahead so speaking has no latency
      schedule();
    } else clear();
  },
  // A bonus Yahtzee just fired a celebration sound — hold quotes briefly.
  noteCelebration(ms = 2200) { quietUntil = Date.now() + ms; },
  // One-off announcement (e.g. "EXTRA TURN!") regardless of whose turn it is.
  announce(text) { if (enabled && supported) utter(text, { rate: 1.05, pitch: 1.1 }); },
  stop() { clear(); if (supported) speechSynthesis.cancel(); },
};
