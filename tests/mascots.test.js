// @vitest-environment jsdom
// Mascots: pure event->reaction mapping (reactionFor) + the single center-stage mount/react/dismiss API.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Mascots, reactionFor } from '../src/ui/mascots.js';

describe('reactionFor (pure)', () => {
  it('maps each event to its class + effect set', () => {
    expect(reactionFor('yahtzee', 3).cls).toContain('rx-yahtzee');
    expect(reactionFor('yahtzee', 3).effects).toEqual(['confetti', 'stars']);
    expect(reactionFor('scratch', 3).cls).toContain('rx-scratch');
    expect(reactionFor('scratch', 3).effects).toEqual(['sweat']);
    expect(reactionFor('takeLead', 3).cls).toContain('rx-takelead');
    expect(reactionFor('lastTurn', 3).cls).toContain('rx-lastturn');
    expect(reactionFor('winGame', 3).cls).toContain('rx-win');
    expect(reactionFor('winGame', 3).effects).toEqual(expect.arrayContaining(['trophy', 'confetti']));
    expect(reactionFor('loseGame', 3).cls).toContain('rx-lose');
    expect(reactionFor('loseGame', 3).effects).toEqual(['raincloud']);
  });

  it('escalates with level (longer hold + extra cheek/taunt)', () => {
    const lo = reactionFor('yahtzee', 1), hi = reactionFor('yahtzee', 5);
    expect(hi.hold).toBeGreaterThan(lo.hold);
    expect(lo.cls).toContain('cheek-1');
    expect(hi.cls).toContain('cheek-5');
    expect(lo.cls).not.toContain('taunt');
    expect(hi.cls).toContain('taunt');
  });

  it('returns the minimal descriptor under reduced motion', () => {
    const d = reactionFor('yahtzee', 5, true);
    expect(d.reduced).toBe(true);
    expect(d.effects).toEqual([]);
    expect(d.cls).toEqual(['rx-yahtzee-static']);
    expect(d.hold).toBeLessThanOrEqual(800);
  });
});

describe('center stage (jsdom)', () => {
  let stage;
  const setReduced = (m) => { window.matchMedia = () => ({ matches: m, addEventListener() {}, removeEventListener() {} }); };

  beforeEach(() => {
    setReduced(false);
    document.body.innerHTML = '<div id="mascot-stage" class="mascot-stage" aria-hidden="true"></div>';
    stage = document.getElementById('mascot-stage');
    Mascots.mount(stage);
  });
  afterEach(() => Mascots.dismiss());

  it('mount adopts the stage; nothing is shown until a reaction', () => {
    expect(stage.classList.contains('show')).toBe(false);
    expect(stage.querySelector('.stage-main .mascot')).toBeNull();
  });

  it('react pops the scorer big with the reaction class + an effect, and an opponent cameo', () => {
    Mascots.react('yahtzee', { seat: 1 });
    expect(stage.classList.contains('show')).toBe(true);
    const main = stage.querySelector('.stage-main .mascot');
    expect(main.classList.contains('mascot-amber')).toBe(true);     // seat 1 = Amber, centre stage
    expect(main.classList.contains('rx-yahtzee')).toBe(true);
    expect(stage.querySelector('.fx')).toBeTruthy();                // at least one effect node
    expect(stage.querySelector('.stage-cameo .mascot.mascot-dan')).toBeTruthy(); // opponent cameo
  });

  it('a new react replaces the current pop (newest wins, one character centred)', () => {
    Mascots.react('yahtzee', { seat: 1 });
    Mascots.react('scratch', { seat: 0 });
    expect(stage.querySelectorAll('.stage-main .mascot').length).toBe(1);
    const main = stage.querySelector('.stage-main .mascot');
    expect(main.classList.contains('mascot-dan')).toBe(true);
    expect(main.classList.contains('rx-scratch')).toBe(true);
  });

  it('dismiss hides and empties the stage', () => {
    Mascots.react('yahtzee', { seat: 0 });
    Mascots.dismiss();
    expect(stage.classList.contains('show')).toBe(false);
    expect(stage.querySelector('.mascot')).toBeNull();
    expect(stage.querySelector('.fx')).toBeNull();
  });

  it('reduced motion: a minimal pop — no particles, no opponent cameo', () => {
    setReduced(true);
    Mascots.react('yahtzee', { seat: 0 });
    expect(stage.classList.contains('show')).toBe(true);
    expect(stage.querySelector('.stage-main .mascot').classList.contains('rx-yahtzee-static')).toBe(true);
    expect(stage.querySelector('.fx')).toBeNull();
    expect(stage.querySelector('.stage-cameo .mascot')).toBeNull();
  });
});
