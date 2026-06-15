// Commentary orchestrator: fired on every NEW score (either player). Generates one line, captions
// it, and speaks it — ElevenLabs (tagged) within a budget, else Web Speech (plain), else skip.
// A line that is already speaking is allowed to FINISH; the newest score queues behind it (so lines
// are never cut off mid-sentence). Only cancel()/mute/new-game stops a line in progress.
//
// Wired by main via configure() with injected deps (kept decoupled + testable):
//   ready()        -> boolean   (master sound on && commentary on && AI key present)
//   generate(ctx, {signal}) -> Promise<{tagged, plain} | null>
//   voiceReady()   -> boolean   (ElevenLabs usable)
//   voiceUsesTags()-> boolean   (true only for v3 — Flash/v2 read tags literally)
//   synth(text)    -> Promise<Blob>      (ElevenLabs mp3)
//   playAudio(blob)-> Promise<bool>      (true if it played)
//   speak(text)    -> void               (Web Speech)
//   stopVoice()    -> void               (cancel current audio + utterance)
//   caption(text, seat) -> void

let cfg = null;
let token = 0;            // increments per react(); a stale token means "superseded"
let currentAbort = null;

// Synth budget by model. v3 (expressive) routinely needs several seconds per sentence, so give it
// room — the SFX + on-screen caption already gave instant feedback, so the spoken line landing a
// couple seconds later beats bailing to the robotic Web Speech voice. Fast models (Flash v2.5 / v2)
// return quickly, so they don't need to wait.
const V3_BUDGET_MS = 9000;
const FAST_BUDGET_MS = 3000;
export function synthBudgetMs(fast) { return fast ? FAST_BUDGET_MS : V3_BUDGET_MS; }

// Single-slot playback gate: only one line speaks at a time; the newest waiting line wins.
let speaking = false;
let queued = null;
let activeKill = null;   // suppresses onLineEnd for a deliberately-stopped line (cancel/mute)

// Perform exactly ONE spoken utterance; resolve when it ENDS (not when it starts).
function utterOnce(line, blob) {
  return new Promise(resolve => {
    let done = false, suppressed = false;
    const settle = () => {
      if (done) return;
      done = true; activeKill = null; resolve();
      // The line actually ENDED (audio ended / speech end) — tell main once (drives the popout dismiss).
      // A deliberate stop sets `suppressed`, so cancel()/mute never fires it.
      if (!suppressed && cfg && cfg.onLineEnd) cfg.onLineEnd();
    };
    activeKill = () => { suppressed = true; settle(); };
    if (blob && cfg.playAudio) {
      Promise.resolve(cfg.playAudio(blob, { onEnded: settle }))
        .then(ok => { if (!ok) { if (cfg.speak) cfg.speak(line.plain, { onEnd: settle }); else settle(); } })
        .catch(() => { if (cfg.speak) cfg.speak(line.plain, { onEnd: settle }); else settle(); });
    } else if (cfg.speak) {
      cfg.speak(line.plain, { onEnd: settle });
    } else {
      settle();
    }
  });
}

function enqueue(line, blob) {
  if (speaking) { queued = { line, blob }; return; }   // newest wins; only one waits
  speaking = true;
  utterOnce(line, blob).finally(() => {
    speaking = false;
    if (queued) { const q = queued; queued = null; enqueue(q.line, q.blob); }
  });
}

export const Commentary = {
  configure(c) { cfg = c; },

  cancel() {
    token++;
    queued = null; speaking = false;                 // clear the gate too
    if (activeKill) activeKill();                     // settle the current line without firing onLineEnd
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }
    if (cfg && cfg.stopVoice) cfg.stopVoice();
  },

  // React to a score (or game-over). ctx.scorerSeat tints the caption.
  // opts.budgetMs   overrides the model-aware default (used by tests).
  // opts.gateSpeak  optional Promise: the caption + synth happen immediately (latency hidden behind
  //                 the matched sound), but the spoken audio is held until this resolves.
  async react(ctx, opts = {}) {
    if (!cfg) return null;
    const my = ++token;
    if (currentAbort) currentAbort.abort();
    const ac = new AbortController();
    currentAbort = ac;
    if (cfg.canSpeak && !cfg.canSpeak()) return null;   // muted / commentary voice off

    // 1) User-defined custom triggers take PRIORITY and skip the AI (spoken verbatim).
    let line = null;
    if (cfg.customLine) { const cl = cfg.customLine(ctx); if (cl) line = { tagged: cl, plain: cl }; }

    // 2) Otherwise fall through to the AI (needs a Claude key).
    if (!line) {
      if (!cfg.ready || !cfg.ready()) return null;
      try { line = await cfg.generate(ctx, { signal: ac.signal }); } catch { line = null; }
      if (my !== token || ac.signal.aborted || !line) return null;   // a newer score superseded us
    }

    // Caption first — instant feedback even while v3 takes its time synthesizing.
    if (cfg.caption) cfg.caption(line.plain, ctx.scorerSeat);

    let blob = null;
    if (cfg.voiceReady && cfg.voiceReady()) {
      const text = (cfg.voiceUsesTags && cfg.voiceUsesTags()) ? line.tagged : line.plain;
      const fast = cfg.voiceFast ? !!cfg.voiceFast() : false;
      const budgetMs = opts.budgetMs != null ? opts.budgetMs : synthBudgetMs(fast);
      // Pass the abort signal so a newer score cancels the in-flight ElevenLabs request too.
      try { blob = await Promise.race([cfg.synth(text, { signal: ac.signal }), new Promise(r => setTimeout(() => r(null), budgetMs))]); }
      catch { blob = null; }
      if (my !== token) return null;             // superseded while synthesizing — never enqueue
    }
    // Hold the spoken audio behind the matched sound: caption + synth already happened above, so the
    // voice lands the instant the sound finishes. A rejected gate just proceeds.
    if (opts.gateSpeak) {
      try { await opts.gateSpeak; } catch { /* gate rejected — speak anyway */ }
      if (my !== token) return null;             // a newer score landed while we waited — drop the line
    }
    // Let the current line finish; the newest queues behind it (no interruption).
    enqueue(line, blob);
    return line;
  },
};
