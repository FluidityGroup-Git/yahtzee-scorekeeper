// Visual celebrations: canvas-confetti effects per rarity tier, a center toast, screen
// shake, and a deliberately pathetic grey streamer for busts. All visuals respect
// prefers-reduced-motion (sound is handled separately so muted-motion still gets audio).
import confetti from 'canvas-confetti';
import { flavorFor } from './flavor.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#2E7CF6', '#FF5A47', '#FFC83D', '#22C9A0', '#7C5CFC', '#FF7FB0'];

function burst(particleCount, opts = {}) {
  confetti({ particleCount, spread: 70, startVelocity: 38, origin: { y: 0.35 }, colors: COLORS, disableForReducedMotion: true, ...opts });
}

function sideCannons() {
  confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
  confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
}

function fireworks(durationMs) {
  const end = Date.now() + durationMs;
  (function frame() {
    confetti({ particleCount: 30, startVelocity: 45, spread: 360, ticks: 60, origin: { x: Math.random(), y: Math.random() * 0.5 }, colors: COLORS, disableForReducedMotion: true });
    if (Date.now() < end) setTimeout(frame, 220);
  })();
}

function sparkle() {
  confetti({ particleCount: 14, spread: 50, startVelocity: 22, scalar: 0.7, origin: { y: 0.4 }, colors: COLORS, disableForReducedMotion: true });
}

// One lonely grey streamer that flutters down. Pathetic on purpose.
function sadStreamer() {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'streamer';
  el.style.left = (40 + Math.random() * 20) + 'vw';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export function shake() {
  if (reduced()) return;
  const d = document.getElementById('device');
  d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
}

let toastT;
export function showToast(emo, label, pts) {
  const el = document.getElementById('toast');
  el.innerHTML = `<div class="emo">${emo}</div><div class="big">${label}</div><div class="pts">${pts}</div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1600);
}

// Fire the visual layer for a tier. Returns nothing; sound + speech are orchestrated by main.
export function fireCelebration(tier) {
  switch (tier) {
    case 'mega': fireworks(2000); sideCannons(); shake(); break;
    case 'legendary': fireworks(1100); burst(140); shake(); break;
    case 'epic': sideCannons(); burst(40); break;
    case 'great': burst(40); break;
    case 'nice': sparkle(); break;
    case 'bust': sadStreamer(); break;
    default: break; // 'normal' -> just the per-cell pop, done by the caller
  }
}

// Show the flavour toast for a tier (skips 'normal'). Pass an override label for special cases.
export function celebrationToast(tier, ptsText, overrideLabel) {
  const f = flavorFor(tier);
  if (!f) return;
  showToast(f.emo, overrideLabel || f.label, ptsText);
}
