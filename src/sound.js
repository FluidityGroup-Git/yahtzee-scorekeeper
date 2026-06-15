// SoundEngine: plays a curated audio file per slot, falling back to the live Web Audio
// synth when the file is missing — so nothing breaks before Dan vendors real clips.
// Call sites use: SoundEngine.play('tick' | 'nice' | 'great' | 'epic' | 'yahtzee' | 'bonus' |
// 'bust' | 'turnpass'), and the celebration sequencer uses SoundEngine.playMatched(<moment>)
// which plays the matched clip and RESOLVES WHEN IT ENDS (so the AI voice can wait for it).

const SLOTS = [
  'tick', 'nice', 'great', 'epic', 'yahtzee', 'bonus', 'bust', 'turnpass',
  // matched moment clips (see scripts/gen-sounds.mjs); missing files fall back below.
  'bonusYahtzee', 'scratch', 'takeLead', 'lastTurn', 'upperBonus', 'winGame', 'loseGame', 'goodScore',
];

// moment name -> preferred file slot first, then the closest existing fallback(s). The sequencer
// keeps working before the matched files are generated: it plays the best available clip (or a
// short synth blip) and always resolves so the voice is never blocked.
const MOMENT = {
  yahtzee:      ['yahtzee'],
  bonusYahtzee: ['bonusYahtzee', 'bonus'],
  scratch:      ['scratch', 'bust'],
  takeLead:     ['takeLead', 'great'],
  lastTurn:     ['lastTurn', 'nice'],
  upperBonus:   ['upperBonus', 'great', 'nice'],
  winGame:      ['winGame', 'yahtzee'],
  loseGame:     ['loseGame', 'bust'],
  goodScore:    ['goodScore', 'nice', 'tick'],
};

// Rough synth-fallback durations (s) so playMatched can resolve at a sensible time when no file exists.
const SYNTH_DUR = { tick: 0.1, nice: 0.25, great: 0.45, epic: 0.6, yahtzee: 0.9, bonus: 1.2, bust: 1.3, turnpass: 0.2 };

let enabled = true;
let actx = null;
let filesLoaded = false;
const buffers = {};   // slot -> AudioBuffer (only when a file exists & decodes)

function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

// ---- live synth fallback (ported from the v3 mockup) ----
function tone(f, start, dur, type, gain) {
  const a = ac(), o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.value = f;
  o.connect(g); g.connect(a.destination);
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain || 0.18, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function slide(f1, f2, start, dur, type, gain) {
  const a = ac(), o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1400; o.type = type || 'sawtooth';
  const t = a.currentTime + start;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  o.connect(lp); lp.connect(g); g.connect(a.destination);
  g.gain.setValueAtTime(gain || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
const N = { C5: 523, E5: 659, G5: 784, C6: 1046, E6: 1318, G6: 1568, A5: 880, D5: 587, B5: 988, G4: 392 };
const synth = {
  tick() { tone(720, 0, 0.07, 'square', 0.10); },
  nice() { tone(N.C5, 0, 0.12); tone(N.E5, 0.07, 0.14); },
  great() { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.07, 0.16, 'triangle', 0.16)); },
  epic() {
    [N.G4, N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.06, 0.18, 'sawtooth', 0.12));
    [N.C6, N.E6].forEach((f, i) => tone(f, 0.32 + i * 0.06, 0.2, 'sine', 0.14));
  },
  yahtzee() {
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => { tone(f, i * 0.075, 0.22, 'sawtooth', 0.11); tone(f, i * 0.075, 0.22, 'sine', 0.08); });
    [N.C6, N.G6, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, 0.5 + i * 0.05, 0.18, 'triangle', 0.12));
  },
  bonus() {
    synth.yahtzee();
    [N.G4, N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, 0.9 + i * 0.05, 0.25, 'square', 0.07));
  },
  bust() {
    slide(294, 247, 0, 0.22, 'sawtooth', 0.2); slide(262, 220, 0.26, 0.22, 'sawtooth', 0.2);
    slide(233, 196, 0.52, 0.22, 'sawtooth', 0.2); slide(208, 140, 0.78, 0.5, 'sawtooth', 0.22);
  },
  turnpass() { slide(620, 300, 0, 0.16, 'sine', 0.07); },
};

// ---- file player ----
async function loadFiles() {
  if (filesLoaded) return;
  filesLoaded = true;
  const base = import.meta.env.BASE_URL || '/';
  await Promise.all(SLOTS.map(async (slot) => {
    try {
      const res = await fetch(`${base}sounds/${slot}.mp3`);
      if (!res.ok) return;                       // no file yet -> synth fallback
      const buf = await res.arrayBuffer();
      buffers[slot] = await ac().decodeAudioData(buf);
    } catch { /* missing/undecodable -> synth fallback */ }
  }));
}

function playBuffer(buf) {
  const a = ac(), src = a.createBufferSource(), g = a.createGain();
  src.buffer = buf; src.connect(g); g.connect(a.destination); src.start();
}

// Resolve a moment (or raw slot) to something playable: a loaded buffer if any slot in the chain
// has one, else the first slot we have a synth for, else 'tick'.
function resolveMoment(name) {
  const chain = MOMENT[name] || [name];
  for (const s of chain) if (buffers[s]) return { slot: s, buffer: buffers[s] };
  for (const s of chain) if (synth[s]) return { slot: s };
  return { slot: 'tick' };
}

// Play the matched clip and return a Promise that resolves when it ENDS. Safety-timeout-capped so it
// ALWAYS resolves (clip duration + 300ms, capped ~3000ms). Resolves immediately when sound is off.
function playMatched(name) {
  if (!enabled) return Promise.resolve();
  ac();
  const r = resolveMoment(name);
  if (r.buffer) {
    return new Promise(resolve => {
      let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
      const a = ac(), src = a.createBufferSource(), g = a.createGain();
      src.buffer = r.buffer; src.connect(g); g.connect(a.destination);
      src.onended = finish;
      const ms = Math.min(3000, r.buffer.duration * 1000 + 300);
      setTimeout(finish, ms);
      try { src.start(); } catch { finish(); }
    });
  }
  // Synth fallback has no `ended` event — play it and resolve after its estimated length.
  return new Promise(resolve => {
    (synth[r.slot] || synth.tick)();
    const ms = Math.min(3000, (SYNTH_DUR[r.slot] || 0.4) * 1000 + 300);
    setTimeout(resolve, ms);
  });
}

export const SoundEngine = {
  // Unlock audio + kick off file loading on the first user gesture.
  warm() { ac(); loadFiles(); },
  setEnabled(on) { enabled = on; if (on) ac(); },
  isEnabled() { return enabled; },
  play(slot) {
    if (!enabled) return;
    ac();
    if (buffers[slot]) playBuffer(buffers[slot]);
    else (synth[slot] || synth.tick)();
  },
  // Matched moment clip that resolves when the audio ends (or a capped safety timeout). Used by the
  // celebration sequencer to hold the AI voice until the sound has finished.
  playMatched,
};
