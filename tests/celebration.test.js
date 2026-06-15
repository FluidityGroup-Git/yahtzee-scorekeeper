// @vitest-environment jsdom
// Full-canvas celebration layer: play shows the layer + starts the canvas storm; reset clears it and
// stops the loop; the reduced-motion path skips the storm but still shows the title.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Celebration, celebrationReduced } from '../src/ui/celebration.js';

const setReduced = (m) => { window.matchMedia = () => ({ matches: m, addEventListener() {}, removeEventListener() {} }); };

describe('celebrationReduced (pure helper)', () => {
  it('reflects the reduced-motion media query', () => {
    setReduced(true); expect(celebrationReduced()).toBe(true);
    setReduced(false); expect(celebrationReduced()).toBe(false);
  });
});

describe('Celebration layer (jsdom)', () => {
  let layer;
  beforeEach(() => {
    setReduced(false);
    document.body.innerHTML = '<div id="celebration-layer" class="celebration-layer" aria-hidden="true"><canvas id="celebration-canvas"></canvas></div>';
    layer = document.getElementById('celebration-layer');
    Celebration.mount(layer);
  });
  afterEach(() => Celebration.reset());

  it('mount adopts the layer; nothing shown, loop idle', () => {
    expect(layer.classList.contains('show')).toBe(false);
    expect(Celebration.isRunning()).toBe(false);
  });

  it('play shows the layer, slams the title, and starts the canvas storm', () => {
    Celebration.play('yahtzee', { seat: 0 });
    expect(layer.classList.contains('show')).toBe(true);
    expect(layer.querySelector('.cel-title')).toBeTruthy();
    expect(layer.querySelector('.cel-title').textContent).toBe('YAHTZEE!');
    expect(layer.querySelector('.cel-rays')).toBeTruthy();         // sunburst present (full motion)
    expect(Celebration.isRunning()).toBe(true);                    // canvas loop started
    expect(Celebration.particleCount()).toBeGreaterThan(0);        // confetti spawned
  });

  it('the title text matches the moment type', () => {
    Celebration.play('bonusYahtzee', { seat: 1 });
    expect(layer.querySelector('.cel-title').textContent).toBe('+100!');
    Celebration.play('winGame', { seat: 0 });
    expect(layer.querySelector('.cel-title').textContent).toBe('WINNER!');
  });

  it('reset clears the layer and stops the loop', () => {
    Celebration.play('yahtzee', { seat: 0 });
    Celebration.reset();
    expect(layer.classList.contains('show')).toBe(false);
    expect(layer.querySelector('.cel-title')).toBeNull();
    expect(layer.querySelector('.cel-rays')).toBeNull();
    expect(Celebration.isRunning()).toBe(false);
    expect(Celebration.particleCount()).toBe(0);
  });

  it('reduced motion: shows the title but skips the storm (no loop, no particles, no rays)', () => {
    setReduced(true);
    Celebration.play('yahtzee', { seat: 0 });
    expect(layer.classList.contains('show')).toBe(true);
    expect(layer.querySelector('.cel-title')).toBeTruthy();        // the word still lands
    expect(layer.querySelector('.cel-rays')).toBeNull();           // no spin
    expect(Celebration.isRunning()).toBe(false);                   // no canvas storm
    expect(Celebration.particleCount()).toBe(0);
  });
});
