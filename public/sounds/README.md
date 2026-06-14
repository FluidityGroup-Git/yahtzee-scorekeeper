# Curated sound clips (optional — synth fallback covers anything missing)

Drop royalty-free `.mp3` files here with these exact names. `src/sound.js` loads each on the
first tap; any slot without a file automatically falls back to the built-in Web Audio synth,
so the app always has sound even before these exist. Files placed here are precached by the
service worker for offline use.

| File          | Slot       | When it plays                                  | Vibe |
|---------------|------------|-----------------------------------------------|------|
| `tick.mp3`    | `tick`     | every normal score entry                       | tiny UI tick |
| `nice.mp3`    | `nice`     | small win (4-of-a-number upper, high Chance)   | little chime |
| `great.mp3`   | `great`    | Full House, Small Straight, crossing +35 bonus | cheerful sting |
| `epic.mp3`    | `epic`     | Large Straight, Four of a Kind                 | big cheer |
| `yahtzee.mp3` | `yahtzee`  | Yahtzee (50)                                   | fanfare |
| `bonus.mp3`   | `bonus`    | bonus Yahtzee (+100)                           | jackpot / level-up |
| `bust.mp3`    | `bust`     | any scratch (0)                                | sad trombone |
| `turnpass.mp3`| `turnpass` | control passes to the other player             | short whoosh |

Keep clips short (tick/turnpass < 0.5s; fanfares 1–2s) and roughly level-matched.

Royalty-free sources (no attribution required): pixabay.com/sound-effects,
mixkit.co/free-sound-effects/game, kenney.nl.
