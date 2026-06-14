// Fallback chain selection: ElevenLabs audio -> Web Speech -> static.
import { describe, it, expect } from 'vitest';
import { pickDelivery } from '../src/ui/speech.js';

describe('pickDelivery', () => {
  it('uses static when there is no AI line', () => {
    expect(pickDelivery(null).mode).toBe('static');
    expect(pickDelivery({ plain: '', blob: null }).mode).toBe('static');
  });

  it('uses ElevenLabs when a prefetched audio blob is present', () => {
    const d = pickDelivery({ plain: 'Amber, go.', tagged: '[low] Amber, go.', blob: { size: 5 } });
    expect(d.mode).toBe('eleven');
    expect(d.blob).toEqual({ size: 5 });
    expect(d.text).toBe('Amber, go.'); // stripped text kept for the play-failure fallback
  });

  it('falls back to Web Speech (stripped line) when there is a line but no audio', () => {
    const d = pickDelivery({ plain: 'Amber, go.', tagged: '[low] Amber, go.', blob: null });
    expect(d.mode).toBe('webspeech');
    expect(d.text).toBe('Amber, go.');
  });
});
