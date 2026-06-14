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
const DEFAULT_INFLUENCE = 0.7;

// Cohesive retro game-night / chiptune vibe. Per-slot prompt_influence (higher = more literal UI
// cue, lower = more musical). duration_seconds is clamped to the API's 0.5–30 range.
const SLOTS = [
  { slot: 'tick',     duration: 0.3, influence: 0.85, text: 'short tight 8-bit UI blip, single crisp button press, dry, no reverb' },
  { slot: 'nice',     duration: 0.6, influence: 0.8,  text: 'bright 8-bit coin pickup ding, two quick ascending blips, cheerful' },
  { slot: 'great',    duration: 1.1, influence: 0.7,  text: 'upbeat chiptune power-up, fast ascending arpeggio, celebratory sparkle' },
  { slot: 'epic',     duration: 1.6, influence: 0.65, text: 'triumphant retro arcade fanfare, punchy chiptune brass stabs, exciting' },
  { slot: 'yahtzee',  duration: 2.2, influence: 0.6,  text: 'epic 8-bit victory fanfare, jackpot win, rising chiptune brass and bells, huge celebration' },
  { slot: 'bonus',    duration: 2.6, influence: 0.6,  text: 'over-the-top slot-machine jackpot, cascading coins, chiptune explosion, crowd cheer' },
  { slot: 'bust',     duration: 1.6, influence: 0.8,  text: 'comedic sad trombone, classic womp-womp-womp, deadpan descending brass failure' },
  { slot: 'turnpass', duration: 0.45, influence: 0.85, text: 'quick playful swish whoosh, light page-turn, short and snappy' },
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
  const influence = s.influence ?? DEFAULT_INFLUENCE;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text: s.text, duration_seconds: duration, prompt_influence: influence, model_id: MODEL }),
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
