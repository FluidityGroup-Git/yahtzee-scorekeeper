// Optional AI-generated pep talks for Amber via Claude (bring-your-own Anthropic key).
// Generates one short spoken line that reacts to the live game state. Degrades seamlessly
// to the static shuffle-bag pool (in speech.js) when there's no key, no network, an error,
// or it's too slow — the user should never notice a failure.
//
// The key is stored ONLY in localStorage on this device and is sent ONLY to api.anthropic.com.

const KEY_STORAGE = 'yz_anthropic_key';
const MODEL = 'claude-haiku-4-5-20251001';   // fast + cheap ($1/$5 per 1M tokens)
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM = [
  "You are Amber's personal hype-man and coach during a friendly two-player Yahtzee game",
  "(she's playing against Dan). Speak ONE short sentence, read aloud by a text-to-speech voice.",
  "Be inspiring, funny, quirky, and a little dark — but always affectionate and kind to Amber,",
  "never cruel to her. Always address her by name, Amber. React to the specific game moment you're",
  "given. No emoji, no stage directions, no quotation marks — output only the spoken line.",
].join(' ');

let enabled = false;
let queue = [];
let generating = 0;
const seen = new Set();
let ctxProvider = () => ({});

// ---- localStorage helpers (private-mode safe) ----
function getKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
function putKey(k) { try { if (k) localStorage.setItem(KEY_STORAGE, k); else localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }

function sanitize(s) {
  let t = (s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\*[^*]*\*/g, ''); // stage directions
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ''); // emoji
  t = t.replace(/^["'“”\s]+|["'“”\s]+$/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 200 ? t.slice(0, 200) : t;
}

function buildUserMessage(c) {
  const parts = [
    "It's Amber's turn in a two-player Yahtzee game against Dan.",
    `Amber's total is ${c.amber ?? 0}; Dan's total is ${c.dan ?? 0}.`,
    c.lead > 0 ? `Amber is ahead by ${c.lead}.` : c.lead < 0 ? `Amber is behind by ${-c.lead}.` : "They're tied.",
    c.boxesLeft != null ? `Amber has ${c.boxesLeft} of 13 boxes left.` : '',
    c.last ? `Her last move was ${c.last.label} for ${c.last.value} points.` : '',
    c.justYahtzee ? 'She just rolled a YAHTZEE.' : '',
    c.justBonus ? 'She just rolled a BONUS Yahtzee for plus one hundred.' : '',
    c.justScratched ? 'She just had to scratch a box for zero.' : '',
    'Give her one fresh spoken pep-talk line that fits this exact moment.',
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
        max_tokens: 80,
        temperature: 1,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserMessage(ctx) }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  }
  const data = await res.json();
  const text = sanitize((data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' '));
  if (!text) throw new Error('empty response');
  return text;
}

// Generate one line in the background and enqueue it (deduped).
async function genOne() {
  const key = getKey();
  if (!key) return;
  generating++;
  try {
    const line = await callAPI(key, ctxProvider());
    if (line && !seen.has(line)) { seen.add(line); queue.push(line); }
  } catch { /* swallow — caller falls back to static */ } finally { generating--; }
}

export const AIPep = {
  setEnabled(on) { enabled = on; if (!on) queue = []; },
  isEnabled() { return enabled; },
  hasKey() { return !!getKey(); },
  ready() { return enabled && !!getKey(); },
  setKey(k) { putKey((k || '').trim()); queue = []; },
  maskedKey() { const k = getKey(); return k ? k.slice(0, 10) + '…' + k.slice(-4) : ''; },
  setContextProvider(fn) { if (typeof fn === 'function') ctxProvider = fn; },

  // Fill the queue ahead of time so speaking has zero latency.
  prefetch(target = 3) {
    if (!this.ready()) return;
    while (queue.length + generating < target) genOne();
  },

  // Return a line now (from the prefetched queue, or a quick on-demand generation).
  // Returns null if not ready or generation didn't produce one — caller uses static fallback.
  async generateNow() {
    if (!this.ready()) return null;
    let line = queue.shift();
    if (!line) { await genOne(); line = queue.shift() || null; }
    this.prefetch();
    return line || null;
  },

  // One-off probe for the settings "Test" button. Uses the passed key, or the stored one.
  async test(key) {
    const k = (key || getKey() || '').trim();
    if (!k) return { ok: false, error: 'No key' };
    try { return { ok: true, text: await callAPI(k, ctxProvider(), 12000) }; }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};
