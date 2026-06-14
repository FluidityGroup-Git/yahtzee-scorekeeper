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

export const Commentary = {
  configure(c) { cfg = c; },

  cancel() {
    token++;
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }
    if (cfg && cfg.stopVoice) cfg.stopVoice();
  },

  // React to a score (or game-over). ctx.scorerSeat tints the caption.
  async react(ctx, { budgetMs = 3500 } = {}) {
    if (!cfg) return null;
    const my = ++token;
    if (currentAbort) currentAbort.abort();
    const ac = new AbortController();
    currentAbort = ac;
    if (cfg.stopVoice) cfg.stopVoice();          // never stack voices
    if (!cfg.ready || !cfg.ready()) return null;

    let line = null;
    try { line = await cfg.generate(ctx, { signal: ac.signal }); } catch { line = null; }
    if (my !== token || ac.signal.aborted || !line) return null;   // a newer score superseded us

    if (cfg.caption) cfg.caption(line.plain, ctx.scorerSeat);

    if (cfg.voiceReady && cfg.voiceReady()) {
      const text = (cfg.voiceUsesTags && cfg.voiceUsesTags()) ? line.tagged : line.plain;
      let blob = null;
      try { blob = await Promise.race([cfg.synth(text), new Promise(r => setTimeout(() => r(null), budgetMs))]); }
      catch { blob = null; }
      if (my !== token) return null;             // superseded while synthesizing
      if (blob) { let ok = false; try { ok = await cfg.playAudio(blob); } catch { ok = false; } if (!ok && cfg.speak) cfg.speak(line.plain); }
      else if (cfg.speak) cfg.speak(line.plain); // audio not ready within budget -> instant Web Speech
    } else if (cfg.speak) {
      cfg.speak(line.plain);
    }
    return line;
  },
};
