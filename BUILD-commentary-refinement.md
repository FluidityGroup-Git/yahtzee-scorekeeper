# Build: Commentary refinement + last-turn announcement

**Role note for Claude Code:** you build the app in this repo. This is **one build**. Touch **only** these files:
`src/ui/commentary.js`, `src/ui/voice.js`, `src/ui/speech.js`, `src/ui/aiPep.js`,
`src/game/commentaryContext.js`, `src/main.js`. **Do NOT** start the responsive phone layout.
When done, report the diff + `npx vitest run` output, then **stop** for verification.

## Why
Four reported issues + one new feature:
1. Spoken commentary sometimes gets **cut off** mid-sentence (two distinct causes - see below).
2. Some insults **repeat**, and a duplicate currently produces a **silent turn**.
3. Make the humor **wittier**.
4. Use **historic data** (persisted finished games) to enhance the banter.
5. NEW: **announce when a player is on their last turn**.

---

## 1) Stop cutting lines off - let the current line finish, queue the newest behind it
File: `src/ui/commentary.js`

Root cause: `react()` calls `stopVoice()` at the top of every reaction, so a line that is still
speaking is killed the instant the next score lands.

- **Remove** the `if (cfg.stopVoice) cfg.stopVoice();` call at the **top of `react()`**.
  Keep `stopVoice()` only inside `cancel()` (the explicit mute / new-game path).
- Add a single-slot playback gate at module scope:
  `let speaking = false; let queued = null;`
- Add a helper `utterOnce(line, blob)` that performs exactly **one** spoken utterance and returns a
  Promise that resolves when it **ends** (not when it starts). Contract:
  - If `blob` and `cfg.playAudio`: call `cfg.playAudio(blob, { onEnded: settle })`. `playAudio`
    resolves a bool for whether playback *started*; if it resolves `false` (autoplay blocked) or
    throws, fall back to `cfg.speak(line.plain, { onEnd: settle })`.
  - Else if `cfg.speak`: `cfg.speak(line.plain, { onEnd: settle })`.
  - Else: settle immediately.
  - `settle` must resolve the Promise **exactly once** (guard with a boolean).
- Add the gate driver:
```js
function enqueue(line, blob) {
  if (speaking) { queued = { line, blob }; return; }   // newest wins; only one waits
  speaking = true;
  utterOnce(line, blob).finally(() => {
    speaking = false;
    if (queued) { const q = queued; queued = null; enqueue(q.line, q.blob); }
  });
}
```
- In `react()`: keep the **instant caption** where it is (right after `line` is finalized - preserves
  on-screen feedback). After the synth/budget race, replace the final `if (blob) {...} else speak`
  block with a single `enqueue(line, blob);`. Keep the `if (my !== token) return null;` guard right
  after synth so a superseded line is dropped (never enqueued) - that is what makes "newest wins"
  work without interrupting the line that is currently playing.
- In `cancel()`: also clear the gate - `queued = null; speaking = false;` - in addition to the
  existing token bump, abort, and `stopVoice()`.

## 2) Completion callbacks so the gate knows when audio/speech ends
- `src/ui/voice.js` - change `play(blob)` to `play(blob, { onEnded } = {})`. Attach `onEnded` to BOTH
  the `ended` and `error` events (so the gate never stalls if a clip errors). Still return `true` on
  start / `false` on catch. Leave `stop()` as-is - it must NOT call `onEnded` (deliberate stops must
  not advance the queue). `test()` calls `play(blob)` with no options; that is fine.
- `src/ui/speech.js` - thread an `onEnd` callback: `say(text, { onEnd } = {})` passes it through to
  `utter`, which attaches it to the utterance `end` AND `error` events. **Important:** when speech is
  disabled or unsupported, `say()` and `utter()` must still call `onEnd()` so the gate resolves even
  when muted.

## 3) Wire the new callbacks in `src/main.js` Commentary.configure deps
- `playAudio: (b, opts) => Voice.play(b, opts),`
- `speak: (t, opts) => Speech.say(t, opts),`
- Leave `stopVoice: () => { Voice.stop(); Speech.stop(); }` unchanged.

## 4) Do not truncate, do not repeat, do not go silent
File: `src/ui/aiPep.js`

- Second cut-off cause: bump `max_tokens` from `110` to `150` in `callAPI` (prevents mid-sentence
  truncation of longer lines). Keep `temperature: 1`.
- Enlarge self-memory: `const RECENT_MAX = 6;` and use it in the `recent.length > RECENT_MAX` trim
  (was 4).
- Rewrite `generateLine` so a verbatim duplicate **retries** instead of returning null:
```js
async generateLine(ctx, { signal } = {}) {
  if (!this.ready()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {     // one retry, then accept rather than go silent
    try {
      const { angle, shape } = pickDelivery();
      const userMessage = buildUserMessage(ctx, { angle, shape, recent: recent.slice() });
      const { tagged, plain } = parseLine(await callAPI(getKey(), userMessage, 8000, signal));
      if (!plain) continue;
      if (seen.has(plain) && attempt === 0) continue;  // dup on first try -> regenerate
      seen.add(plain);
      recent.push(plain); if (recent.length > RECENT_MAX) recent.shift();
      return { tagged, plain };
    } catch { if (signal && signal.aborted) return null; }  // superseded -> stop; else retry/exit
  }
  return null;
}
```

## 5) Make it wittier - replace the `SYSTEM` prompt
File: `src/ui/aiPep.js`. Replace the `SYSTEM` array with the following. **Keep the HARD RULES line
exactly as written - do not soften the guardrails:**
```js
const SYSTEM = [
  'You are the live, ringside color commentator for a fast, friendly two-player Yahtzee game between Dan and Amber. Your job is to be genuinely funny, not just snarky.',
  'React to the score you are told about. Roast EITHER player as the moment demands, and feel free to pick a side. The goal is laughs: surprise, specificity, a sharp turn of phrase. Land an actual joke, not a generic insult.',
  'Each line gets a random DELIVERY PERSONA and a SENTENCE SHAPE. Commit to them completely; they are your engine of variety, so never settle into one recognizable house voice.',
  'Build the joke out of the SPECIFIC situation (the exact number, the box they wasted, the gap, a cold streak) but twist it: an unexpected comparison, a vivid image, misdirection, escalating absurdity, a little wordplay. Do not flatly recite the stats.',
  'Craft matters: keep it tight, cut filler, put the funniest word last. Vary length wildly, sometimes three words, sometimes one full sentence.',
  'Do NOT reuse a joke, comparison, metaphor, or punchline structure from the recent lines you are shown; find a genuinely different angle each time. You MAY call back to an earlier bit only if the callback itself is the joke.',
  'When given RIVALRY HISTORY (past games between them), you may weave it in for extra sting or a callback (a losing streak, a personal best they are nowhere near, how last game went) but only when it sharpens the joke; never just recite it.',
  'When told it is a players LAST TURN, treat it as a final-box moment: heighten the stakes, build tension or mock the pressure.',
  'You may use at most one or two ElevenLabs v3 performance tags in square brackets, e.g. [dryly], [gleeful], [low], [laughs], to color delivery.',
  'SAVAGERY LADDER (you will be told the level, 1 to 5): L1 cheeky and light. L2 sharper sarcasm. L3 gallows humor. L4 properly savage. L5 peak comedic cruelty, but funny first, cruel second.',
  'HARD RULES at EVERY level: no slurs; nothing about protected characteristics (race, gender, religion, orientation, disability); no jabs at appearance, weight, or real insecurities; no sexual content. Roast their Yahtzee play and competence only, affection underneath.',
  'Output ONE spoken line (occasionally two short ones for a big moment). No emoji, no stage directions in parentheses, no quotation marks around the line.',
].join(' ');
```

## 6) Rivalry history -> banter (current + historic games)
- `src/game/commentaryContext.js`:
  - Add a pure export `rivalryDigest(stats, name0, name1)` returning `null` when `!stats || !stats.totalGames`,
    else a compact object: `{ totalGames, wins:{[name0],[name1]}, ties, leader (name|null),
    streak:{name,length}|null, lastWinner, avg:{[name0],[name1]}, bestGame:{name,score}|null,
    closestMargin|null, biggestBlowout:{winner,margin}|null }`, reading only from the `computeStats`
    shape (`headToHead.winsByName`, `streak`, `lastWinner`, `avgScore`,
    `counters.bestGame/closestGame/biggestBlowout`).
  - `buildContext(...)`: accept a `rivalry = null` field and include it on the returned ctx object.
- `src/ui/aiPep.js` `buildUserMessage`: when `c.rivalry` is present, push ONE compact line before the
  closer, built from the digest fields (omit null pieces). Example shape:
  `RIVALRY HISTORY (reference occasionally for spice, do NOT force it every line): Career: Dan 3-5 Amber (1 tie) over 9 games. Amber has won the last 2. Last game went to Amber. Career averages: Dan 95, Amber 162. Record game: Amber 286.`
- `src/main.js`:
  - Import `computeStats` from `./game/stats.js`, `allFinished` from `./db.js`, and `rivalryDigest`
    from `./game/commentaryContext.js`.
  - Add `let rivalry = null;` and
    `async function refreshRivalry() { if (!persist) { rivalry = null; return; } try { rivalry = rivalryDigest(computeStats(await allFinished()), nameOf(0), nameOf(1)); } catch { rivalry = null; } }`
  - Call `refreshRivalry()` once per game: at the end of `startGame(...)`, and in `boot()` (both the
    resume and fresh-start paths). It reads FINISHED games only, so it reflects the rivalry *before*
    the current game.
  - Pass `rivalry` into `buildContext(...)` in `fireCommentary`, AND into the game-over context object
    in `onGameOver` so the closing line can use it too.

## 7) NEW: announce when a player is on their last turn
A player is "on their last turn" when they have exactly **one base box left to fill**
(`filledBaseCount(player) === 12`). Announce it **once per player per game**.

- `src/main.js`:
  - Add `let lastTurnAnnounced = [false, false];` at module scope. **Reset to `[false, false]`** in
    `startGame(...)` and in the boot/hydrate paths (wherever `prevLeadSeat` / `Commentary.cancel()`
    are reset for a fresh or resumed game).
  - In the post-score path (right where `fireCommentary(...)` is called for a new score), after the
    board/state is updated, check **both** seats: for seat `i`, if `filledBaseCount(valuesP(i)) === 12`
    and `!lastTurnAnnounced[i]`, set `lastTurnAnnounced[i] = true` and fire the announcement:
    - Visual: reuse the existing toast - `showToast('Last turn for ' + nameOf(i) + ', one box to go')`
      (match the current `showToast` signature; keep it short).
    - Sound: `if (soundOn) SoundEngine.play('nice');` (reuse an existing cue; a dedicated sound can be
      generated later).
  - Only announce during an **active** game (not while hydrating a finished game). The `=== 12`
    equality fires only on the transition into one-box-left (not at 13/done), and the flag prevents an
    edit from re-triggering.
- Thread a flag into commentary so the spoken line can acknowledge it (optional but nice):
  - `src/game/commentaryContext.js` `buildContext`: compute `scorerLastTurn = boxesLeft(s) === 1` and
    `opponentLastTurn = boxesLeft(o) === 1`; include both on the returned ctx.
  - `src/ui/aiPep.js` `buildUserMessage`: if `c.scorerLastTurn` push `This is ` + scorer + `s LAST
    TURN, final box.`; else if `c.opponentLastTurn` push opponent + ` is down to their LAST box.`

---

## Tests (add/adjust; keep all existing green)
- `commentary.js`: with fake deps (a `playAudio` that calls `onEnded` on the next tick), assert
  (a) `react()` no longer calls `stopVoice` on a new score, (b) when a line is "playing," a newer
  score's line is **queued and played after** the current finishes (NOT interrupted), and (c) if two
  scores arrive during playback, only the **latest** is spoken next.
- `aiPep.js`: with `callAPI`/fetch stubbed to return a duplicate once then a fresh line, assert
  `generateLine` returns the fresh line (no silent null); assert `buildUserMessage` includes the
  rivalry line when `ctx.rivalry` is set, and a last-turn note when `ctx.scorerLastTurn` is set.
- `commentaryContext.js`: `rivalryDigest` over a small `computeStats`-shaped fixture returns the right
  record / leader / streak / averages; `buildContext` sets `scorerLastTurn` when the scorer has one
  box left.

Then report the diff + `npx vitest run`, and stop.
