# Build: Center-stage reaction popout + bolder persona

**Role note for Claude Code:** you build the app in this repo. This is ONE build, AFTER the previous
mascots commit (it reworks that feature). Touch: `src/ui/mascots.js` (rework), `src/ui/mascots.css`
(rework), `index.html` (remove the two board-side slots; add one stage container), `src/main.js`
(mount the stage, wire voice-end dismiss, single react call), `src/ui/commentary.js` (emit a line-end
callback), `src/ui/aiPep.js` (bolder persona), `tests/mascots.test.js` (update for the new API). Report
the diff + `npx vitest run`, then stop. Do NOT touch the responsive phone layout.

## What's wrong now / what we want
The current mascots idle on the board and cover Amber's score column, and the reactions barely read.
Replace that entirely:
- NO idle avatars on the board.
- A single FULL-SCREEN CENTER STAGE, hidden by default.
- On a reaction the character POPS big in the middle of the screen (springs/scales in, spins,
  confetti, etc.) at high resolution, holds, and then dismisses on **the next mouse move** OR **when the
  AI voice line ends** (whichever first), with a max-hold fallback so it never sticks.
- The stage has `pointer-events: none` so clicks pass through and the game stays live underneath.
- On the spicy moments the OPPONENT crashes the shot: a corner cackle on a scratch, a jealous side-eye
  on the other's Yahtzee/bonus, a double-take when overtaken; at game over the winner is centre-stage
  with the loser slumped in the corner.

## Files
- REWORK `src/ui/mascots.js` — single center stage; `mount` / `react` / `dismiss` / `reset`; keep the
  pure `reactionFor`; keep the two character SVGs (present them big/centred, with an opponent cameo).
- REWORK `src/ui/mascots.css` — full-screen stage + dim backdrop, large character, big reaction
  keyframes, scaled-up effects, corner cameo slot, reduced-motion.
- EDIT `index.html` — remove the two `.mascot-slot` divs; add one `#mascot-stage` container.
- EDIT `src/main.js` — mount the stage once; one `Mascots.react(...)` per moment; wire voice-end
  dismiss; keep `reset` on new game / hydrate; drop `#mascot0/#mascot1`.
- EDIT `src/ui/commentary.js` — call an injected `onLineEnd()` when a spoken line ENDS.
- EDIT `src/ui/aiPep.js` — bolder/weirder/savage/mock-political persona (guardrails intact).
- EDIT `tests/mascots.test.js` — update for the new single-stage API.

## 1) `src/ui/mascots.js` rework
- Remove all per-seat idle mounting. Keep the two character SVG strings (Dan = seat 0, Amber = seat 1)
  exactly as they are — only the presentation changes.
- Keep the pure exported `reactionFor(event, level, reduced)` returning the descriptor `{cls, effects, hold}`
  (unit-tested, no DOM). You may add to it but keep it pure.
- `Mascots.mount(stageEl)` — adopt the given `#mascot-stage` element (or create one and append to
  `document.body` if none). It stays hidden until a reaction. Store it.
- `Mascots.react(event, { seat, level })` — ONE call per moment (main no longer fires a separate
  opponent reaction):
  1. Compute the descriptor via `reactionFor(event, level, reducedMotion())`.
  2. Render the scorer's character (`SVG[seat]`) LARGE and centred in the stage; apply the reaction
     class; spawn the effects (scaled up). Show the stage (fade/scale in — the "pop").
  3. Opponent cameo (skip under reduced motion): for `scratch` show the opponent small in a corner
     cackling (`rx-laugh`); for `yahtzee`/`bonusYahtzee` a jealous side-eye; for `takeLead` the
     overtaken double-take (`rx-loselead`). For `winGame`/`tie` render BOTH — winner/centre, loser or
     the other corner — as a small tableau.
  4. Arm dismissal (whichever fires first): a ONE-SHOT `mousemove` + `pointerdown` + `keydown` window
     listener -> `dismiss()`; a max-hold `setTimeout` (~ descriptor.hold + 2500ms, capped ~9000ms) ->
     `dismiss()`; and the externally-driven `Mascots.dismiss()` (wired to the AI voice end, section 4/5).
  5. A new `react()` replaces the current pop (clear the old one first; newest wins).
- `Mascots.dismiss()` — fade the stage out, clear its contents, remove the one-shot listeners and the
  max-hold timer. Safe to call when nothing is showing.
- `Mascots.reset()` — `dismiss()` immediately (new game / hydrate).
- Effects (confetti, stars, crown, sweat, raincloud, sparkle, trophy, fireworks) stay inline-SVG/CSS
  and self-remove on `animationend` + safety timeout (no leaks), now sized for the big stage.
- Reduced motion: pop in with a simple fade (no spin / no particles / no opponent cameo), shorter hold.

## 2) `src/ui/mascots.css` rework
- `.mascot-stage`: `position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;`
  `pointer-events: none;` z-index above the board surface but below modals/captions. Hidden by default
  (`opacity: 0; visibility: hidden`); a `.show` class fades it in.
- Dim backdrop: a subtle translucent radial vignette behind the character (e.g.
  `radial-gradient(circle at 50% 44%, rgba(60,46,92,.20), rgba(10,8,18,.55))`) so the character pops;
  fades with the stage. Keep it subtle — the game must still be visible through it.
- `.mascot` in the stage: large and responsive, e.g. `width: clamp(280px, 38vw, 460px); height: auto;`
  crisp SVG.
- The "pop" entrance: scale from 0 with a quick 360 spin and a slight overshoot, then settle (see the
  prototype values: 0% scale(0); ~9% scale(1.16) rotate(360deg); ~20% scale(1); hold; exit scale(0)).
  Give each reaction its own keyframe (yahtzee spin+confetti, bonus crown+fireworks, scratch wilt+sweat,
  takeLead smug tongue-out, loseLead double-take, lastTurn nervous wobble, win trophy dance, lose slump).
- Effect particles scaled up for the big stage; corner cameo slot (e.g. bottom-left/right, ~120px) for
  the opponent.
- `prefers-reduced-motion: reduce` block: stage just fades (no transforms/particles), no backdrop motion.
- GPU transforms only (translate/scale/rotate/opacity). No animating layout.

## 3) `index.html`
- REMOVE the two `<div class="mascot-slot" id="mascot0/1">` elements from the `.ppanel`s (they are the
  thing covering Amber's score).
- ADD a single stage container just before `</body>`:
  `<div id="mascot-stage" class="mascot-stage" aria-hidden="true"></div>`
- Do not change any other ids/classes the app/tests rely on.

## 4) `src/main.js`
- Mount once on boot: `Mascots.mount(document.getElementById('mascot-stage'))`. Remove the old
  `seat0El/seat1El` mount and any `#mascot0/#mascot1` references.
- `fireMascots(...)` keeps deriving the event (same priority: bonusYahtzee > yahtzee > scratch >
  takeLead > upperBonus > goodScore) but now calls `Mascots.react(ev, { seat: p, level })` ONCE — DELETE
  the separate opponent `react('opponentLaugh'...)` / `react('loseLead'...)` calls (the stage renders the
  opponent cameo internally).
- `onGameOver`: call `Mascots.react('winGame', { seat: wp, level })` once for a decided game (the stage
  shows the loser in the corner), or `Mascots.react('tie', { seat: 0, level })` for a tie (stage shows
  both). DELETE the separate `loseGame` call.
- Wire the voice-end dismiss in the `Commentary.configure({...})` deps: add
  `onLineEnd: () => Mascots.dismiss(),`.
- Keep `Mascots.reset()` in `startGame` and `hydrateSaved`.

## 5) `src/ui/commentary.js`
- In `utterOnce`, when the spoken line actually ENDS, call the injected `cfg.onLineEnd` (if present)
  right after `settle()` resolves — i.e. fire it from the same `settle` path that runs on audio `ended`
  / speech `end`. This is what lets the centre-stage pop dismiss in sync with the AI voice.
- It must fire once per finished line, and must NOT fire on `cancel()`/`stopVoice()` (a deliberate stop
  clears the gate without an `onLineEnd`). Guard so a single line never double-fires it.

## 6) `src/ui/aiPep.js` — bolder, weirder, funnier persona
Replace the `SYSTEM` array with the version below. It pushes an unhinged insult-comic / cable-news-pundit
voice — confident fake stats, conspiracy energy, mock-political attack-ad bombast, wild tangents — while
keeping the hard guardrails. **Keep the HARD RULES line EXACTLY as written.** Note "political" is a
comedic STYLE about the game and these two players only, never real-world partisanship and never real
people or groups.
```js
const SYSTEM = [
  'You are the live commentator for a fast, friendly two-player Yahtzee game between Dan and Amber, but you are UNHINGED: an insult-comic-meets-cable-news-pundit who treats every dice roll like a breaking national scandal. Be genuinely, weirdly funny.',
  'React to the score you are told about. Roast EITHER player hard as the moment demands, and take a side with total confidence. Go for the biggest laugh: surprise, absurd specificity, a savage turn of phrase. Land a real joke, never a generic insult.',
  'Each line gets a random DELIVERY PERSONA and a SENTENCE SHAPE. Commit completely and lean in hard; they are your engine of variety, so never settle into one recognizable house voice.',
  'Be bold and weird: invent confident fake statistics, spin conspiracy theories about their dice, deliver mock-political attack-ad bombast and pundit ranting, take wild tangents, escalate into absurdity. "Political" is a comedic STYLE only (attack-ad / pundit theater) about the GAME and these two players, never real-world partisanship and never real people or groups.',
  'Build the joke out of the SPECIFIC situation (the exact number, the box they torched, the gap, a cold streak) then twist it: an unexpected comparison, a vivid image, misdirection, a little wordplay. Do not flatly recite the stats.',
  'Craft matters: keep it tight, cut filler, put the funniest word last. Vary length wildly, from a three-word verdict to one full unhinged sentence.',
  'Do NOT reuse a joke, comparison, metaphor, or punchline structure from the recent lines you are shown; find a genuinely different angle each time. You MAY call back to an earlier bit only if the callback itself is the joke.',
  'When given RIVALRY HISTORY, weaponize it for extra sting or a callback (a losing streak, a personal best they are nowhere near, how last game went) but only when it sharpens the joke; never just recite it.',
  'When told it is a players LAST TURN, treat it as a final-box moment: crank the tension or mock the pressure mercilessly.',
  'You may use at most one or two ElevenLabs v3 performance tags in square brackets, e.g. [dryly], [gleeful], [low], [laughs], [yelling], to color delivery.',
  'SAVAGERY LADDER (you will be told the level, 1 to 5): L1 cheeky and light. L2 sharper sarcasm. L3 gallows humor. L4 properly savage. L5 peak comedic cruelty, but funny first, cruel second.',
  'HARD RULES at EVERY level: no slurs; nothing about protected characteristics (race, gender, religion, orientation, disability); no jabs at appearance, weight, or real insecurities; no sexual content. Roast their Yahtzee play and competence only, affection underneath.',
  'Output ONE spoken line (occasionally two short ones for a big moment). No emoji, no stage directions in parentheses, no quotation marks around the line.',
].join(' ');
```
- ADD these edgier delivery personas to the existing `ANGLES` array (keep all the current ones):
  `'a mudslinging attack-ad narrator'`, `'a doomsday street preacher'`, `'a supermarket-tabloid headline writer'`,
  `'a washed-up cable-news pundit'`, `'an insult comic working a hostile room'`.
- Savagery: leave the `savageryLevel(...)` mapping as-is (so its unit test stays valid). The new SYSTEM
  makes the voice bold and weird at every level; the existing savagery slider in settings still governs
  how cruel it gets, and the user can max it. (If you do change the ramp, update its test.)
- Everything else in aiPep.js (retry-on-duplicate, RECENT_MAX, max_tokens, rivalry/last-turn threading)
  stays exactly as it is.

## 7) Tests (`tests/mascots.test.js` — update; keep every other test green)
- Keep the pure `reactionFor` tests (mapping, level escalation, taunt at >=4, reduced-motion minimal).
- Replace the old per-seat mount assertions with the new single-stage API:
  - `mount(stageEl)` adopts the stage; nothing is shown until a reaction.
  - `react('yahtzee', { seat: 1 })` shows the stage (`.show`/visible), injects Amber's character with the
    reaction class, and spawns at least one effect node.
  - `dismiss()` hides/empties the stage and clears it.
  - reduced-motion path: `react(...)` shows a minimal pop (no particle nodes, no opponent cameo).
- Existing commentary/aiPep/etc. tests must stay green; if adding `onLineEnd` needs a tweak to a
  commentary test, keep the intent.

Report the diff + `npx vitest run`, then stop.
