// ElevenLabs voice client (PRIMARY voice; Web Speech is the fallback). Talks ONLY to the
// same-origin /api/tts proxy — the ElevenLabs key lives server-side in .env, never here.
// Non-secret config (voice id, model, stability/style) lives in localStorage.

const LS = { on: 'yz_el_on', voice: 'yz_el_voice', model: 'yz_el_model', stability: 'yz_el_stability', style: 'yz_el_style' };
// v3 stability is discrete: Creative 0.0 (most tag-responsive) / Natural 0.5 / Robust 1.0.
const STABILITY = { creative: 0.0, natural: 0.5, robust: 1.0 };

let cfg = { on: false, voiceId: '', model: 'eleven_v3', stability: 'natural', style: 0 };
let currentAudio = null;

function load() {
  try {
    cfg.on = localStorage.getItem(LS.on) === '1';
    cfg.voiceId = localStorage.getItem(LS.voice) || '';
    cfg.model = localStorage.getItem(LS.model) || 'eleven_v3';
    cfg.stability = localStorage.getItem(LS.stability) || 'natural';
    cfg.style = parseFloat(localStorage.getItem(LS.style) || '0') || 0;
  } catch { /* ignore */ }
}
function save() {
  try {
    localStorage.setItem(LS.on, cfg.on ? '1' : '0');
    localStorage.setItem(LS.voice, cfg.voiceId);
    localStorage.setItem(LS.model, cfg.model);
    localStorage.setItem(LS.stability, cfg.stability);
    localStorage.setItem(LS.style, String(cfg.style));
  } catch { /* ignore */ }
}
function voiceSettings() {
  return { stability: STABILITY[cfg.stability] ?? 0.5, similarity_boost: 0.75, style: cfg.style || 0, use_speaker_boost: true };
}

export const Voice = {
  load, save,
  get() { return { ...cfg }; },
  set(patch) { Object.assign(cfg, patch); save(); },
  isEnabled() { return cfg.on; },
  setEnabled(on) { cfg.on = on; save(); },
  // Client-side readiness — the server still decides whether a key exists (make() may 503).
  ready() { return cfg.on && !!cfg.voiceId; },
  // Only v3 performs bracketed audio tags; Flash/v2 would read them literally, so send plain text.
  usesTags() { return cfg.model === 'eleven_v3'; },

  // Synthesize a (possibly tagged) line via the proxy. Returns an mp3 Blob or throws.
  async make(text) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voiceId: cfg.voiceId, modelId: cfg.model, voiceSettings: voiceSettings() }),
    });
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json())?.error || ''; } catch { /* ignore */ }
      throw new Error(`tts ${res.status}${detail ? ' — ' + detail : ''}`);
    }
    const blob = await res.blob();
    if (!blob || !blob.size) throw new Error('empty audio');
    return blob;
  },

  // Play an mp3 Blob. Returns true if playback started, false otherwise (caller falls back).
  // Stops any currently-playing clip first so commentary voices never overlap.
  async play(blob) {
    try {
      this.stop();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      currentAudio = a;
      a.addEventListener('ended', () => { URL.revokeObjectURL(url); if (currentAudio === a) currentAudio = null; }, { once: true });
      await a.play();
      return true;
    } catch { return false; }
  },
  stop() { if (currentAudio) { try { currentAudio.pause(); } catch { /* ignore */ } currentAudio = null; } },

  // Settings "Test voice" button.
  async test(sample = '[gleeful] Amber, the dice tremble before you. [dryly] Dan, less so.') {
    try {
      const blob = await this.make(sample);
      const ok = await this.play(blob);
      return ok ? { ok: true } : { ok: false, error: 'audio blocked — tap the page first, then retry' };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};
