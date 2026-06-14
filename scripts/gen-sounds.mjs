// Generate the SoundEngine SFX with the ElevenLabs Sound Effects API — a one-time BUILD/SETUP
// step, never called at play time. Writes public/sounds/<slot>.mp3; SoundEngine already prefers
// those files over the built-in synth, so anything not generated simply falls back to the synth.
//
// Usage (key read from .env, mirroring gen-icons):
//   npm run gen-sounds                 # generate any missing slots
//   npm run gen-sounds -- --force      # regenerate all
//   npm run gen-sounds -- bust yahtzee # regenerate only these slots (with or without --force)
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'sounds');
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
const MODEL = 'eleven_text_to_sound_v2';
const PROMPT_INFLUENCE = 0.7;   // 0.6–0.8 = fairly literal UI cues

// Cohesive retro game-night / chiptune vibe. duration_seconds is clamped to the API's 0.5–30 range.
const SLOTS = [
  { slot: 'tick',     duration: 0.3, text: 'short soft retro arcade UI blip, single button press, 8-bit' },
  { slot: 'nice',     duration: 0.6, text: 'cheerful retro arcade coin pickup ding, 8-bit, short' },
  { slot: 'great',    duration: 1.0, text: 'upbeat 8-bit power-up chime, ascending, celebratory' },
  { slot: 'epic',     duration: 1.5, text: 'triumphant retro arcade fanfare, chiptune brass, exciting' },
  { slot: 'yahtzee',  duration: 2.0, text: 'epic chiptune victory fanfare, jackpot win, big celebration' },
  { slot: 'bonus',    duration: 2.5, text: 'over-the-top slot-machine jackpot, coins cascading, chiptune explosion' },
  { slot: 'bust',     duration: 1.5, text: 'comedic sad trombone, womp womp, deadpan descending failure' },
  { slot: 'turnpass', duration: 0.4, text: 'quick playful whoosh, light page-turn swish' },
];

// Minimal .env reader (no dotenv dependency); process.env wins if set.
function envKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === 'ELEVENLABS_API_KEY') return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  return '';
}

const KEY = envKey();
if (!KEY) { console.error('No ELEVENLABS_API_KEY found (set it in .env). Nothing generated.'); process.exit(1); }

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

mkdirSync(OUT, { recursive: true });
let wrote = 0, skipped = 0, failed = 0;

for (const s of SLOTS) {
  if (only.length && !only.includes(s.slot)) continue;
  const file = join(OUT, `${s.slot}.mp3`);
  if (existsSync(file) && !force) { console.log(`• skip ${s.slot} (exists — use --force to regenerate)`); skipped++; continue; }
  const duration = Math.max(0.5, Math.min(30, s.duration));   // API range
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text: s.text, duration_seconds: duration, prompt_influence: PROMPT_INFLUENCE, model_id: MODEL }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); console.error(`✗ ${s.slot} — HTTP ${res.status} ${t.slice(0, 160)}`); failed++; continue; }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`✓ wrote public/sounds/${s.slot}.mp3 (${(statSync(file).size / 1024).toFixed(1)} KB, ${duration}s)`);
    wrote++;
  } catch (e) { console.error(`✗ ${s.slot} — ${e.message}`); failed++; }
}

console.log(`\nDone: ${wrote} written, ${skipped} skipped, ${failed} failed.`);
if (failed) process.exitCode = 1;

// OPTIONAL (not built): a short win / game-over jingle. Either add another slot here (e.g.
// `gameover` ~3s) and play it from onGameOver(), or use the ElevenLabs Music API
// (POST /v1/music) for a real musical sting. TODO — leave until requested.
