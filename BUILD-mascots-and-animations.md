# Build: Character mascots + game-event animations

**Role note for Claude Code:** you build the app in this repo. Run this build ONLY after the
commentary/last-turn build (`BUILD-commentary-refinement.md`) is committed — both touch `src/main.js`
and styling, so they must not overlap. When done, report the diff + `npx vitest run`, then stop for
verification. Do NOT start the responsive phone layout.

## Concept
Two dice-mascot avatars — **Dan** (blue) and **Amber** (coral) — mount one beside each player and
react to game events with cheeky, affectionate animations. They idle (gentle bob + blink) between
turns and perform reactions on good scores, Yahtzees, scratches, lead changes, the last turn, and
game over. Cheekiness scales with the existing savagery cap. All hand-coded SVG + CSS; reduced-motion
aware; no images, no libraries.

These are FIXED designs — reproduce the SVGs in section 1 exactly. Non-negotiable details:
**Amber has a visible gap between her two front teeth** whenever she grins; **Dan has glasses, a
greying (salt-and-pepper) beard, and side-parted greying hair**. Dan = blue (#4A90D9), Amber = coral
(#F2895C), matching the board.

## Files
- NEW `src/ui/mascots.js` — renders the two characters, owns reaction logic, exposes `mount` / `react` / `reset`.
- NEW `src/ui/mascots.css` — character + reaction keyframes (load it the same way other UI CSS is loaded).
- EDIT `src/main.js` — mount the mascots; call `Mascots.react(...)` at the same points commentary fires.
- EDIT the board markup (wherever the two player sections / HUD live) — add one mount container per player.
- NEW `tests/mascots.test.js` — event→reaction mapping (pure) + a jsdom mount/react test.

## 1) The characters (reproduce these SVGs exactly)
Base faces with idle bob + blink (+ Amber bow sway). Reaction effects (section 4) are LAYERED on top
by adding classes / transient nodes — do not alter these base shapes. Lift the `<style>` keyframes
into `mascots.css` and parametrise per-mascot; the inline `<style>` here is just so the idle behaviour
is unambiguous.

### Amber (coral, gap-tooth grin — the gap is mandatory)
```html
<svg class="mascot mascot-amber" width="210" height="220" viewBox="0 0 210 220" role="img" aria-label="Amber">
  <style>
    .mascot-amber{animation:m-bob 1.5s ease-in-out infinite}
    .mascot-amber .eye{animation:m-blink 3.4s infinite;transform-origin:center;transform-box:fill-box}
    .mascot-amber .bow{animation:m-sway 2.2s ease-in-out infinite;transform-origin:50% 80%;transform-box:fill-box}
    .mascot-amber .arm{animation:m-wave 1.3s ease-in-out infinite;transform-origin:50% 0;transform-box:fill-box}
    @keyframes m-bob{0%,100%{transform:translateY(2px)}50%{transform:translateY(-11px)}}
    @keyframes m-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
    @keyframes m-sway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
    @keyframes m-wave{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(-24deg)}}
  </style>
  <g class="arm"><rect x="40" y="92" width="14" height="42" rx="7" fill="#F2895C" stroke="#C8521F" stroke-width="2.5"/></g>
  <rect x="156" y="92" width="14" height="42" rx="7" fill="#F2895C" stroke="#C8521F" stroke-width="2.5"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="#F2895C"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="none" stroke="#C8521F" stroke-width="3.5"/>
  <g class="bow">
    <path d="M105 60 L83 50 Q75 60 83 70 Z" fill="#ED6A92" stroke="#C8455F" stroke-width="2.2"/>
    <path d="M105 60 L127 50 Q135 60 127 70 Z" fill="#ED6A92" stroke="#C8455F" stroke-width="2.2"/>
    <rect x="99" y="54" width="12" height="14" rx="4" fill="#D8517B" stroke="#C8455F" stroke-width="2"/>
  </g>
  <circle cx="71" cy="138" r="9" fill="#F48FB1" opacity=".6"/>
  <circle cx="139" cy="138" r="9" fill="#F48FB1" opacity=".6"/>
  <g class="eye">
    <ellipse cx="84" cy="110" rx="8" ry="11.5" fill="#fff"/>
    <circle cx="84" cy="112" r="5" fill="#3A1F12"/><circle cx="86" cy="108" r="1.8" fill="#fff"/>
    <path d="M75 101 L69 95 M78 99 L74 92 M82 98 L80 90" stroke="#3A1F12" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  </g>
  <g class="eye" style="animation-delay:.05s">
    <ellipse cx="126" cy="110" rx="8" ry="11.5" fill="#fff"/>
    <circle cx="126" cy="112" r="5" fill="#3A1F12"/><circle cx="128" cy="108" r="1.8" fill="#fff"/>
    <path d="M135 101 L141 95 M132 99 L136 92 M128 98 L130 90" stroke="#3A1F12" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  </g>
  <path d="M76 135 Q105 126 134 135 L129 146 Q105 172 81 146 Z" fill="#5E2A18"/>
  <rect x="78" y="133" width="54" height="13" rx="4" fill="#FFF7EF"/>
  <rect x="92" y="133" width="2" height="13" fill="#E7D9CC"/>
  <rect x="116" y="133" width="2" height="13" fill="#E7D9CC"/>
  <rect x="102.5" y="133" width="5" height="13" fill="#5E2A18"/>
  <path d="M76 135 Q105 126 134 135" fill="none" stroke="#E8607A" stroke-width="5" stroke-linecap="round"/>
  <path d="M81 146 Q105 172 129 146" fill="none" stroke="#E8607A" stroke-width="6.5" stroke-linecap="round"/>
</svg>
```
### Dan (blue — glasses, greying beard, side-parted greying hair; wink + tongue)
```html
<svg class="mascot mascot-dan" width="210" height="220" viewBox="0 0 210 220" role="img" aria-label="Dan">
  <style>
    .mascot-dan{animation:m-bob 1.5s ease-in-out infinite}
    .mascot-dan .eye{animation:m-blink 3.6s infinite;transform-origin:center;transform-box:fill-box}
    .mascot-dan .tongue{animation:m-wig 1.1s ease-in-out infinite;transform-origin:50% 0;transform-box:fill-box}
    .mascot-dan .arm{animation:m-wave 1.3s ease-in-out infinite;transform-origin:50% 0;transform-box:fill-box}
    @keyframes m-wig{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
  </style>
  <g class="arm"><rect x="40" y="92" width="14" height="42" rx="7" fill="#4A90D9" stroke="#1F5FA5" stroke-width="2.5"/></g>
  <rect x="156" y="92" width="14" height="42" rx="7" fill="#4A90D9" stroke="#1F5FA5" stroke-width="2.5"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="#4A90D9"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="none" stroke="#1F5FA5" stroke-width="3.5"/>
  <path d="M58 130 Q56 154 76 167 Q90 176 105 176 Q120 176 134 167 Q154 154 152 130 Q148 149 130 157 Q118 164 105 164 Q92 164 80 157 Q62 149 58 130 Z" fill="#C3C7CD" stroke="#9AA0A8" stroke-width="1.5"/>
  <path d="M70 150 Q74 160 82 165 M138 150 Q134 160 126 165 M96 162 L96 170 M114 162 L114 170" stroke="#9AA0A8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M84 156 Q88 162 92 165 M126 156 Q122 162 118 165" stroke="#70707A" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>
  <circle cx="70" cy="122" r="7" fill="#ED9A9A" opacity=".4"/>
  <circle cx="140" cy="122" r="7" fill="#ED9A9A" opacity=".4"/>
  <path d="M50 96 Q46 62 105 56 Q164 62 160 96 Q150 84 128 86 Q120 72 113 86 Q108 94 100 88 Q78 82 66 88 Q56 92 50 96 Z" fill="#6B5E54" stroke="#463D36" stroke-width="2"/>
  <path d="M118 85 Q122 72 127 60" stroke="#463D36" stroke-width="2.5" fill="none"/>
  <path d="M66 87 Q82 80 100 85 M126 86 Q140 82 152 90" stroke="#A89F95" stroke-width="1.8" fill="none" opacity=".7"/>
  <g class="eye"><ellipse cx="85" cy="109" rx="7.5" ry="10" fill="#fff"/><circle cx="85" cy="111" r="4.5" fill="#26190E"/><circle cx="87" cy="108" r="1.7" fill="#fff"/></g>
  <path d="M118 109 Q125 116 132 109" fill="none" stroke="#26190E" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="70" y="96" width="30" height="26" rx="10" fill="none" stroke="#33343A" stroke-width="3"/>
  <rect x="110" y="96" width="30" height="26" rx="10" fill="none" stroke="#33343A" stroke-width="3"/>
  <path d="M100 104 Q105 101 110 104" fill="none" stroke="#33343A" stroke-width="3"/>
  <path d="M70 104 L54 101 M140 104 L156 101" stroke="#33343A" stroke-width="3" stroke-linecap="round"/>
  <path d="M76 100 L84 114 M116 100 L124 114" stroke="#fff" stroke-width="2" opacity=".22"/>
  <path d="M90 138 Q105 132 120 138 Q116 150 105 150 Q94 150 90 138 Z" fill="#5E2A18"/>
  <g class="tongue"><rect x="98" y="144" width="15" height="16" rx="7" fill="#E8607A"/><line x1="105.5" y1="147" x2="105.5" y2="157" stroke="#C8455F" stroke-width="1.5"/></g>
  <path d="M86 135 Q96 131 104 135 M106 135 Q114 131 124 135" stroke="#B8BCC2" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>
```
Note: the wink + tongue is Dan's IDLE/cheeky resting face. For neutral moments you may swap the wink
for a second open `.eye` (mirror of the left) and hide the tongue — your call — but keep glasses,
beard, and hair always on.

## 2) Module API (`src/ui/mascots.js`)
```
Mascots.mount({ seat0El, seat1El })   // inject the two SVGs into the per-player containers, start idle
Mascots.react(event, { seat, level }) // play a reaction on that player's mascot (returns nothing)
Mascots.reset()                       // all mascots back to idle (call on new game / hydrate)
```
- `event` is one of: `goodScore`, `yahtzee`, `bonusYahtzee`, `scratch`, `takeLead`, `loseLead`,
  `lastTurn`, `upperBonus`, `winGame`, `loseGame`, `opponentLaugh`, `tie`.
- `seat` = 0 (Dan) or 1 (Amber). For paired reactions (a scratch makes the scorer wilt AND the
  opponent cackle), either handle the opponent inside `react` or let main call
  `react('opponentLaugh', { seat: opponentSeat })`. Your choice — keep it simple and documented.
- `level` = the current savagery cap (1–5). Higher = more exaggerated and cheekier (bigger taunt,
  tongue-out, wiggle, longer hold). At level 1 keep reactions sweet and small.
- Keep the event→reaction decision in a PURE exported helper (e.g. `reactionFor(event, level, reduced)`)
  that returns a descriptor (class name(s) + which transient effects to spawn) so it can be unit-tested
  without the DOM. `react()` then applies that descriptor to the mounted SVG.
- Each transient effect node (confetti, crown, sweat drop, rain cloud, trophy, eye-stars) is removed on
  `animationend`; the reaction class is removed when it finishes so the mascot returns to idle. Reactions
  are time-boxed (~1–2.5s).

## 3) Mount + layout
- Add ONE container per player near their section — in the landscape HUD or beside each player's
  section header. Modest size (~96–120px). `pointer-events: none`. Positioned so they NEVER cover
  tappable score cells. z-index above the board surface, below modals/captions.
- Reserve space / absolutely position so mounting causes NO layout shift of the board.
- Wrap each container in the existing responsive wrapper so the not-yet-built phone layout can hide or
  shrink them later without breaking. On very narrow widths they may hide entirely.
- Tint each container with its player accent (Dan blue / Amber coral) to tie them to their side.

## 4) Reaction catalog (cheeky and affectionate — funny first, never crude)
Craft the keyframes yourself; these are the intended vibes. Each maps to a signal already available
where commentary fires.
- **goodScore** (a solid non-zero score): happy bounce + a quick arm raise.
- **yahtzee** (yahtzee box = 50): the scorer's die spins 360, eyes pop to stars, mouth flies open,
  confetti burst. Opponent: a slow, jealous side-eye (`opponentLaugh` not needed here — use a side-eye).
- **bonusYahtzee** (yahtzeeBonus): bigger — a crown drops onto the head for ~1s, fireworks/confetti, a
  little victory shimmy.
- **scratch** (value 0): scorer deflates (squash), one sweat-drop, a wobble; opponent points and
  cackles (`opponentLaugh`) — this is where Amber's gap grin and Dan's tongue-out taunt shine.
- **takeLead** (this score flips who's ahead): new leader puffs up, smug, tongue out at the other;
  the overtaken mascot does a wide-eyed double-take (`loseLead`).
- **lastTurn** (scorer down to one box left): nervous wobble, bitten lip, darting eyes — pairs with the
  toast the commentary build already shows.
- **upperBonus** (just crossed the +35 threshold): a quick coin-flip "ka-ching" sparkle over the mascot.
- **winGame**: victory dance + a trophy pops up. **loseGame**: faceplant / slump under a tiny rain
  cloud, then peeks out for a rematch. **tie**: both shrug.
- **idle** (always on): gentle bob + blink; the occasional glance toward the other; Amber's bow sways.
- **Naughtiness dial**: scale the exaggeration, taunt frequency, and hold time by `level` (the
  maxSavagery cap). Sweet at 1, full cheek at 5 — flirty/playful, never crude.

## 5) Wiring (`src/main.js`)
- On boot/mount: `Mascots.mount({ seat0El, seat1El })`, then idle.
- In `recordEntry`, at the same place `fireCommentary` runs, derive the event from the same values and
  call `Mascots.react(...)` with the current savagery cap as `level`:
  - `category === 'yahtzeeBonus'` -> `bonusYahtzee` (seat = scorer).
  - `yahtzee` with value 50 -> `yahtzee` (scorer) + a side-eye on the opponent.
  - value 0 (scratch) -> `scratch` (scorer) + `opponentLaugh` (opponent).
  - lead flip (compare `leadBefore` sign vs the new lead sign, like commentary's comeback logic) ->
    `takeLead` (new leader) + `loseLead` (overtaken).
  - upper bonus just secured this score (scorer's upper crossed 63) -> `upperBonus` (scorer).
  - otherwise a decent non-zero score -> `goodScore` (scorer).
  - The last-turn transition you already compute (`filledBaseCount(...) === 12`, once per player) ->
    also `Mascots.react('lastTurn', { seat: i })`.
- In `onGameOver`: winner -> `winGame`, loser -> `loseGame` (a tie -> `tie` on both).
- `Mascots.reset()` in `startGame` and `hydrateSaved` (alongside the existing resets).
- Pick the reaction priority if several could fire on one score (e.g. a Yahtzee that also takes the
  lead): play the bigger one (Yahtzee/bonus > takeLead > upperBonus > goodScore).

## 6) Constraints
- `prefers-reduced-motion: reduce` -> minimal or no motion (a tiny static expression swap, or nothing).
  The pure `reactionFor(...)` helper must return the reduced descriptor when reduced motion is on.
- Transient effect nodes are removed on `animationend`; the reaction class clears when done; no leaks,
  no piled-up nodes after many turns.
- GPU-friendly transforms only (translate / scale / rotate / opacity). No layout-thrashing animations,
  no animating width/height/top/left of the board.
- Do NOT change existing DOM ids/classes the app and tests rely on (`.cell[data-key][data-p]`,
  `#tot`, `#meta`, `#statusLine`, `#device.turn-0/1`, etc.). Mascots are purely additive.
- No new dependencies. Keep total added weight small.

## 7) Tests (`tests/mascots.test.js`; keep all existing green)
- Pure: `reactionFor(event, level, reduced)` returns the expected descriptor — assert `yahtzee`,
  `scratch`, `takeLead`, `lastTurn`, `winGame`, `loseGame` each produce their class/effect set; assert
  higher `level` escalates; assert `reduced === true` yields the minimal descriptor.
- jsdom: `mount` injects two SVGs into the given containers; `react('yahtzee', { seat: 0 })` adds the
  expected reaction class / transient node to seat 0's mascot and NOT seat 1's; `reset` returns both to
  idle (no reaction classes / no leftover effect nodes).

Report the diff + `npx vitest run`, then stop.
