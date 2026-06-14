# CLAUDE.md — Yahtzee Scorekeeper

## What this is
A two-player Yahtzee **scorekeeper** PWA. Players roll **physical dice**; this app only
records scores — it is NOT a dice roller. Full requirements live in **yahtzee-build-spec.md**
(read it first, it is the source of truth). **yahtzee-scorekeeper-v3.html** is the working UI
mockup to port: its look, layout, entry flow, synthesized sounds, and celebration system.

## Before you build — react to the plan first
Read yahtzee-build-spec.md end to end, then give me YOUR take before writing any code:
what you would simplify, risks or gaps you see, a better structure, and anything you would
do differently. Propose changes — do not just follow the spec blindly. Note the open questions
in section 13. Once we have agreed on the approach, build phase by phase per section 11 and
**stop after each phase** so I can test on my phone before continuing.

## Environment (important)
- This folder is `C:\Yahtzee game` on Windows = `/mnt/c/Yahtzee game` inside WSL.
- **Node lives in WSL only** (Node 22). Run every npm / vite / vitest command from WSL:
    cd "/mnt/c/Yahtzee game" && npm install && npm run dev
- Git is available; commit after each phase with a clear message.

## How we work
- **TDD** the pure logic (scoring + rules): write a failing test, make it pass, refactor.
  The house rules in section 3 (bonus-Yahtzee extra turn, explicit scratch, edit-does-not-pass-turn,
  last-box flag) are the high-value cases — cover them.
- **Verify before saying done**: actually run the tests and the app; do not just assert it works.
- **Keep it simple**: smallest change that meets the spec; no extra dependencies or features
  beyond the chosen stack without asking.
- Keep scoring.js and rules.js pure and DOM-free so they are testable and reusable.
- If something is ambiguous, ask rather than guess.

## Stack (chosen — do not swap without asking)
Vite + vanilla JS, vite-plugin-pwa, Dexie (IndexedDB), Vitest. No backend in v1; structure the
data layer (one row per score entry, with order + timestamp) so a Supabase sync can be added later.
