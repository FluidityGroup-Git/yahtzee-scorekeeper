// Commentary orchestrator: per-score trigger, both-player targeting, voice fallback chain,
// and cancel-in-flight on rapid scores (never stack voices).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Commentary, synthBudgetMs } from '../src/ui/commentary.js';

const ctx = (seat = 1) => ({ scorerSeat: seat, scorer: seat ? 'Amber' : 'Dan' });

beforeEach(() => Commentary.configure(null));

describe('trigger + targeting', () => {
  it('does nothing when not ready (no key / muted)', async () => {
    const generate = vi.fn();
    Commentary.configure({ ready: () => false, generate, speak: vi.fn(), stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(generate).not.toHaveBeenCalled();
  });

  it('fires for EITHER player (no Amber-only gating) and speaks via Web Speech when no voice', async () => {
    const speak = vi.fn();
    const cfg = { ready: () => true, generate: vi.fn(async () => ({ tagged: '[low] x', plain: 'x' })),
      voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() };
    Commentary.configure(cfg);
    await Commentary.react(ctx(0)); // Dan
    await Commentary.react(ctx(1)); // Amber
    expect(cfg.generate).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenLastCalledWith('x');
  });
});

describe('custom triggers take priority over the AI', () => {
  it('speaks the custom line verbatim and SKIPS the AI when one matches', async () => {
    const generate = vi.fn(async () => ({ tagged: 'AI', plain: 'AI' }));
    const speak = vi.fn();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate,
      customLine: () => 'Boom! 23 on the nose.', voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(speak).toHaveBeenCalledWith('Boom! 23 on the nose.');
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls through to the AI when no custom line matches', async () => {
    const generate = vi.fn(async () => ({ tagged: 'AI line', plain: 'AI line' }));
    const speak = vi.fn();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate,
      customLine: () => null, voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(generate).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith('AI line');
  });

  it('a custom line works even without a Claude key (AI not ready)', async () => {
    const speak = vi.fn();
    Commentary.configure({ canSpeak: () => true, ready: () => false, generate: vi.fn(),
      customLine: () => 'No key needed.', voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(speak).toHaveBeenCalledWith('No key needed.');
  });
});

describe('voice fallback chain', () => {
  it('ElevenLabs: synthesizes the TAGGED line and plays the blob (no Web Speech)', async () => {
    const synth = vi.fn(async () => ({ size: 1 }));
    const playAudio = vi.fn(async () => true);
    const speak = vi.fn();
    Commentary.configure({ ready: () => true, generate: async () => ({ tagged: '[gleeful] hi', plain: 'hi' }),
      voiceReady: () => true, voiceUsesTags: () => true, synth, playAudio, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(synth.mock.calls[0][0]).toBe('[gleeful] hi'); // tagged line (signal passed as 2nd arg)
    expect(playAudio).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it('falls back to Web Speech (plain) when audio is not ready within the budget', async () => {
    const speak = vi.fn();
    Commentary.configure({ ready: () => true, generate: async () => ({ tagged: '[low] hi', plain: 'hi' }),
      voiceReady: () => true, voiceUsesTags: () => true, synth: () => new Promise(() => {}), playAudio: vi.fn(),
      speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx(), { budgetMs: 20 });
    expect(speak).toHaveBeenCalledWith('hi');
  });

  it('falls back to Web Speech when blob playback fails', async () => {
    const speak = vi.fn();
    Commentary.configure({ ready: () => true, generate: async () => ({ tagged: 't', plain: 'p' }),
      voiceReady: () => true, voiceUsesTags: () => false, synth: async () => ({ size: 1 }), playAudio: async () => false,
      speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(speak).toHaveBeenCalledWith('p');
  });
});

describe('synth budget is model-aware', () => {
  it('gives v3 a much longer budget than the fast models', () => {
    expect(synthBudgetMs(false)).toBeGreaterThan(synthBudgetMs(true)); // v3 vs fast
    expect(synthBudgetMs(false)).toBeGreaterThanOrEqual(9000);
    expect(synthBudgetMs(true)).toBeLessThanOrEqual(3000);
  });

  it('waits past 3.5s for a v3 line instead of bailing to Web Speech', async () => {
    let resolveSynth;
    const synth = vi.fn(() => new Promise(r => { resolveSynth = r; }));
    const playAudio = vi.fn(async () => true);
    const speak = vi.fn();
    Commentary.configure({ ready: () => true, generate: async () => ({ tagged: '[low] hi', plain: 'hi' }),
      voiceReady: () => true, voiceUsesTags: () => true, voiceFast: () => false, synth, playAudio, speak,
      stopVoice: vi.fn(), caption: vi.fn() });
    const p = Commentary.react({ scorerSeat: 1 });        // model-aware budget (9s), no override
    await new Promise(r => setTimeout(r, 60));             // well past the old 3.5s bail point
    expect(speak).not.toHaveBeenCalled();                 // still waiting for v3, not fallen back
    resolveSynth({ size: 1 });
    await p;
    expect(playAudio).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});

describe('cancel-in-flight (never stack voices)', () => {
  it('a superseded synth never plays its audio', async () => {
    const gen = vi.fn()
      .mockResolvedValueOnce({ tagged: 't1', plain: 'p1' })
      .mockReturnValue(new Promise(() => {}));            // second react hangs in generate
    let resolveSynth;
    const synth = vi.fn(() => new Promise(r => { resolveSynth = r; }));
    const playAudio = vi.fn(async () => true);
    const speak = vi.fn();
    Commentary.configure({ ready: () => true, generate: gen, voiceReady: () => true,
      voiceUsesTags: () => true, voiceFast: () => false, synth, playAudio, speak, stopVoice: vi.fn(), caption: vi.fn() });

    const p1 = Commentary.react({ scorerSeat: 0 });        // reaches synth#1 (pending)
    await new Promise(r => setTimeout(r, 0));
    expect(synth).toHaveBeenCalledTimes(1);
    Commentary.react({ scorerSeat: 1 });                   // supersede: token++ + abort #1
    resolveSynth({ size: 1 });                             // stale synth resolves late
    await p1;
    expect(playAudio).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });


  it('a newer score cancels the in-flight one; only the latest speaks', async () => {
    const resolvers = [];
    const speak = vi.fn();
    const stopVoice = vi.fn();
    Commentary.configure({ ready: () => true,
      generate: vi.fn(() => new Promise(res => resolvers.push(res))),
      voiceReady: () => false, speak, stopVoice, caption: vi.fn() });

    const p1 = Commentary.react({ scorerSeat: 0 });   // in-flight
    const p2 = Commentary.react({ scorerSeat: 1 });   // supersedes p1
    resolvers[0]({ tagged: 'A', plain: 'A' });         // stale resolves first
    resolvers[1]({ tagged: 'B', plain: 'B' });
    await Promise.all([p1, p2]);

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('B');
    expect(stopVoice).toHaveBeenCalled();              // current voice stopped on the new score
  });
});
