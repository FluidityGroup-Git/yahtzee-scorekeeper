// Commentary orchestrator: fired on every NEW score (either player). Generates one line, captions
// it, and speaks it — ElevenLabs (tagged) within a budget, else Web Speech (plain), else skip.
// Debounced: a newer score cancels any in-flight generation/voice so lines never stack.
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

export const Commentary = {
  configure(c) { cfg = c; },

  cancel() {
    token++;
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }
    if (cfg && cfg.stopVoice) cfg.stopVoice();
  },

  // React to a score (or game-over). ctx.scorerSeat tints the caption.
  // opts.budgetMs overrides the model-aware default (used by tests).
  async react(ctx, opts = {}) {
    if (!cfg) return null;
    const my = ++token;
    if (currentAbort) currentAbort.abort();
    const ac = new AbortController();
    currentAbort = ac;
    if (cfg.stopVoice) cfg.stopVoice();          // never stack voices
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

    if (cfg.voiceReady && cfg.voiceReady()) {
      const text = (cfg.voiceUsesTags && cfg.voiceUsesTags()) ? line.tagged : line.plain;
      const fast = cfg.voiceFast ? !!cfg.voiceFast() : false;
      const budgetMs = opts.budgetMs != null ? opts.budgetMs : synthBudgetMs(fast);
      let blob = null;
      // Pass the abort signal so a newer score cancels the in-flight ElevenLabs request too.
      try { blob = await Promise.race([cfg.synth(text, { signal: ac.signal }), new Promise(r => setTimeout(() => r(null), budgetMs))]); }
      catch { blob = null; }
      if (my !== token) return null;             // superseded while synthesizing — never play
      if (blob) { let ok = false; try { ok = await cfg.playAudio(blob); } catch { ok = false; } if (!ok && cfg.speak) cfg.speak(line.plain); }
      else if (cfg.speak) cfg.speak(line.plain); // audio not ready within budget -> instant Web Speech
    } else if (cfg.speak) {
      cfg.speak(line.plain);
    }
    return line;
  },
};
