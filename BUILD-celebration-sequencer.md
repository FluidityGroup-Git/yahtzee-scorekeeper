# Build: Score-moment sequencer + full-canvas celebration layer

**Role note for Claude Code:** you build the app in this repo ONLY (working dir `\\FG-ROG\Yahtzee game`
= `C:\Yahtzee game`). This is ONE build, after the center-stage popout commit. Touch: NEW
`src/ui/celebration.js`, NEW `src/ui/celebration.css`, EDIT `index.html`, EDIT `src/ui/commentary.js`,
EDIT the sound module (`SoundEngine`), EDIT `src/main.js`, and add SFX prompts to the existing
gen-sounds script. Add tests. Report the diff + `npx vitest run`, then stop. Do NOT touch the
responsive phone layout.

## The problem
On a score, the SFX, the mascot animation, and the AI voice all fire at once - a muddle. We want a
defined order, plus a bigger full-screen celebration for the marquee moments.

The rule, stated simply: **on a score, play the matching sound immediately and start the animation at
the same time; hold the AI voice until the sound finishes, then speak; the animation stays on screen.**
Generate the commentary in parallel while the sound plays, so the AI latency hides behind the sound.

## Part A - Ordering (the sequencer)

### A1. `src/ui/commentary.js` - let the voice wait for a gate
- Add an optional `gateSpeak` (a Promise) to `Commentary.react(ctx, { gateSpeak } = {})`. Everything
  stays the same - generate the line, show the caption immediately, synthesize the voice - but right
  before the audio is handed to the playback gate (`enqueue`), `await gateSpeak` if it was provided.
  So the caption and the synth happen instantly (latency hidden behind the sound), and the spoken audio
  only begins once the sound has finished.
- If `gateSpeak` is absent, behave exactly as today. Wrap the await in try/catch (a rejection should
  just proceed). Re-check the supersede guard after the await: if `my !== token` (a newer score landed
  while waiting), drop the line as usual.

### A2. The sound module (`SoundEngine`) - a matched sound that resolves when it ends
- Match the module's actual structure (it currently exposes `SoundEngine.play(name)` and there is a
  `soundOn` flag). Add `playMatched(name)` (or extend `play`) that plays the SFX and **returns a Promise
  that resolves when the audio ENDS** - listen for the HTMLAudio `ended` event (or use the decoded
  buffer duration), with a safety timeout (~ the clip duration + 300ms, capped ~3000ms) so it always
  resolves. If `soundOn` is false, or the named sound is missing, **resolve immediately** so the voice
  is never blocked.
- Add a moment->sound map (see Part C for the names/prompts). Use existing sounds where you have them;
  fall back to the closest existing sound or a short generic blip if a matched file isn't present yet.

### A3. `src/main.js` - the sequencer (`fireMoment`)
- In `recordEntry`, for a NEW score, replace the current parallel `fireCommentary(...)` +
  `fireMascots(...)` calls with one orchestrated flow:
```js
const m = momentFor(p, k, value, leadBefore, crossedBonus);     // { event, sfx, celebrate }
const soundDone = soundOn ? SoundEngine.playMatched(m.sfx) : Promise.resolve();
if (m.celebrate) Celebration.play(m.celebrate, { seat: p });    // full-canvas, marquee moments only
Mascots.react(m.event, { seat: p, level: maxSavagery });
fireCommentary(ctx, { gateSpeak: soundDone });                  // generate now, speak after the sound
```
- `momentFor(...)` is a small PURE helper that mirrors the existing mascot event priority
  (`bonusYahtzee > yahtzee > scratch > takeLead > upperBonus > goodScore`) and ALSO returns:
  - `sfx`: the sound name for that moment (matched for big moments, a generic blip for a plain score).
  - `celebrate`: the full-canvas celebration type, set ONLY for the marquee moments
    (`yahtzee`, `bonusYahtzee`, `winGame`); `null` otherwise - so the big spectacle stays special.
- `onGameOver`: same shape - play the win/lose SFX, fire `Celebration.play('winGame', { seat: wp })` for
  the winner (or nothing for a tie), `Mascots.react(...)`, and gate the closing line's voice behind the
  win SFX.
- Keep the last-turn toast + cue as-is. Keep `Mascots.reset()` / new `Celebration.reset()` on new game
  and hydrate.

## Part B - Full-canvas celebration layer
A new layer, separate from the character stage, that fills the screen with striking, colourful FX on
the marquee moments. The character still pops on the mascot stage; THIS is the big backdrop spectacle.

### B1. Files + mount
- NEW `src/ui/celebration.js` and `src/ui/celebration.css`.
- `index.html`: add `<div id="celebration-layer" aria-hidden="true"><canvas id="celebration-canvas"></canvas></div>`
  (or have celebration.js create it). `position: fixed`, full-screen, `pointer-events: none`, z-index
  ABOVE the board but BELOW the mascot character stage and captions/modals. Hidden by default.

### B2. API
- `Celebration.mount()` - adopt/create the layer; size the canvas to the viewport, honouring
  `devicePixelRatio`, and re-size on `resize`.
- `Celebration.play(type, { seat } = {})` - `type` is one of `yahtzee`, `bonusYahtzee`, `winGame`. Show
  the layer, run the FX for ~3-4s, then fade out and clear. A new `play` replaces the current one.
- `Celebration.reset()` - clear immediately and stop the canvas loop.

### B3. What it renders (sharp, vivid, full-canvas)
1. **Sunburst rays (CSS)** - a large rotating `conic-gradient` pinwheel behind everything, low opacity
   (~.24), the scorer's accent (Dan blue / Amber coral) leading the palette. Example:
```css
.cel-rays{position:absolute;left:50%;top:54%;width:180vmax;height:180vmax;transform:translate(-50%,-50%);
  border-radius:50%;opacity:.24;animation:cel-spin 20s linear infinite;
  background:conic-gradient(from 0deg,#FF5A47 0 13deg,transparent 13deg 45deg,#FFC83D 45deg 58deg,
    transparent 58deg 90deg,#4A90D9 90deg 103deg,transparent 103deg 135deg,#4CC38A 135deg 148deg,
    transparent 148deg 180deg,#ED6A92 180deg 193deg,transparent 193deg 225deg,#7F77DD 225deg 238deg,
    transparent 238deg 270deg,#FF8A3D 270deg 283deg,transparent 283deg 315deg,#4A90D9 315deg 328deg,
    transparent 328deg 360deg)}
@keyframes cel-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
```
2. **Big typographic title slam (CSS)** - the moment's word: `yahtzee -> "YAHTZEE!"`,
   `bonusYahtzee -> "+100!"`, `winGame -> "WINNER!"`. Multi-colour bold letters, thick dark outline
   (`-webkit-text-stroke: 4px #14111f`) + a drop shadow, slamming in with an overshoot then a gentle
   float. Example timing:
```css
.cel-title{position:absolute;left:50%;top:16%;transform:translate(-50%,-50%);font-weight:900;
  font-size:clamp(48px,12vw,170px);letter-spacing:3px;-webkit-text-stroke:4px #14111f;
  text-shadow:0 8px 0 rgba(0,0,0,.4);white-space:nowrap;
  animation:cel-slam .9s cubic-bezier(.2,1.4,.3,1) both, cel-float 2.4s ease-in-out .9s infinite}
@keyframes cel-slam{0%{transform:translate(-50%,-50%) scale(2.6) rotate(-8deg);opacity:0}
  60%{opacity:1}75%{transform:translate(-50%,-50%) scale(.94) rotate(2deg)}
  100%{transform:translate(-50%,-50%) scale(1) rotate(0);opacity:1}}
@keyframes cel-float{0%,100%{transform:translate(-50%,-50%) scale(1) rotate(-1deg)}
  50%{transform:translate(-50%,-52%) scale(1.03) rotate(1deg)}}
```
   Per-letter colours from the palette below.
3. **Canvas confetti storm (the dense part - this is why we add a canvas)** - a small self-contained
   particle engine drawing to `#celebration-canvas`. This is the GPU-cheap way to get hundreds of crisp
   particles that SVG/CSS can't. See B4.
4. **Sparkles (CSS/SVG)** - a handful of twinkles scattered over the screen.
- Palette (vibrant): `#FF5A47` `#4A90D9` `#FFC83D` `#ED6A92` `#7F77DD` `#4CC38A` `#FF8A3D` (+ white).

### B4. The canvas particle engine (dependency-free, ~150-200 lines)
- Particle shape: `{ x, y, vx, vy, rot, vr, w, h, color, life, ttl }`.
- On `play`: spawn ~140-220 particles from the centre (and/or two bottom-corner cannons) - random angle
  + speed -> `vx, vy`; random size, colour, rotation speed; `ttl` ~ 60-140 frames.
- rAF loop: clear the canvas; for each particle apply gravity (`vy += G`), integrate position, advance
  rotation, decrement `life`; draw a rotated filled rect (`save/translate/rotate/fillRect/restore`),
  fading alpha as `life` approaches 0; cull dead particles. Stop the loop when none remain (or after
  ~4s), then fade the layer out.
- Size the canvas for `devicePixelRatio` (scale the context) so the confetti is crisp on HiDPI.

### B5. Reduced motion + marquee-only
- `prefers-reduced-motion: reduce` -> skip the spin and the canvas storm; show just the title (or
  nothing). The decision lives in a small helper so it is testable.
- The full-canvas celebration fires ONLY for `yahtzee`, `bonusYahtzee`, `winGame`. It fires on a NEW
  entry, never on edits (the existing flow already only fires on new scores), so a category is never
  celebrated twice - the multi-Yahtzee bonus is the intended repeat. (Per-combination gating for the
  future Bluetooth-dice auto-trigger - "do not replay a category's celebration unless it is Yahtzee" -
  belongs to the dice integration; nothing needed now.)

## Part C - Matched SFX (generation)
Add prompts for these to the existing gen-sounds script (run once with the ElevenLabs key to bake them
into `public/sounds`), and map them in the SoundEngine. The sequencer MUST work even if a file is not
generated yet (missing -> `playMatched` resolves immediately or plays the closest existing sound):
- `yahtzee`: triumphant short brass fanfare, celebratory, 1.5s
- `bonusYahtzee`: bigger explosive victory fanfare with a sparkle, 2s
- `scratch`: comedic sad trombone womp-womp, 1.2s
- `takeLead`: quick rising whoosh sting, confident, 0.8s
- `lastTurn`: tense ticking riser, suspense, 1.2s
- `upperBonus`: bright coin ka-ching sparkle, 0.8s
- `winGame`: celebratory win jingle, warm, 2s
- `loseGame`: gentle descending defeat tone, 1.2s
- `goodScore` / default: soft pleasant UI blip, 0.4s

## Tests (keep every existing test green)
- Pure `momentFor(...)`: asserts the right `{ event, sfx, celebrate }` per case - yahtzee / bonus /
  scratch / takeLead / upperBonus / goodScore - and that `celebrate` is set ONLY for the marquee moments.
- `commentary.js` `gateSpeak`: with fake deps and a `gateSpeak` promise you control, assert the voice
  does NOT play until the promise resolves, the caption/synth happen before it resolves, and a
  superseding score during the wait drops the line.
- `celebration.js` (jsdom): `play('yahtzee')` shows the layer and starts the canvas loop; `reset` clears
  it and stops the loop; the reduced-motion path skips the storm.

Report the diff + `npx vitest run`, then stop.
