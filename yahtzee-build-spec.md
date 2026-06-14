# Yahtzee Scorekeeper — Build Spec

A build brief for **Claude Code**. Read this top to bottom, then build the app described.
A working UI mockup (`yahtzee-scorekeeper-v3.html`) accompanies this spec — treat it as the
**visual and interaction reference**. Port its look, layout, entry flow, sound engine, and
celebration system; this document defines the rules, data, and architecture around it.

---

## 1. What we're building

A **two-player Yahtzee scorekeeper** for a phone. Players roll **physical dice**; the app records
scores only — it is **not** a dice roller and does not evaluate dice.

Goals, in priority order:

1. Score a full 2-player game on a phone, with correct totals and our house rules.
2. **Persist everything** so a game survives refresh/close, and finished games are saved.
3. Record every score with its **order** and a **timestamp**, so per-player stats and later
   data mining / AI analysis are easy.
4. Be **installable** (Add to Home Screen) and work **offline** — Android first, iPhone later.
5. Be **fun**: rarity-scaled celebrations (animation + sound) keyed to how hard each score is.

Non-goals for v1: accounts, networking, more than two players, a dice roller.

---

## 2. Tech stack (chosen — don't substitute without asking)

- **Vite + vanilla JS** (no framework). Keep it light; the mockup is already vanilla.
- **vite-plugin-pwa** for the web app manifest + service worker (installable, offline app shell).
- **Dexie** (IndexedDB wrapper) for all local persistence. Do **not** use `localStorage` for game data.
- **Vitest** for unit tests on the scoring/rules logic.
- **No backend in v1.** But structure the data layer so a future **Supabase** sync can be bolted on
  (see §5 and §11).
- Self-host or system-fallback the fonts so the app works fully offline (the mockup loads Fredoka +
  Space Mono from Google Fonts — vendor them locally or fall back to system fonts).

If React is ever needed for the History/Stats screens it can be added later; **start vanilla**.

---

## 3. The game (rules) — implement exactly

### 3.1 Scorecard structure

**Upper section** (six categories): Aces, Twos, Threes, Fours, Fives, Sixes.
Each scores the sum of dice showing that face (entered as a count 0–5 × face value).

- **Upper subtotal** = sum of the six.
- **Upper bonus** = **+35** if subtotal **≥ 63**, else 0.
- **Upper total** = subtotal + bonus.

**Lower section**:

| Category | Value |
|---|---|
| Three of a Kind | sum of all 5 dice |
| Four of a Kind | sum of all 5 dice |
| Full House | 25 |
| Small Straight | 30 |
| Large Straight | 40 |
| Yahtzee | 50 |
| Chance | sum of all 5 dice |
| **Yahtzee Bonus** | +100 each (see house rule below) |

- **Lower total** = sum of lower categories (including Yahtzee Bonus).
- **Grand total** = upper total + lower total.

There are **13 base scoring boxes** per player (6 upper + 7 lower: three-of-a-kind,
four-of-a-kind, full house, small straight, large straight, yahtzee, chance). **Yahtzee Bonus is
NOT one of the 13** — it is a separate running bonus.

### 3.2 Scratching (zeroing a box)

A player who rolls nothing useful may **scratch** any open box for **0**. This must be an explicit,
one-tap action available on **every** category, including the upper section (not buried as "0 of
them"). A scratch:

- records a real entry with value `0` (with order + timestamp),
- **counts as that player's used turn**, and
- **passes control** to the other player.

### 3.3 House rule 1 — extra roll on the last turn

On a player's **final turn** (when they have **12 of 13** base boxes filled and one open box
remains), they get **4 physical rolls** instead of 3. Because dice are physical, the app does **not**
enforce or count rolls. It only **flags the final open box** visually (the mockup shows a striped,
gently pulsing cell) as a reminder. No roll counter anywhere.

### 3.4 House rule 2 — bonus Yahtzee grants a full extra turn

Standard sheets have one Yahtzee box (50). Each **additional** Yahtzee is recorded as **+100** via
the Yahtzee Bonus box. Crucially, ticking a bonus Yahtzee **does not fill one of the 13 boxes**, so
turn counts would drift out of sync.

**Our rule:** when a player records a bonus Yahtzee (+100), **control stays with that player**, and
they take a **whole extra turn** (fresh rolls) to put a score into one of their **open boxes**.
Filling that box then passes control. This re-evens the turn counts.

Implementation requirements:

- Recording a +100 in Yahtzee Bonus: keep `activePlayer` on that player; set a "make-up turn owed"
  state for them; show a banner prompting them to fill an open box to even up.
- The make-up is satisfied when that player next fills a **new base box** (any category, including a
  scratch). Only then does control pass.
- Handle **back-to-back** bonus Yahtzees: each +100 owes **one** make-up box.
- The make-up may go in **any open box** (no forced/Joker placement) unless §13 says otherwise —
  confirm with the product owner if unsure; default is "any open box."

### 3.5 Turn passing (general)

- Control passes **only when a new base box is filled** (first time). **Editing** an already-filled
  box must **not** pass the turn.
- Players may tap either column freely (it's a shared phone); `activePlayer` is the suggested
  next scorer and drives the status line and make-up logic.

### 3.6 Game over & winner

The game ends when **both players have all 13 base boxes filled** (Yahtzee Bonus optional). Compute
the winner by grand total; handle ties. On game over, finalize and save the game record (§5), show a
result, and offer **New game**.

---

## 4. Screens

1. **Game (scorecard)** — the primary screen. Port directly from the v3 mockup.
2. **History** — list of saved games (date, players, final scores, winner). Tap to view a read-only
   scorecard of that game.
3. **Stats** — per-player aggregates across all saved games (see §5.3).
4. **New game / players** — enter/edit the two player names, start a game. Reasonable to do this
   inline on the game screen (as the mockup does) rather than a separate screen.

Simple bottom nav or a menu to switch between Game / History / Stats.

---

## 5. Data model (this is the point of the app — get it right)

Use an **event-log shape: one row per score entry.** This is what makes mining and stats trivial.

### 5.1 Dexie schema (suggested)

```js
// db.js
import Dexie from 'dexie';
export const db = new Dexie('yahtzee');
db.version(1).stores({
  games:   '++id, startedAt, endedAt, status',          // status: 'active' | 'finished'
  players: '++id, name',                                 // optional global player identity for cross-game stats
  entries: '++id, gameId, playerId, category, orderIndex, recordedAt'
});
```

- `games` — one per game. Holds `players: [{playerId, name, seat}]`, `winnerPlayerId`,
  per-player `totals` snapshot at finish, `startedAt`, `endedAt`, `status`.
- `players` — optional, so "Player 1" can be a stable identity across games for lifetime stats.
  If you skip a global players table in v1, at least store a stable name/seat per game.
- `entries` — **one row per recorded score**, the mining feedstock:

```json
{
  "id": 412,
  "gameId": 17,
  "playerId": 3,
  "category": "largeStraight",
  "value": 40,
  "orderIndex": 9,
  "recordedAt": "2026-06-14T18:04:22.511Z"
}
```

`orderIndex` is a per-game counter incremented on each **new** entry (across both players), capturing
the true recording sequence. Edits update `value`/`recordedAt` but keep the original `orderIndex`.

### 5.2 Persistence behavior

- **Autosave** the active game continuously (every entry write goes to Dexie). On app load, **resume**
  the active game if one exists.
- On game over, set `status: 'finished'`, write `endedAt`, `winnerPlayerId`, and the totals snapshot.
- Provide **Export** (download the game, or all games, as JSON) — keep the existing "Data" panel from
  the mockup and back it with real Dexie data.

### 5.3 Stats to compute (per player, across finished games)

Win count / win rate; games played; average grand total; best game; average per category;
**Yahtzee rate** (games with ≥1 Yahtzee, and bonus Yahtzee counts); **upper-bonus rate** (how often
they hit ≥63); **scratch rate** and which categories they scratch most; average score by **order
position** (do early vs late entries differ?). All of these fall straight out of the entries log.

### 5.4 Future cloud sync (design for it, don't build it)

Keep all reads/writes behind a small data module (e.g. `db.js` functions like `saveEntry`,
`finishGame`, `listGames`, `getStats`). Later, a Supabase adapter can push finished games to a hosted
Postgres with the same `entries` shape for centralized mining. Don't implement now.

---

## 6. UI / UX spec

Mobile-first, ~400px column, large touch targets (≥44px). Reuse the mockup's structure:

- **Header:** wordmark, sound toggle, Data (export), New.
- **Players bar:** two cards with editable names, live grand total, "x / 13 boxes", active highlight.
- **Status line:** "🎲 {name}'s turn — tap a box to score," swapping to the yellow **bonus-Yahtzee
  make-up** banner when owed.
- **Scorecard:** Upper section, computed rows (Subtotal / Bonus / Upper total), Lower section,
  computed rows (Lower total / Grand total). Each cell shows its value plus a small **order badge**.
- **Bottom-sheet entry** (tap a cell): input type depends on category —
  - **count** (upper): buttons 0–5 showing resulting points, **plus an explicit "Scratch · 0"**.
  - **sum** (3/4-of-a-kind, chance): number pad 0–30, Save, **plus "Scratch · 0"**.
  - **fixed** (full house, straights, yahtzee): **Score X** / **Scratch · 0**.
  - **bonus** (yahtzee bonus): **Add +100** / **Reset · 0**.
  - Editing an existing entry offers **Clear**.

Keep the **visual identity** from the mockup: retro game-night — thick black outlines, hard offset
shadows, rounded Fredoka type, dotted "felt" background, player **blue** (`#2E7CF6`) and **coral**
(`#FF5A47`) identities, Space Mono for the score numerals. (Vendor the fonts locally for offline.)

Accessibility: visible keyboard focus, respect `prefers-reduced-motion` (disable shake/confetti/
toast animation), and don't rely on color alone (the order badge + active flag carry meaning too).

---

## 7. Celebrations + sound (rarity-scaled — a key feature)

Scale the reward to how **statistically hard** the score is. One-roll odds (single roll of 5 dice,
no re-rolls) for reference and for the in-row hint text:

| Score | One-roll odds | Tier |
|---|---|---|
| Yahtzee (50) | ~0.08% (1 in 1296) | **legendary** |
| Four of a Kind | ~2.0% | **epic** |
| Large Straight (40) | ~3.1% | **epic** |
| Full House (25) | ~3.9% | **great** |
| Small Straight (30) | ~15.4% | **great** |
| Three of a Kind | ~21.3% | common |

Tier mapping (port from mockup's `tierFor`):

- **mega** — bonus Yahtzee (+100): biggest fanfare + heavy confetti + screen shake + "extra turn!".
- **legendary** — Yahtzee 50: fanfare + confetti + shake.
- **epic** — Large Straight, Four of a Kind: cheer + confetti.
- **great** — Full House, Small Straight, scoring five-of-a-number in the upper section, **or crossing
  the +35 upper bonus**: cheer + small confetti.
- **nice** — e.g. four-of-a-number upper, high Chance: small chime.
- **bust** — any scratch (value 0): sad trombone + a little "wilt" animation.
- **normal** — everything else: a tick + bounce.

Visuals: a center **toast** (emoji + label + points), **confetti** burst scaled by tier, **screen
shake** on the top tiers, and a **cell pop** on every entry. All already implemented in the mockup —
reuse them.

### Sound

The mockup synthesizes all sounds live with the **Web Audio API** (oscillator fanfares, a pitch-bent
sawtooth sad-trombone). Keep this as the working default so v1 has sound with zero assets. **But** put
it behind a small `SoundEngine` module with a clean trigger map so recorded audio files can replace
the synth later without touching call sites:

```
SoundEngine.play('tick' | 'chime' | 'great' | 'epic' | 'yahtzee' | 'bonus' | 'sad')
```

Include a **sound on/off toggle** (header), and never autoplay before a user gesture (init the
AudioContext on first tap). Respect `prefers-reduced-motion` for the *visual* effects regardless of
the sound setting.

---

## 8. PWA requirements

- **Manifest:** app name "Yahtzee", short name, `display: standalone`, `orientation: portrait`,
  theme/background colors matching the UI, and icons at **192×192** and **512×512** (plus a maskable
  icon). Generate simple dice-themed icons.
- **Service worker** via `vite-plugin-pwa`, precaching the app shell for **offline** use.
- Verify **Add to Home Screen** works on Android Chrome; note iOS Safari's add-to-home-screen path in
  the README (iOS has quirks but works for this app).
- No network dependency at runtime (fonts vendored, no CDN calls).

---

## 9. Suggested project structure

```
yahtzee/
  index.html
  vite.config.js            # + vite-plugin-pwa
  src/
    main.js                 # app bootstrap, screen routing
    db.js                   # Dexie schema + data access functions
    game/
      categories.js         # the 13 boxes + metadata, odds, hints
      scoring.js            # PURE: totals, bonus, grand total
      rules.js              # PURE: turn passing, bonus-Yahtzee make-up, game-over/winner
    ui/
      scorecard.js          # renders the grid + cells
      entrySheet.js         # bottom-sheet inputs per category type
      celebrations.js       # toast + confetti + shake
      status.js             # status line / make-up banner
    sound.js                # SoundEngine (synth now, files later)
    screens/
      history.js
      stats.js
    styles.css
  public/icons/...          # PWA icons
  tests/
    scoring.test.js
    rules.test.js
```

Keep `scoring.js` and `rules.js` **pure and DOM-free** so they're unit-testable and reusable on a
future backend.

---

## 10. Tests (Vitest)

Unit-test the pure logic at minimum:

- **scoring:** upper subtotal, the +35 bonus at exactly 62 vs 63, upper/lower/grand totals,
  Yahtzee Bonus contributing to lower total.
- **rules — turn passing:** new fill passes control; editing an existing box does **not**.
- **rules — bonus Yahtzee:** +100 keeps control and owes a make-up; the next new fill clears it and
  passes; two bonus Yahtzees owe two make-ups.
- **rules — scratch:** a 0 is a real entry, counts as a turn, passes control.
- **rules — game over:** detected only when both players have 13 base boxes; winner/tie correct.

Plus a short **manual test checklist** in the README (install to phone, play a full game, refresh
mid-game to confirm resume, trigger each celebration tier, export JSON).

---

## 11. Build order (phased — verify each phase runs before moving on)

1. **Scaffold** Vite + vite-plugin-pwa. Port the v3 mockup UI as-is with in-memory state. Confirm it
   runs locally and installs to a phone home screen.
2. **Extract** `scoring.js` + `rules.js` as pure modules; add Vitest tests (§10). Wire the UI to them.
3. **Persist** with Dexie: autosave the active game per entry; resume on reload; keep the order log.
4. **Lifecycle:** new game + player names, game-over detection, winner, finalize + save record.
5. **History** screen (list + read-only past scorecard).
6. **Stats** screen (§5.3).
7. **Polish:** PWA icons, offline verification, vendored fonts, `SoundEngine` module, accessibility,
   JSON export backed by Dexie.
8. *(Later, separate effort)* Supabase sync of finished games.

---

## 12. Acceptance criteria for v1

- A full 2-player game is playable on a phone, **installed** and **offline**.
- All scores **persist** across refresh/close; an interrupted game **resumes**.
- House rules behave exactly as in §3 (last-box flag; bonus-Yahtzee make-up turn; explicit scratch;
  edit-doesn't-pass-turn).
- Totals (subtotal, +35 bonus, upper/lower/grand) are always correct.
- Finished games appear in **History**; **Stats** compute per player from the entries log.
- Celebrations + sounds fire at the right tiers; sound and reduced-motion are respected.
- Game data is **exportable as JSON** in the one-row-per-entry shape.

---

## 13. Open questions to confirm with the product owner

1. **Bonus-Yahtzee placement:** is the make-up box truly "any open box," or is a forced/Joker
   placement used (matching upper box first, else a lower box)? Default assumed: **any open box**.
2. **Opponent compensation:** confirm only the *roller* takes the extra turn on a bonus Yahtzee and
   the opponent is owed nothing extra. (That's the assumption here.)
3. Single global player identities for lifetime stats in v1, or per-game names only? (Either is fine;
   global makes stats richer.)

---

## How to use this file

1. Put this `yahtzee-build-spec.md` and the `yahtzee-scorekeeper-v3.html` mockup in a new empty folder.
2. Run `claude` in that folder, then `/init` (it will create a `CLAUDE.md`).
3. Tell Claude Code: *"Build the app described in yahtzee-build-spec.md. The v3 HTML is the UI
   reference. Start with phase 1 in §11 and stop after each phase so I can test."*
4. Work phase by phase; run the app on your phone after phase 1 and after persistence lands.
