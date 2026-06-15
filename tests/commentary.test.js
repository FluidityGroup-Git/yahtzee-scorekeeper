// Commentary orchestrator: per-score trigger, both-player targeting, voice fallback chain, and the
// single-slot playback gate (let the current line finish; queue the newest behind it).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Commentary, synthBudgetMs } from '../src/ui/commentary.js';

const ctx = (seat = 1) => ({ scorerSeat: seat, scorer: seat ? 'Amber' : 'Dan' });
const flush = () => new Promise(r => setTimeout(r, 0));
// Web Speech fake that settles the gate on the next tick.
const autoSpeak = () => vi.fn((t, { onEnd } = {}) => { if (onEnd) Promise.resolve().then(onEnd); });
// ElevenLabs play fake that "starts" and ends on the next tick.
const okPlay = () => vi.fn((b, { onEnded } = {}) => { if (onEnded) Promise.resolve().then(onEnded); return Promise.resolve(true); });

beforeEach(() => { Commentary.cancel(); Commentary.configure(null); });

describe('trigger + targeting', () => {
  it('does nothing when not ready (no key / muted)', async () => {
    const generate = vi.fn();
    Commentary.configure({ canSpeak: () => true, ready: () => false, generate, speak: autoSpeak(), stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(generate).not.toHaveBeenCalled();
  });

  it('fires for EITHER player and speaks via Web Speech when no voice', async () => {
    const speak = autoSpeak();
    const cfg = { canSpeak: () => true, ready: () => true, generate: vi.fn(async () => ({ tagged: '[low] x', plain: 'x' })),
      voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() };
    Commentary.configure(cfg);
    await Commentary.react(ctx(0)); await flush(); // Dan
    await Commentary.react(ctx(1)); await flush(); // Amber
    expect(cfg.generate).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls.at(-1)[0]).toBe('x');
  });
});

describe('custom triggers take priority over the AI', () => {
  it('speaks the custom line verbatim and SKIPS the AI when one matches', async () => {
    const generate = vi.fn(async () => ({ tagged: 'AI', plain: 'AI' }));
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate, customLine: () => 'Boom! 23 on the nose.', voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(speak.mock.calls[0][0]).toBe('Boom! 23 on the nose.');
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls through to the AI when no custom line matches', async () => {
    const generate = vi.fn(async () => ({ tagged: 'AI line', plain: 'AI line' }));
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate, customLine: () => null, voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(generate).toHaveBeenCalled();
    expect(speak.mock.calls[0][0]).toBe('AI line');
  });

  it('a custom line works even without a Claude key (AI not ready)', async () => {
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => false, generate: vi.fn(), customLine: () => 'No key needed.', voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx());
    expect(speak.mock.calls[0][0]).toBe('No key needed.');
  });
});

describe('voice fallback chain', () => {
  it('ElevenLabs: synthesizes the TAGGED line and plays the blob (no Web Speech)', async () => {
    const synth = vi.fn(async () => ({ size: 1 })), playAudio = okPlay(), speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate: async () => ({ tagged: '[gleeful] hi', plain: 'hi' }),
      voiceReady: () => true, voiceUsesTags: () => true, synth, playAudio, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx()); await flush();
    expect(synth.mock.calls[0][0]).toBe('[gleeful] hi');
    expect(playAudio).toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });

  it('falls back to Web Speech (plain) when audio is not ready within the budget', async () => {
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate: async () => ({ tagged: '[low] hi', plain: 'hi' }),
      voiceReady: () => true, voiceUsesTags: () => true, synth: () => new Promise(() => {}), playAudio: vi.fn(), speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx(), { budgetMs: 20 });
    expect(speak.mock.calls[0][0]).toBe('hi');
  });

  it('falls back to Web Speech when blob playback fails', async () => {
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate: async () => ({ tagged: 't', plain: 'p' }),
      voiceReady: () => true, voiceUsesTags: () => false, synth: async () => ({ size: 1 }), playAudio: async () => false, speak, stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx()); await flush();
    expect(speak.mock.calls.at(-1)[0]).toBe('p');
  });
});

describe('synth budget is model-aware', () => {
  it('gives v3 a much longer budget than the fast models', () => {
    expect(synthBudgetMs(false)).toBeGreaterThan(synthBudgetMs(true));
    expect(synthBudgetMs(false)).toBeGreaterThanOrEqual(9000);
    expect(synthBudgetMs(true)).toBeLessThanOrEqual(3000);
  });
});

describe('playback gate (let the line finish; queue the newest behind it)', () => {
  it('react() does NOT stopVoice on a new score', async () => {
    const stopVoice = vi.fn();
    Commentary.configure({ canSpeak: () => true, ready: () => true, generate: async () => ({ tagged: 'x', plain: 'x' }), voiceReady: () => false, speak: autoSpeak(), stopVoice, caption: vi.fn() });
    await Commentary.react(ctx(0));
    await Commentary.react(ctx(1));
    expect(stopVoice).not.toHaveBeenCalled();
  });

  it('queues a newer line behind the one currently playing (no interruption)', async () => {
    const ends = {};
    const speak = vi.fn((t, { onEnd } = {}) => { ends[t] = onEnd; });  // capture, do NOT auto-settle
    const stopVoice = vi.fn();
    const lines = ['A', 'B']; let i = 0;
    Commentary.configure({ canSpeak: () => true, ready: () => true, voiceReady: () => false, speak, stopVoice, caption: vi.fn(),
      generate: async () => { const t = lines[i++]; return { tagged: t, plain: t }; } });

    await Commentary.react(ctx(0));   // 'A' starts playing (held open)
    await Commentary.react(ctx(1));   // 'B' arrives mid-playback -> queued, NOT spoken yet
    expect(speak.mock.calls.map(c => c[0])).toEqual(['A']);
    expect(stopVoice).not.toHaveBeenCalled();

    ends['A']();                       // 'A' finishes -> 'B' is released
    await flush();
    expect(speak.mock.calls.map(c => c[0])).toEqual(['A', 'B']);
  });

  it('if two scores arrive during playback, only the LATEST is spoken next', async () => {
    const ends = {};
    const speak = vi.fn((t, { onEnd } = {}) => { ends[t] = onEnd; });
    const lines = ['A', 'B', 'C']; let i = 0;
    Commentary.configure({ canSpeak: () => true, ready: () => true, voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn(),
      generate: async () => { const t = lines[i++]; return { tagged: t, plain: t }; } });

    await Commentary.react(ctx(0));   // 'A' playing
    await Commentary.react(ctx(1));   // 'B' queued
    await Commentary.react(ctx(0));   // 'C' replaces 'B' in the single waiting slot
    ends['A']();
    await flush();
    expect(speak.mock.calls.map(c => c[0])).toEqual(['A', 'C']);  // 'B' never spoken
  });

  it('a synth superseded during generation never enqueues (older dropped, latest wins)', async () => {
    const resolvers = [];
    const speak = autoSpeak();
    Commentary.configure({ canSpeak: () => true, ready: () => true, voiceReady: () => false, speak, stopVoice: vi.fn(), caption: vi.fn(),
      generate: vi.fn(() => new Promise(res => resolvers.push(res))) });
    const p1 = Commentary.react({ scorerSeat: 0 });   // in-flight generation
    const p2 = Commentary.react({ scorerSeat: 1 });   // supersedes p1 (token bump + abort)
    resolvers[0]({ tagged: 'A', plain: 'A' });          // stale resolves first -> dropped
    resolvers[1]({ tagged: 'B', plain: 'B' });
    await Promise.all([p1, p2]); await flush();
    expect(speak.mock.calls.map(c => c[0])).toEqual(['B']);
  });
});

describe('gateSpeak (hold the voice until the matched sound finishes)', () => {
  it('captions + synthesizes immediately, but does NOT speak until the gate resolves', async () => {
    let release; const gate = new Promise(r => { release = r; });
    const caption = vi.fn(), synth = vi.fn(async () => ({ size: 1 })), playAudio = okPlay();
    Commentary.configure({ canSpeak: () => true, ready: () => true,
      generate: async () => ({ tagged: 't', plain: 'p' }),
      voiceReady: () => true, voiceUsesTags: () => false, synth, playAudio,
      speak: autoSpeak(), stopVoice: vi.fn(), caption });

    const p = Commentary.react(ctx(), { gateSpeak: gate });
    await flush();
    expect(caption).toHaveBeenCalled();          // caption is instant
    expect(synth).toHaveBeenCalled();            // synth is instant (latency hidden behind the sound)
    expect(playAudio).not.toHaveBeenCalled();    // but the voice is held behind the gate

    release();                                   // the sound finished
    await p; await flush();
    expect(playAudio).toHaveBeenCalled();         // now it speaks
  });

  it('drops the line if a newer score lands while waiting for the gate', async () => {
    let release; const gate = new Promise(r => { release = r; });
    const playAudio = okPlay();
    Commentary.configure({ canSpeak: () => true, ready: () => true,
      generate: async () => ({ tagged: 't', plain: 'p' }),
      voiceReady: () => true, voiceUsesTags: () => false, synth: async () => ({ size: 1 }), playAudio,
      speak: autoSpeak(), stopVoice: vi.fn(), caption: vi.fn() });

    const p1 = Commentary.react(ctx(0), { gateSpeak: gate });   // waiting on the gate
    await flush();
    const p2 = Commentary.react(ctx(1));                        // newer score bumps the token
    await flush();
    release();                                                  // gate resolves, but p1 is superseded
    await Promise.all([p1, p2]); await flush();
    expect(playAudio).toHaveBeenCalledTimes(1);                 // only p2 spoke; p1 was dropped
  });

  it('a rejected gate just proceeds to speak (rejection is swallowed)', async () => {
    const playAudio = okPlay();
    Commentary.configure({ canSpeak: () => true, ready: () => true,
      generate: async () => ({ tagged: 't', plain: 'p' }),
      voiceReady: () => true, voiceUsesTags: () => false, synth: async () => ({ size: 1 }), playAudio,
      speak: autoSpeak(), stopVoice: vi.fn(), caption: vi.fn() });
    await Commentary.react(ctx(), { gateSpeak: Promise.reject(new Error('boom')) });
    await flush();
    expect(playAudio).toHaveBeenCalled();
  });
});
