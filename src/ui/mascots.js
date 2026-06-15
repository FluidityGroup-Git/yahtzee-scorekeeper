// Center-stage reaction popout. A single full-screen stage (pointer-events: none, hidden by default)
// pops the reacting character BIG in the middle of the screen, brings the opponent in for a corner
// cameo on the spicy moments, then dismisses on the next mouse move / pointer / key, when the AI voice
// line ends (Mascots.dismiss wired in main), or a max-hold fallback. All hand-coded SVG + CSS,
// reduced-motion aware. The event→reaction decision stays in the PURE, exported reactionFor(...).
import './mascots.css';

// ---- the characters (reproduced exactly; only the presentation changed) ----
// Amber — coral, gap-tooth grin (white front-teeth plate + two divider rects + dark centre).
const AMBER_SVG = `
<svg class="mascot mascot-amber" width="210" height="220" viewBox="0 0 210 220" role="img" aria-label="Amber">
  <g class="arm"><rect x="40" y="92" width="14" height="42" rx="7" fill="#F2895C" stroke="#C8521F" stroke-width="2.5"/></g>
  <rect x="156" y="92" width="14" height="42" rx="7" fill="#F2895C" stroke="#C8521F" stroke-width="2.5"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="#F2895C"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="none" stroke="#C8521F" stroke-width="3.5"/>
  <g class="bow">
    <path d="M105 60 L83 50 Q75 60 83 70 Z" fill="#ED6A92" stroke="#C8455F" stroke-width="2.2"/>
    <path d="M105 60 L127 50 Q135 60 127 70 Z" fill="#ED6A92" stroke="#C8455F" stroke-width="2.2"/>
    <rect x="99" y="54" width="12" height="14" rx="4" fill="#D8517B" stroke="#C8455F" stroke-width="2"/>
  </g>
  <circle cx="71" cy="138" r="9" fill="#F48FB1" opacity=".6"/>
  <circle cx="139" cy="138" r="9" fill="#F48FB1" opacity=".6"/>
  <g class="eye">
    <ellipse cx="84" cy="110" rx="8" ry="11.5" fill="#fff"/>
    <circle cx="84" cy="112" r="5" fill="#3A1F12"/><circle cx="86" cy="108" r="1.8" fill="#fff"/>
    <path d="M75 101 L69 95 M78 99 L74 92 M82 98 L80 90" stroke="#3A1F12" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  </g>
  <g class="eye" style="animation-delay:.05s">
    <ellipse cx="126" cy="110" rx="8" ry="11.5" fill="#fff"/>
    <circle cx="126" cy="112" r="5" fill="#3A1F12"/><circle cx="128" cy="108" r="1.8" fill="#fff"/>
    <path d="M135 101 L141 95 M132 99 L136 92 M128 98 L130 90" stroke="#3A1F12" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  </g>
  <path d="M76 135 Q105 126 134 135 L129 146 Q105 172 81 146 Z" fill="#5E2A18"/>
  <rect x="78" y="133" width="54" height="13" rx="4" fill="#FFF7EF"/>
  <rect x="92" y="133" width="2" height="13" fill="#E7D9CC"/>
  <rect x="116" y="133" width="2" height="13" fill="#E7D9CC"/>
  <rect x="102.5" y="133" width="5" height="13" fill="#5E2A18"/>
  <path d="M76 135 Q105 126 134 135" fill="none" stroke="#E8607A" stroke-width="5" stroke-linecap="round"/>
  <path d="M81 146 Q105 172 129 146" fill="none" stroke="#E8607A" stroke-width="6.5" stroke-linecap="round"/>
</svg>`;

// Dan — blue, glasses + greying (salt-and-pepper) beard + side-parted greying hair; wink + tongue.
const DAN_SVG = `
<svg class="mascot mascot-dan" width="210" height="220" viewBox="0 0 210 220" role="img" aria-label="Dan">
  <g class="arm"><rect x="40" y="92" width="14" height="42" rx="7" fill="#4A90D9" stroke="#1F5FA5" stroke-width="2.5"/></g>
  <rect x="156" y="92" width="14" height="42" rx="7" fill="#4A90D9" stroke="#1F5FA5" stroke-width="2.5"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="#4A90D9"/>
  <rect x="51" y="66" width="108" height="108" rx="30" fill="none" stroke="#1F5FA5" stroke-width="3.5"/>
  <path d="M58 130 Q56 154 76 167 Q90 176 105 176 Q120 176 134 167 Q154 154 152 130 Q148 149 130 157 Q118 164 105 164 Q92 164 80 157 Q62 149 58 130 Z" fill="#C3C7CD" stroke="#9AA0A8" stroke-width="1.5"/>
  <path d="M70 150 Q74 160 82 165 M138 150 Q134 160 126 165 M96 162 L96 170 M114 162 L114 170" stroke="#9AA0A8" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M84 156 Q88 162 92 165 M126 156 Q122 162 118 165" stroke="#70707A" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>
  <circle cx="70" cy="122" r="7" fill="#ED9A9A" opacity=".4"/>
  <circle cx="140" cy="122" r="7" fill="#ED9A9A" opacity=".4"/>
  <path d="M50 96 Q46 62 105 56 Q164 62 160 96 Q150 84 128 86 Q120 72 113 86 Q108 94 100 88 Q78 82 66 88 Q56 92 50 96 Z" fill="#6B5E54" stroke="#463D36" stroke-width="2"/>
  <path d="M118 85 Q122 72 127 60" stroke="#463D36" stroke-width="2.5" fill="none"/>
  <path d="M66 87 Q82 80 100 85 M126 86 Q140 82 152 90" stroke="#A89F95" stroke-width="1.8" fill="none" opacity=".7"/>
  <g class="eye"><ellipse cx="85" cy="109" rx="7.5" ry="10" fill="#fff"/><circle cx="85" cy="111" r="4.5" fill="#26190E"/><circle cx="87" cy="108" r="1.7" fill="#fff"/></g>
  <path d="M118 109 Q125 116 132 109" fill="none" stroke="#26190E" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="70" y="96" width="30" height="26" rx="10" fill="none" stroke="#33343A" stroke-width="3"/>
  <rect x="110" y="96" width="30" height="26" rx="10" fill="none" stroke="#33343A" stroke-width="3"/>
  <path d="M100 104 Q105 101 110 104" fill="none" stroke="#33343A" stroke-width="3"/>
  <path d="M70 104 L54 101 M140 104 L156 101" stroke="#33343A" stroke-width="3" stroke-linecap="round"/>
  <path d="M76 100 L84 114 M116 100 L124 114" stroke="#fff" stroke-width="2" opacity=".22"/>
  <path d="M90 138 Q105 132 120 138 Q116 150 105 150 Q94 150 90 138 Z" fill="#5E2A18"/>
  <g class="tongue"><rect x="98" y="144" width="15" height="16" rx="7" fill="#E8607A"/><line x1="105.5" y1="147" x2="105.5" y2="157" stroke="#C8455F" stroke-width="1.5"/></g>
  <path d="M86 135 Q96 131 104 135 M106 135 Q114 131 124 135" stroke="#B8BCC2" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const SVG = [DAN_SVG, AMBER_SVG];   // index by seat

// ---- pure reaction mapping (no DOM) ----
const BASE = {
  goodScore:     { cls: ['rx-good'],      effects: [],                     hold: 1100 },
  yahtzee:       { cls: ['rx-yahtzee'],   effects: ['confetti', 'stars'],  hold: 1800 },
  bonusYahtzee:  { cls: ['rx-bonus'],     effects: ['crown', 'fireworks'], hold: 2400 },
  scratch:       { cls: ['rx-scratch'],   effects: ['sweat'],              hold: 1500 },
  takeLead:      { cls: ['rx-takelead'],  effects: [],                     hold: 1400 },
  loseLead:      { cls: ['rx-loselead'],  effects: [],                     hold: 1300 },
  lastTurn:      { cls: ['rx-lastturn'],  effects: [],                     hold: 1600 },
  upperBonus:    { cls: ['rx-upper'],     effects: ['sparkle'],            hold: 1200 },
  winGame:       { cls: ['rx-win'],       effects: ['trophy', 'confetti'], hold: 2500 },
  loseGame:      { cls: ['rx-lose'],      effects: ['raincloud'],          hold: 2400 },
  opponentLaugh: { cls: ['rx-laugh'],     effects: [],                     hold: 1500 },
  tie:           { cls: ['rx-tie'],       effects: [],                     hold: 1300 },
};

// Returns { event, level, reduced, cls:[...], effects:[...], hold } — pure + testable.
export function reactionFor(event, level = 3, reduced = false) {
  const lvl = Math.max(1, Math.min(5, Math.round(Number(level)) || 3));
  if (reduced) return { event, level: lvl, reduced: true, cls: [`rx-${event}-static`], effects: [], hold: 700 };
  const base = BASE[event] || BASE.goodScore;
  const cls = [...base.cls, `cheek-${lvl}`];
  if (lvl >= 4) cls.push('taunt');                                 // tongue-out wiggle at high cheek
  const hold = Math.round(base.hold * (0.75 + lvl * 0.1));         // longer hold the cheekier it gets
  return { event, level: lvl, reduced: false, cls, effects: [...base.effects], hold };
}

// Opponent cameo per event (the other player crashing the shot). null = no cameo.
function cameoFor(event) {
  switch (event) {
    case 'scratch': return { cls: 'rx-laugh', side: 'cameo-right' };          // points and cackles
    case 'yahtzee': case 'bonusYahtzee': return { cls: 'rx-sideeye', side: 'cameo-left' };  // jealous side-eye
    case 'takeLead': return { cls: 'rx-loselead', side: 'cameo-right' };      // overtaken double-take
    case 'winGame': return { cls: 'rx-lose', side: 'cameo-right' };           // loser slumped in the corner
    case 'tie': return { cls: 'rx-tie', side: 'cameo-right' };                // both shrug
    default: return null;
  }
}

// ---- transient effect nodes (inline SVG / CSS particles), removed on animationend + safety net ----
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.8 6.3 20.3 8 13.7 2.8 9.3l6.8-.5z"/></svg>';
const EFFECT_HTML = {
  confetti: '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>',
  fireworks: '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>',
  stars: `<span class="s-l">${STAR}</span><span class="s-r">${STAR}</span>`,
  crown: '<svg viewBox="0 0 64 40"><path d="M6 36 L10 10 L22 24 L32 6 L42 24 L54 10 L58 36 Z" fill="#FFC83D" stroke="#1A1B26" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="6" r="3" fill="#FF5A47" stroke="#1A1B26" stroke-width="1.5"/></svg>',
  sweat: '<svg viewBox="0 0 24 36"><path d="M12 2 C5 16 4 22 4 26 a8 8 0 0 0 16 0 C20 22 19 16 12 2 Z" fill="#7FD0FF" stroke="#2E7CF6" stroke-width="2"/></svg>',
  raincloud: '<svg viewBox="0 0 80 56"><ellipse cx="40" cy="22" rx="30" ry="16" fill="#B7BEC8" stroke="#7C8595" stroke-width="2"/><line x1="26" y1="40" x2="22" y2="52" stroke="#7FB6FF" stroke-width="3" stroke-linecap="round"/><line x1="40" y1="40" x2="36" y2="54" stroke="#7FB6FF" stroke-width="3" stroke-linecap="round"/><line x1="54" y1="40" x2="50" y2="52" stroke="#7FB6FF" stroke-width="3" stroke-linecap="round"/></svg>',
  sparkle: '<svg viewBox="0 0 40 40"><path d="M20 2 L23 17 L38 20 L23 23 L20 38 L17 23 L2 20 L17 17 Z" fill="#FFE08A" stroke="#FFC83D" stroke-width="1.5"/></svg>',
  trophy: '<svg viewBox="0 0 48 56"><path d="M12 6 h24 v10 a12 12 0 0 1-24 0 Z" fill="#FFC83D" stroke="#1A1B26" stroke-width="2.5"/><path d="M12 9 H4 v4 a8 8 0 0 0 8 8 M36 9 h8 v4 a8 8 0 0 1-8 8" fill="none" stroke="#1A1B26" stroke-width="2.5"/><rect x="20" y="30" width="8" height="10" fill="#FFC83D" stroke="#1A1B26" stroke-width="2.5"/><rect x="12" y="40" width="24" height="8" rx="2" fill="#FFC83D" stroke="#1A1B26" stroke-width="2.5"/></svg>',
};

function spawnEffect(container, name, hold) {
  const fx = document.createElement('div');
  fx.className = `fx fx-${name}`;
  fx.style.setProperty('--fx-life', hold + 'ms');
  fx.innerHTML = EFFECT_HTML[name] || '';
  container.appendChild(fx);
  const done = () => { if (fx.parentNode) fx.remove(); };
  fx.addEventListener('animationend', (e) => { if (e.target === fx) done(); });
  setTimeout(done, hold + 600);   // safety net so nothing ever piles up after many turns
}

const reducedMotion = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);

let stage = null, mainEl = null, cameoEl = null;
let dismissTimer = null, dismissHandler = null;

function removeDismissListeners() {
  if (!dismissHandler) return;
  window.removeEventListener('mousemove', dismissHandler);
  window.removeEventListener('pointerdown', dismissHandler);
  window.removeEventListener('keydown', dismissHandler);
  dismissHandler = null;
}
function clearStage() {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  removeDismissListeners();
  if (mainEl) mainEl.innerHTML = '';
  if (cameoEl) { cameoEl.innerHTML = ''; cameoEl.className = 'stage-cameo'; }
}

export const Mascots = {
  // Adopt the given #mascot-stage (or create one on <body>). Hidden until a reaction.
  mount(stageEl) {
    stage = stageEl || document.getElementById('mascot-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'mascot-stage'; document.body.appendChild(stage); }
    stage.className = 'mascot-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = '<div class="stage-backdrop"></div><div class="stage-main"></div><div class="stage-cameo"></div>';
    mainEl = stage.querySelector('.stage-main');
    cameoEl = stage.querySelector('.stage-cameo');
  },

  // ONE call per moment: pop the scorer big + bring in the opponent cameo, then arm dismissal.
  react(event, { seat, level = 3 } = {}) {
    if (!stage || seat == null) return;
    const d = reactionFor(event, level, reducedMotion());
    clearStage();   // a new reaction replaces the current pop (newest wins)

    // big centre character
    mainEl.innerHTML = SVG[seat];
    const svg = mainEl.querySelector('.mascot');
    svg.classList.add(...d.cls);
    if (!d.reduced) d.effects.forEach(name => spawnEffect(mainEl, name, d.hold));

    // opponent cameo (skip under reduced motion)
    if (!d.reduced) {
      const cam = cameoFor(event);
      if (cam) {
        cameoEl.innerHTML = SVG[1 - seat];
        cameoEl.querySelector('.mascot').classList.add(cam.cls);
        cameoEl.classList.add('show-cameo', cam.side);
      }
    }

    stage.classList.add('show');

    // dismiss on the next mouse move / pointer / key, or a capped max-hold fallback
    const max = Math.min(9000, (d.hold || 1000) + 2500);
    dismissTimer = setTimeout(() => this.dismiss(), max);
    dismissHandler = () => this.dismiss();
    window.addEventListener('mousemove', dismissHandler, { once: true });
    window.addEventListener('pointerdown', dismissHandler, { once: true });
    window.addEventListener('keydown', dismissHandler, { once: true });
  },

  // Fade out + clear (also wired to the AI voice end). Safe to call when nothing is showing.
  dismiss() {
    if (!stage) return;
    stage.classList.remove('show');
    clearStage();
  },

  reset() { this.dismiss(); },
};
