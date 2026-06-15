// Web Speech backend — the instant fallback voice for commentary (ElevenLabs is primary).
// commentary.js drives WHEN to speak; this just utters a line, cancelling any current one so
// voices never stack. `enabled` mirrors the commentary-voice (💬) toggle.

let enabled = true;
let warmed = false;
let chosenVoice = null;
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice() {
  if (!supported) return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  // Prefer an offline (localService) English voice for reliability.
  chosenVoice = voices.find(v => v.localService && /^en/i.test(v.lang))
    || voices.find(v => v.localService)
    || voices.find(v => /^en/i.test(v.lang))
    || voices[0];
}
function utter(text, { rate = 1, pitch = 1.05, volume = 1, onEnd } = {}) {
  if (!supported || !text) { if (onEnd) onEnd(); return; }   // still settle the gate when unsupported
  const u = new SpeechSynthesisUtterance(text);
  if (chosenVoice) u.voice = chosenVoice;
  u.rate = rate; u.pitch = pitch; u.volume = volume;
  if (onEnd) { let done = false; const fin = () => { if (done) return; done = true; onEnd(); }; u.addEventListener('end', fin); u.addEventListener('error', fin); }
  speechSynthesis.speak(u);
}

export const Speech = {
  // Unlock speech on the first user gesture (alongside the AudioContext unlock).
  warm() {
    if (!supported || warmed) return;
    warmed = true;
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
    utter(' ', { volume: 0 }); // silent priming utterance
  },
  setEnabled(on) { enabled = on; if (!on) this.stop(); },
  isEnabled() { return enabled; },
  // Speak a line now, cancelling any current utterance (never stack). onEnd settles the gate,
  // even when speech is disabled/unsupported.
  say(text, { onEnd } = {}) { if (!enabled || !supported) { if (onEnd) onEnd(); return; } speechSynthesis.cancel(); utter(text, { onEnd }); },
  stop() { if (supported) speechSynthesis.cancel(); },
};
