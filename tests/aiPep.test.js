// @vitest-environment jsdom
// Verifies the AI pep-talk request shaping + graceful fallback, with fetch stubbed
// (no real API key, no network).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIPep } from '../src/ui/aiPep.js';

let calls;
function stubFetch(textOut = '"Amber, crush him. 🎲"') {
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
  AIPep.setContextProvider(() => ({ amber: 50, dan: 40, lead: 10, boxesLeft: 5, last: { label: 'Yahtzee', value: 50 }, justYahtzee: true }));
});

describe('readiness + fallback', () => {
  it('is not ready and yields no line without a key (caller falls back to static)', async () => {
    stubFetch();
    AIPep.setEnabled(true);
    expect(AIPep.ready()).toBe(false);
    expect(await AIPep.generateNow()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is not ready when the key exists but AI is toggled off', () => {
    AIPep.setKey('sk-ant-abc123');
    AIPep.setEnabled(false);
    expect(AIPep.ready()).toBe(false);
  });
});

describe('request shaping', () => {
  it('POSTs to the messages API with the browser-access header, version, key, and Haiku model', async () => {
    stubFetch();
    AIPep.setKey('sk-ant-secret-key-1234');
    AIPep.setEnabled(true);

    const line = await AIPep.generateNow();
    expect(line).toBeTruthy();

    const { url, opts } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-api-key']).toBe('sk-ant-secret-key-1234');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    expect(opts.headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBeLessThanOrEqual(100);
    expect(body.system).toMatch(/Amber/);
    // Live context is threaded into the user message.
    expect(body.messages[0].content).toMatch(/YAHTZEE/);
  });

  it('sanitizes the returned line (strips wrapping quotes and emoji)', async () => {
    stubFetch('  "Amber, the dice fear you. 🔥"  ');
    AIPep.setKey('sk-ant-xyz');
    AIPep.setEnabled(true);
    const line = await AIPep.generateNow();
    expect(line).toBe('Amber, the dice fear you.');
  });
});

describe('test() probe', () => {
  it('returns ok + text on success', async () => {
    stubFetch('Amber, go.');
    const r = await AIPep.test('sk-ant-test');
    expect(r).toEqual({ ok: true, text: 'Amber, go.' });
  });

  it('returns an error when the API rejects', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }));
    const r = await AIPep.test('bad-key');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });
});
