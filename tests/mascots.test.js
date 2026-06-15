// @vitest-environment jsdom
// Mascots: pure event->reaction mapping (reactionFor) + a jsdom mount/react/reset test.
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    expect(d.cls).toEqual(['rx-yahtzee-static']);   // single static class, no animated effects
    expect(d.hold).toBeLessThanOrEqual(800);
  });
});

describe('mount / react / reset (jsdom)', () => {
  let s0, s1;
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    document.body.innerHTML = '<div id="m0"></div><div id="m1"></div>';
    s0 = document.getElementById('m0'); s1 = document.getElementById('m1');
    Mascots.mount({ seat0El: s0, seat1El: s1 });
  });

  it('mounts two SVGs into the given containers', () => {
    expect(s0.querySelector('svg.mascot.mascot-dan')).toBeTruthy();
    expect(s1.querySelector('svg.mascot.mascot-amber')).toBeTruthy();
    // Amber keeps her gap-tooth detail and Dan his glasses/beard in the markup.
    expect(s1.innerHTML).toContain('rx="4" fill="#FFF7EF"');     // the front-teeth plate (gap rects sit over it)
    expect(s0.innerHTML).toContain('#6B5E54');                   // beard fill
  });

  it('react applies the reaction to the named seat only, then reset clears both to idle', () => {
    Mascots.react('yahtzee', { seat: 0 });
    expect(s0.querySelector('.mascot').classList.contains('rx-yahtzee')).toBe(true);
    expect(s0.querySelector('.fx')).toBeTruthy();                 // a transient effect node spawned
    expect(s1.querySelector('.mascot').classList.contains('rx-yahtzee')).toBe(false);
    expect(s1.querySelector('.fx')).toBeNull();

    Mascots.reset();
    expect(s0.querySelector('.mascot').classList.contains('rx-yahtzee')).toBe(false);
    expect(s0.querySelector('.fx')).toBeNull();
    expect(s1.querySelector('.fx')).toBeNull();
  });
});
