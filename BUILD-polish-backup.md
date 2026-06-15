# Build: Mascot min-hold + commentary length/voice reliability + Backup/Restore

**Role note for Claude Code:** build in THIS repo only (`\\FG-ROG\Yahtzee game` = `C:\Yahtzee game`).
ONE build, on top of the celebration-sequencer commit. Touch: `src/ui/mascots.js`, `src/ui/aiPep.js`,
`src/ui/commentary.js` (and `src/ui/speech.js` if needed), `src/db.js`, `src/main.js`, `index.html`
(Settings UI), and tests. Report the diff + `npx vitest run`, then stop. Do NOT touch the responsive
phone layout.

## Part A - Mascot pop: guarantee a minimum on-screen time
Problem: the center-stage mascot pop dismisses on the EARLIEST of (mouse move / pointer / key), the AI
voice ending (`onLineEnd` -> `Mascots.dismiss`), or its max-hold. There is no MINIMUM display time, so a
stray mouse move - or a voice that fails fast - kills the pop before it finishes animating.

Fix (in `mascots.js`): when `react(...)` runs it already computes a `hold` (~1.1-2.5s, scaled by
savagery). Treat that as a MINIMUM on-screen time. Record `floorUntil = performance.now() + hold`. Any
dismiss request before `floorUntil` - whether from the internal mouse-move/pointer/key listeners OR the
external `Mascots.dismiss()` called from main's `onLineEnd` - must NOT dismiss immediately. Instead defer:
schedule a single pending dismiss to run at `floorUntil` (the first early request schedules it; later
ones are ignored). After `floorUntil`, dismiss runs immediately, exactly as today. The existing max-hold
stays as the absolute cap.
- Net effect: the pop always plays its full `hold` before anything removes it, and it is no longer killed
  early when the voice short-circuits.
- The full-canvas celebration layer is unaffected (fixed 3.6s timer, not dismiss-driven) - leave it.

Test (jsdom + fake timers): `react('yahtzee')`; call `dismiss()` immediately -> still mounted; advance
time past the hold -> now dismissed. A simulated mouse-move before the floor -> deferred; after -> immediate.

## Part B - Commentary: clip to <=10s and stop the random Chrome-TTS drops
### B1 length (`aiPep.js`)
- `max_tokens` 150 -> 60.
- Rewrite the length guidance in SYSTEM: REMOVE "Vary length wildly, from a three-word verdict to one
  full unhinged sentence." REPLACE with a firm ceiling: "Output ONE short spoken line - never more than
  ~20 words, and usually much shorter. Put the funniest word last." Keep the short-verdict variety (the
  three-word zingers are great); kill the ramblers.
- Safety net in `generateLine`: after the line is produced, if it exceeds ~22 words (or ~140 chars),
  re-roll ONCE (reuse the existing verbatim-duplicate retry path); if it is still over, trim to the first
  one or two sentences within the cap. (~10s of speech is roughly ~25 words, so this keeps every line
  under ~10s.)

### B2 reliability (`commentary.js` / the synth path)
- KEEP `eleven_v3` (expressive). Shorter lines from B1 finish inside the 9s synth budget far more often -
  that budget overrun is the main reason it was dropping to Web Speech.
- Add ONE retry on a synth ERROR (a network failure / non-OK proxy response - distinct from a clean
  timeout) before falling back to Web Speech: if `synth(text)` rejects, retry it once within the remaining
  budget; only fall back to `speak(...)` (Web Speech) if the retry also fails or the budget is exhausted.
  A transient proxy blip should no longer immediately drop to Chrome's voice.
- Do NOT raise the synth budget - that would only add delay. The fix is shorter text + the retry.
- Note (no code change): the matched SFX are still not generated, so the sound->voice gate currently
  waits on longer fallback clips, which adds to the "delayed" feel. The user should run `npm run gen-sounds`
  once (needs the ElevenLabs key) to bake the short matched clips into `public/sounds` - the prompts are
  already there from the previous build. That shortens the gate so the voice arrives sooner.

Tests: with a mocked API returning an over-long line, assert the final line is within the word cap (the
re-roll/trim fires). With a mocked `synth` that rejects once then resolves, assert ElevenLabs audio is
used (the retry worked, no Web Speech). With a `synth` that rejects twice, assert the Web Speech fallback
fires.

## Part C - Backup / Restore (and recover yesterday's games)
Problem: games live in IndexedDB `yahtzeeDB`, scoped per ORIGIN, so the dev-port change hid yesterday's
games (saved under `localhost:5173`) from the app now on `localhost:8473`. They are intact, just on the
other origin. Add backup/restore so data survives any origin change and can be migrated across.

### C1 `db.js`
- `exportData()` -> returns a JSON-serialisable object `{ version, exportedAt, games:[...all finished
  games...], players:[...] }`. Read every finished game record + the players table. (The active
  in-progress game can be skipped.)
- `importData(obj)` -> validate the shape, then `bulkPut` games + players MERGING by primary key (upsert,
  do NOT wipe existing rows). Return a count of games imported/updated.

### C2 Settings UI (`index.html` + `main.js`)
- In the existing Settings area add a small "Data" section with two controls:
  - **Backup** -> call `exportData()`, serialise to JSON, trigger a file download named
    `yahtzee-backup-YYYY-MM-DD.json`.
  - **Restore** -> a `<input type="file" accept="application/json">`; on choose, read the file,
    `JSON.parse`, call `importData(...)`, refresh the Stats view, and show a brief confirmation
    (e.g. "Imported N games").
- Keep it simple and styled to match the existing settings panel.

### C3 Migration note (for the user - no code)
To bring yesterday's games into the new origin once Backup/Restore exists: temporarily run the app on the
old port (`npm run dev -- --port 5173`, with 5173 free), open `http://localhost:5173`, hit **Backup**
(downloads the JSON), then switch back to 8473 and hit **Restore** (upload the JSON). One-time.

Test (jsdom + fake-indexeddb): create 2-3 games, `exportData()`, clear the DB, `importData(exported)`,
assert the games are restored and the counts match; importing the same export again does NOT duplicate
(upsert by id).

## Wrap
Keep every existing test green. Report the diff + `npx vitest run`, then stop.
