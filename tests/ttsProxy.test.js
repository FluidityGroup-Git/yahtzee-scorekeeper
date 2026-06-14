// ElevenLabs proxy: request shaping + handler behavior (no-key 503, success streams mp3).
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { buildTtsRequest, createTtsHandler, ELEVEN_TTS_BASE } from '../server/ttsProxy.js';

function mockRes() {
  return { statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
}
const reqWith = (obj) => Readable.from([JSON.stringify(obj)]);
const waitEnd = (res) => new Promise((r) => { const o = res.end.bind(res); res.end = (b) => { o(b); r(); }; });

describe('buildTtsRequest (proxy shape)', () => {
  it('targets the voice endpoint with the right headers and body', () => {
    const { url, options } = buildTtsRequest(
      { text: '[dryly] Amber.', voiceId: 'voice123', modelId: 'eleven_v3', voiceSettings: { stability: 0.5 } },
      'xi-secret',
    );
    expect(url).toBe(`${ELEVEN_TTS_BASE}/voice123`);
    expect(options.method).toBe('POST');
    expect(options.headers['xi-api-key']).toBe('xi-secret');
    expect(options.headers['content-type']).toBe('application/json');
    expect(options.headers['accept']).toBe('audio/mpeg');
    const body = JSON.parse(options.body);
    expect(body).toEqual({ text: '[dryly] Amber.', model_id: 'eleven_v3', voice_settings: { stability: 0.5 } });
  });

  it('throws NO_KEY when the server key is missing', () => {
    expect(() => buildTtsRequest({ text: 'hi', voiceId: 'v' }, '')).toThrowError(/ELEVENLABS_API_KEY/);
  });
});

describe('createTtsHandler', () => {
  it('returns 503 when the server has no ElevenLabs key', async () => {
    const handle = createTtsHandler({ getKey: () => '', fetchImpl: async () => { throw new Error('should not call'); } });
    const res = mockRes(); const done = waitEnd(res);
    handle(reqWith({ text: 'hi', voiceId: 'v' }), res); await done;
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/ELEVENLABS_API_KEY/);
  });

  it('streams mp3 back with content-type audio/mpeg on success', async () => {
    const fetchImpl = async (url, opts) => {
      expect(url).toBe(`${ELEVEN_TTS_BASE}/voiceX`);
      expect(opts.headers['xi-api-key']).toBe('xi-key');
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('ID3MP3').buffer };
    };
    const handle = createTtsHandler({ getKey: () => 'xi-key', fetchImpl });
    const res = mockRes(); const done = waitEnd(res);
    handle(reqWith({ text: '[low] go', voiceId: 'voiceX', modelId: 'eleven_v3' }), res); await done;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString()).toBe('ID3MP3');
  });

  it('passes through an upstream error status', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
    const handle = createTtsHandler({ getKey: () => 'xi-key', fetchImpl });
    const res = mockRes(); const done = waitEnd(res);
    handle(reqWith({ text: 'go', voiceId: 'voiceX' }), res); await done;
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toMatch(/401/);
  });
});
