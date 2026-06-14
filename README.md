# Yahtzee Scorekeeper

A two-player Yahtzee **scorekeeper** PWA. Players roll physical dice; the app records scores only.
See `yahtzee-build-spec.md` for the full spec and `CLAUDE.md` for how we work.

## Run (from WSL — Node lives in WSL only)

```bash
cd "/mnt/c/Yahtzee game"
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/ (PWA service worker + manifest)
npm run preview  # serve the built app
npm test         # Vitest (from phase 2 on)
npm run icons    # regenerate PWA icons in public/icons/
```

## Testing on your phone (WSL2 networking)

WSL2 has its own virtual IP, so the dev server's `Network:` URL is usually **not** reachable from
your phone directly. Easiest paths:

- **Windows port proxy (one-time, in an elevated Windows PowerShell):**
  ```powershell
  netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=(wsl hostname -I).Trim()
  ```
  Then open `http://<your-windows-LAN-ip>:5173/` on your phone (same Wi-Fi). Allow the port
  through Windows Firewall if prompted.
- Or build and `npm run preview -- --host`, or push to any static host for a quick install test.

To **install** (Add to Home Screen): Android Chrome shows an install prompt / menu item;
iOS Safari → Share → *Add to Home Screen* (works, with iOS's usual PWA quirks).

## Status — phased build (see spec §11)

- [x] **Phase 1** — Scaffold (Vite + vite-plugin-pwa) and port the v3 mockup UI with in-memory state.
- [x] **Phase 2** — Pure `categories`/`scoring`/`rules`, Vitest + jsdom tests (24), UI wired to them.
      Corrected house rules: derived turn state, per-player `makeupOwed` counter, +100 gated on
      Yahtzee=50, edit-doesn't-pass-turn, game-over + winner.
- [x] **Juice A–E** — active-column highlight, who-goes-first (coin flip), canvas-confetti tiers +
      flavour toasts, file-based `SoundEngine` (synth fallback), Amber-only spoken pep talks.
- [x] **AI pep talks (G, optional)** — bring-your-own Anthropic key in ⚙️ Settings generates Amber's
      lines live via `claude-haiku-4-5`; key stays in this device's `localStorage`, sent only to
      api.anthropic.com. Falls back seamlessly to the built-in lines with no key / offline / on error.
- [ ] Phase 3 — Dexie persistence (autosave + resume, order log). **Not yet — refresh still resets.**
- [ ] Phase 4 — New game / names, game-over finalize + save record.
- [ ] Phase 5 — History screen.
- [ ] Phase 6 / item F — Stats screen (Chart.js): donut, bars, lines, histogram, fun counters.
- [ ] Phase 7 — Polish: vendored fonts, accessibility, JSON export backed by Dexie, offline verify.

Run `npm test` for the suite. To curate real audio, drop clips in `public/sounds/` (see the
README there) — anything missing falls back to the built-in synth automatically.
