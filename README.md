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
- [ ] Phase 2 — Extract pure `scoring.js` + `rules.js`, Vitest tests, wire UI to them.
- [ ] Phase 3 — Dexie persistence (autosave + resume, order log).
- [ ] Phase 4 — New game / names, game-over + winner, finalize + save.
- [ ] Phase 5 — History screen.
- [ ] Phase 6 — Stats screen.
- [ ] Phase 7 — Polish: vendored fonts, SoundEngine module, accessibility, JSON export, offline verify.

> Note: in this phase the turn/make-up logic is still the mockup's (boolean make-up flag, no
> bonus-Yahtzee gating). The agreed correct rules (derived turn state, per-player `makeupOwed`
> counter, +100 gated on Yahtzee=50) land in phase 2 with the pure rules module and tests.
