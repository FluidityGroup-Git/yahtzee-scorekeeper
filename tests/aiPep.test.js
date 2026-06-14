// @vitest-environment jsdom
// AI commentary: request shaping, tag-aware parsing, escalation mapping, audio prefetch,
// and the no-key fallback — all with fetch stubbed (no real key, no network).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIPep, parseLine, stripTags, savageryLevel } from '../src/ui/aiPep.js';

let calls;
function stubFetch(textOut) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: textOut }] }) };
  });
}

beforeEach(() => {
  localStorage.clear();
  AIPep.setKey('');
  AIPep.setEnabled(false);
  AIPep.setSynth(null);
  AIPep.setContextProvider(() => ({ amber: 50, dan: 40, lead: 10, boxesLeft: 5, last: { label: 'Yahtzee', value: 50 }, justYahtzee: true, level: 3, profanity: false }));
});

describe('escalation: progress -> savagery level', () => {
  it('maps the progress bands to L1..L5', () => {
    expect(savageryLevel(0)).toBe(1);
    expect(savageryLevel(0.10)).toBe(1);
    expect(savageryLevel(0.25)).toBe(2);
    expect(savageryLevel(0.50)).toBe(3);
    expect(savageryLevel(0.70)).toBe(4);
    expect(savageryLevel(0.90)).toBe(5);
    expect(savageryLevel(1)).toBe(5);
  });
  it('clamps to the savagery cap and never below 1', () => {
    expect(savageryLevel(0.95, 2)).toBe(2);   // would be 5, capped at 2
    expect(savageryLevel(0.95, 1)).toBe(1);
    expect(savageryLevel(0.10, 5)).toBe(1);   // low progress unaffected by high cap
    expect(savageryLevel(2, 9)).toBe(5);      // out-of-range clamped
  });
});

describe('tag-aware parsing (Web Speech must never read tags aloud)', () => {
  it('keeps v3 tags in `tagged`, strips them in `plain`', () => {
    const r = parseLine('[dryly] Amber, that was almost a Yahtzee. [laughs]');
    expect(r.tagged).toBe('[dryly] Amber, that was almost a Yahtzee. [laughs]');
    expect(r.plain).toBe('Amber, that was almost a Yahtzee.');
  });
  it('strips wrapping quotes and emoji but preserves tags', () => {
    expect(parseLine('  "[low] Dan, the dice forgot you. 🔥"  ').plain).toBe('Dan, the dice forgot you.');
    expect(stripTags('[gleeful] Go, [whispers] Amber.')).toBe('Go, Amber.');
  });
});

describe('readiness + fallback', () => {
  it('yields no item without a key (caller falls back to static)', async () => {
    stubFetch('[dryly] Amber.');
    AIPep.setEnabled(true);
    expect(AIPep.ready()).toBe(false);
    expect(await AIPep.generateNow()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('request shaping', () => {
  it('POSTs to the messages API with the browser-access header, version, key, Haiku model, and escalation context', async () => {
    stubFetch('[gleeful] Amber, level three energy. Dan, fold.');
    AIPep.setKey('sk-ant-secret-1234');
    AIPep.setEnabled(true);

    const item = await AIPep.generateNow();
    expect(item).toBeTruthy();
    expect(item.tagged).toContain('[gleeful]');
    expect(item.plain).not.toContain('[');
    expect(item.blob).toBeNull(); // no synth configured

    const { url, opts } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-ant-secret-1234');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    expect(opts.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.system).toMatch(/SAVAGERY LADDER/);
    expect(body.messages[0].content).toMatch(/savagery level: 3/);
    expect(body.messages[0].content).toMatch(/YAHTZEE/);
  });
});

describe('audio prefetch via injected synth', () => {
  it('attaches a blob when the voice synth is ready', async () => {
    stubFetch('[low] Amber dominates.');
    AIPep.setKey('sk-ant-x'); AIPep.setEnabled(true);
    AIPep.setSynth({ ready: () => true, make: async () => ({ size: 42 }) });
    const item = await AIPep.generateNow();
    expect(item.blob).toEqual({ size: 42 });
  });
  it('leaves blob null when synthesis fails (so speech.js uses Web Speech)', async () => {
    stubFetch('[low] Amber dominates, again.');
    AIPep.setKey('sk-ant-y'); AIPep.setEnabled(true);
    AIPep.setSynth({ ready: () => true, make: async () => { throw new Error('proxy 503'); } });
    const item = await AIPep.generateNow();
    expect(item.plain).toBeTruthy();
    expect(item.blob).toBeNull();
  });
});

describe('test() probe', () => {
  it('returns the plain line on success', async () => {
    stubFetch('[dryly] Amber, go.');
    const r = await AIPep.test('sk-ant-test');
    expect(r).toEqual({ ok: true, text: 'Amber, go.' });
  });
});
