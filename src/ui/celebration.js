// Full-canvas celebration layer — a big, vivid backdrop spectacle fired ONLY on the marquee moments
// (yahtzee / bonusYahtzee / winGame). Separate from the mascot character stage: the character still
// pops centre-stage; THIS fills the whole screen behind it with a CSS sunburst, a slamming
// multi-colour title, scattered sparkles, and a dependency-free canvas confetti storm.
//
// Stacking: above the board, below the mascot stage and captions/modals (z-index in celebration.css).
import './celebration.css';

const PALETTE = ['#FF5A47', '#4A90D9', '#FFC83D', '#ED6A92', '#7F77DD', '#4CC38A', '#FF8A3D', '#FFFFFF'];
const ACCENT = ['#4A90D9', '#FF5A47'];   // seat 0 = Dan blue leads, seat 1 = Amber coral leads
const TITLE = { yahtzee: 'YAHTZEE!', bonusYahtzee: '+100!', winGame: 'WINNER!' };

const DURATION_MS = 3600;     // on-screen time before the fade
const FADE_MS = 600;
const MAX_FRAMES = 240;       // ~4s of storm at 60fps
const G = 0.18;               // gravity per frame

// The reduced-motion decision lives in a tiny exported helper so it is testable.
export function celebrationReduced() {
  return typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let layer = null, canvas = null, gtx = null;
let running = false, rafId = null, frame = 0;
let particles = [];
let fadeTimer = null, clearTimer = null;

function sizeCanvas() {
  if (!canvas) return;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
  const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  if (gtx) { gtx.setTransform(1, 0, 0, 1, 0, 0); gtx.scale(dpr, dpr); }
}

// Spawn a burst of confetti from the centre plus two bottom-corner cannons.
function spawnParticles() {
  const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
  const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
  particles = [];
  // Deterministic-enough pseudo randomness without Math.random (kept simple + lively).
  let s = 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const burst = (x, y, dirMin, dirMax, count) => {
    for (let i = 0; i < count; i++) {
      const ang = dirMin + rnd() * (dirMax - dirMin);
      const speed = 4 + rnd() * 9;
      particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        rot: rnd() * Math.PI * 2,
        vr: (rnd() - 0.5) * 0.4,
        w: 6 + rnd() * 8,
        h: 9 + rnd() * 12,
        color: PALETTE[(rnd() * PALETTE.length) | 0],
        life: 1,
        ttl: 60 + (rnd() * 80 | 0),
      });
    }
  };
  burst(w / 2, h * 0.42, -Math.PI, 0, 120);                 // centre fountain (up + out)
  burst(0, h, -Math.PI / 2.2, -Math.PI / 6, 45);            // bottom-left cannon
  burst(w, h, -Math.PI + Math.PI / 6, -Math.PI / 1.8, 45);  // bottom-right cannon
}

function loop() {
  if (!running) return;
  frame++;
  const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
  const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
  if (gtx) gtx.clearRect(0, 0, w, h);
  let alive = 0;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.vy += G;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1 / p.ttl;
    if (p.life <= 0 || p.y > h + 40) { p.life = 0; continue; }
    alive++;
    if (gtx) {
      gtx.save();
      gtx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
      gtx.translate(p.x, p.y);
      gtx.rotate(p.rot);
      gtx.fillStyle = p.color;
      gtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      gtx.restore();
    }
  }
  if (alive === 0 || frame > MAX_FRAMES) { stopLoop(); return; }
  rafId = requestAnimationFrame(loop);
}

function startLoop() {
  if (running) return;
  running = true; frame = 0;
  rafId = requestAnimationFrame(loop);
}
function stopLoop() {
  running = false;
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
}

// Per-letter coloured, outlined title that slams in then floats.
function buildTitle(type) {
  const text = TITLE[type] || '';
  const wrap = document.createElement('div');
  wrap.className = 'cel-title';
  [...text].forEach((ch, i) => {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.color = PALETTE[i % (PALETTE.length - 1)];   // skip pure white for legibility
    wrap.appendChild(span);
  });
  return wrap;
}

function clearVisuals() {
  if (!layer) return;
  layer.querySelectorAll('.cel-rays, .cel-title, .cel-sparkles').forEach(n => n.remove());
}

export const Celebration = {
  // Adopt (or create) #celebration-layer + its canvas; size it and keep it sized on resize.
  mount(el) {
    layer = el || document.getElementById('celebration-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'celebration-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    layer.className = 'celebration-layer';
    canvas = layer.querySelector('#celebration-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'celebration-canvas';
      layer.appendChild(canvas);
    }
    try { gtx = canvas.getContext ? canvas.getContext('2d') : null; } catch { gtx = null; }
    sizeCanvas();
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', sizeCanvas);
    }
    return this;
  },

  // Show the full-screen FX for a marquee moment. A new play replaces the current one.
  play(type, { seat = 0 } = {}) {
    if (!layer) return;
    this.reset();
    const reduced = celebrationReduced();
    const accent = ACCENT[seat] || ACCENT[0];

    // 1) sunburst rays (skipped under reduced motion), tinted with the scorer's accent.
    if (!reduced) {
      const rays = document.createElement('div');
      rays.className = 'cel-rays';
      rays.style.setProperty('--cel-accent', accent);
      layer.appendChild(rays);
    }
    // 2) the slamming title (always shown — it carries the moment).
    layer.appendChild(buildTitle(type));
    // 3) a handful of CSS sparkles (skipped under reduced motion).
    if (!reduced) {
      const sp = document.createElement('div');
      sp.className = 'cel-sparkles';
      sp.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
      layer.appendChild(sp);
    }

    layer.classList.add('show');
    layer.classList.remove('fade');

    // 4) the canvas confetti storm — the dense part, skipped entirely under reduced motion.
    if (!reduced) {
      sizeCanvas();
      spawnParticles();
      startLoop();
    }

    // Hold, then fade out and clear.
    clearTimeout(fadeTimer); clearTimeout(clearTimer);
    fadeTimer = setTimeout(() => { if (layer) layer.classList.add('fade'); }, DURATION_MS);
    clearTimer = setTimeout(() => this.reset(), DURATION_MS + FADE_MS);
  },

  // Clear immediately and stop the canvas loop. Safe to call when nothing is showing.
  reset() {
    stopLoop();
    particles = [];
    clearTimeout(fadeTimer); fadeTimer = null;
    clearTimeout(clearTimer); clearTimer = null;
    if (gtx) {
      const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
      const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
      gtx.clearRect(0, 0, w, h);
    }
    if (layer) { layer.classList.remove('show', 'fade'); clearVisuals(); }
  },

  // Test/inspection hooks.
  isRunning() { return running; },
  particleCount() { return particles.length; },
};
