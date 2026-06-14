// AI-generated commentary for Amber via Claude (Haiku, direct browser, BYO key in
// localStorage). Generates one short line that escalates from cheeky to savage as the game
// fills up, optionally tagged with ElevenLabs v3 performance tags. The line is produced in two
// forms: `tagged` (for ElevenLabs delivery) and `plain` (tags stripped — for Web Speech and any
// on-screen text). Degrades seamlessly to the static pool (speech.js) when unavailable.
//
// The Anthropic key is stored ONLY in localStorage and sent ONLY to api.anthropic.com.

const KEY_STORAGE = 'yz_anthropic_key';
const MODEL = 'claude-haiku-4-5-20251001';   // fast + cheap ($1/$5 per 1M tokens)
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM = [
  "You are Amber's hype-man, coach, and comedic ringside commentator in a friendly two-player Yahtzee game against Dan.",
  'Output ONE short spoken sentence, performed aloud. Always address Amber by name.',
  'Amber is the permanent hero — never roast, insult, or undercut Amber. Dan is the playful target.',
  'It is a comedy roast between close friends: burns aimed at Dan, hype for Amber, real affection underneath.',
  'Use the live score for specific, real burns (a scratched Yahtzee, a blown bonus, the gap on the board).',
  'You may include at most one or two ElevenLabs v3 performance tags in square brackets to direct delivery,',
  'e.g. [dryly], [gleeful], [low], [laughs], [whispers] — fitting the mood and savagery level.',
  'SAVAGERY LADDER (you will be told the current level, 1 to 5):',
  'L1 cheeky, clever, light teasing. L2 sharper, sarcastic, cocky jabs at Dan. L3 gallows humor, mock-villain swagger.',
  'L4 properly dark, savage, edgy. L5 peak savage, comedic cruelty, full theatrical villainy.',
  'HARD RULES at EVERY level: no slurs; nothing about protected characteristics (race, gender, religion, orientation, disability);',
  'no jabs at appearance, weight, or real insecurities; no sexual content. Keep it to the game, competence, and theatrical villainy only.',
  'No emoji. No stage directions in parentheses. No quotation marks around the line.',
].join(' ');

let enabled = false;
let queue = [];
let generating = 0;
const seen = new Set();
let ctxProvider = () => ({});
let synth = null;   // optional audio synthesizer: { ready(), make(text) -> Promise<Blob> }

// ---- localStorage (private-mode safe) ----
function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
function putKey(k) { try { if (k) localStorage.setItem(KEY_STORAGE, k); else localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }

// ---- line parsing: keep v3 [tags] in `tagged`, strip them for `plain` ----
function cleanCommon(s) {
  let t = (s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\([^)]*\)/g, '').replace(/\*[^*]*\*/g, '');             // parenthetical / *action* stage directions
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ''); // emoji
  t = t.replace(/^["'“”\s]+|["'“”\s]+$/g, '').replace(/\s+/g, ' ').trim(); // wrapping quotes
  return t.length > 240 ? t.slice(0, 240) : t;
}
export function stripTags(s) { return (s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); }
export function parseLine(raw) { const tagged = cleanCommon(raw); return { tagged, plain: stripTags(tagged) }; }

// ---- escalation: progress (0..1) -> savagery level (1..5), clamped by a cap ----
export function savageryLevel(progress, cap = 5) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const lvl = p < 0.20 ? 1 : p < 0.40 ? 2 : p < 0.60 ? 3 : p < 0.85 ? 4 : 5;
  const c = Math.max(1, Math.min(5, Math.round(Number(cap) || 5)));
  return Math.min(lvl, c);
}

function buildUserMessage(c) {
  const lvl = c.level || 1;
  const parts = [
    `Current savagery level: ${lvl} of 5.`,
    c.profanity ? 'Mild profanity is allowed for comedic punch.' : 'Keep it clean — no profanity.',
    "It's Amber's turn (Amber versus Dan).",
    `Amber's total is ${c.amber ?? 0}; Dan's total is ${c.dan ?? 0}.`,
    c.lead > 0 ? `Amber leads by ${c.lead}.` : c.lead < 0 ? `Amber trails by ${-c.lead}.` : 'The scores are tied.',
    c.boxesLeft != null ? `Amber has ${c.boxesLeft} of 13 boxes left.` : '',
    c.last ? `Her last move was ${c.last.label} for ${c.last.value} points.` : '',
    c.justYahtzee ? 'She just rolled a YAHTZEE.' : '',
    c.justBonus ? 'She just rolled a BONUS Yahtzee for plus one hundred.' : '',
    c.justScratched ? 'She just had to scratch a box for zero.' : '',
    `Deliver one fresh line at savagery level ${lvl}: hype Amber, roast Dan, fit this exact moment. You may add a v3 tag like [dryly].`,
  ].filter(Boolean);
  return parts.join(' ');
}

async function callAPI(key, ctx, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 90,
        temperature: 1,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserMessage(ctx) }],
      }),
    });
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
  if (!text.trim()) throw new Error('empty response');
  return text;
}

// Generate one line in the background, synthesize its audio if a voice is ready, enqueue it.
async function genOne() {
  const key = getKey();
  if (!key) return;
  generating++;
  try {
    const raw = await callAPI(key, ctxProvider());
    const { tagged, plain } = parseLine(raw);
    if (!plain || seen.has(plain)) return;
    seen.add(plain);
    const item = { tagged, plain, blob: null };
    if (synth && synth.ready && synth.ready()) {
      try { item.blob = await synth.make(tagged); } catch { item.blob = null; }
    }
    queue.push(item);
  } catch { /* swallow — caller falls back */ } finally { generating--; }
}

export const AIPep = {
  setEnabled(on) { enabled = on; if (!on) queue = []; },
  isEnabled() { return enabled; },
  hasKey() { return !!getKey(); },
  ready() { return enabled && !!getKey(); },
  setKey(k) { putKey((k || '').trim()); queue = []; },
  maskedKey() { const k = getKey(); return k ? k.slice(0, 10) + '…' + k.slice(-4) : ''; },
  setContextProvider(fn) { if (typeof fn === 'function') ctxProvider = fn; },
  // Inject the ElevenLabs synthesizer: { ready(), make(text) -> Promise<Blob> }.
  setSynth(s) { synth = s; },

  // Keep the queue shallow (1-2 ahead) when also synthesizing audio, to conserve ElevenLabs characters.
  prefetch() {
    if (!this.ready()) return;
    const target = (synth && synth.ready && synth.ready()) ? 2 : 3;
    while (queue.length + generating < target) genOne();
  },

  // Return the next ready item { tagged, plain, blob } (or null -> caller uses static fallback).
  async generateNow() {
    if (!this.ready()) return null;
    let item = queue.shift();
    if (!item) { await genOne(); item = queue.shift() || null; }
    this.prefetch();
    return item || null;
  },

  // One-off probe for the settings "Test" button — returns the plain (tag-stripped) line.
  async test(key) {
    const k = (key || getKey() || '').trim();
    if (!k) return { ok: false, error: 'No key' };
    try { return { ok: true, text: parseLine(await callAPI(k, ctxProvider(), 12000)).plain }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};
