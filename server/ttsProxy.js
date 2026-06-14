// Dev/preview-server proxy for ElevenLabs TTS. The ElevenLabs key stays SERVER-SIDE
// (read from .env as ELEVENLABS_API_KEY) and is never exposed to the browser — unlike the
// Anthropic key, which is BYO in localStorage. The browser POSTs { text, voiceId, modelId,
// voice_settings } to /api/tts; this forwards to ElevenLabs and streams the mp3 back.

export const ELEVEN_TTS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

// Pure request builder — the "proxy shape". Throws (with .code) on missing inputs.
export function buildTtsRequest({ text, voiceId, modelId = 'eleven_v3', voiceSettings } = {}, apiKey) {
  if (!apiKey) { const e = new Error('ELEVENLABS_API_KEY not set on the server'); e.code = 'NO_KEY'; throw e; }
  if (!voiceId) { const e = new Error('missing voiceId'); e.code = 'NO_VOICE'; throw e; }
  if (!text || !String(text).trim()) { const e = new Error('missing text'); e.code = 'NO_TEXT'; throw e; }
  const body = { text: String(text), model_id: modelId };
  if (voiceSettings) body.voice_settings = voiceSettings;
  return {
    url: `${ELEVEN_TTS_BASE}/${encodeURIComponent(voiceId)}`,
    options: {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
      body: JSON.stringify(body),
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

// Node http handler for POST /api/tts. fetchImpl is injectable for testing.
export function createTtsHandler({ getKey, fetchImpl = globalThis.fetch }) {
  return async function handle(req, res) {
    try {
      const payload = await readJsonBody(req);
      const apiKey = (getKey && getKey()) || '';
      if (!apiKey) return sendJson(res, 503, { error: 'ELEVENLABS_API_KEY not set on the server' });
      let spec;
      try { spec = buildTtsRequest(payload, apiKey); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
      const upstream = await fetchImpl(spec.url, spec.options);
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => '');
        return sendJson(res, upstream.status, { error: `ElevenLabs ${upstream.status}`, detail: detail.slice(0, 300) });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.statusCode = 200;
      res.setHeader('content-type', 'audio/mpeg');
      res.setHeader('cache-control', 'no-store');
      res.end(buf);
    } catch (e) {
      sendJson(res, 500, { error: String(e?.message || e) });
    }
  };
}

// Vite plugin: mount the handler on both the dev server and the preview server.
export function ttsProxyPlugin(getKey) {
  const handle = createTtsHandler({ getKey });
  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      if (req.method === 'POST' && (req.url || '').split('?')[0] === '/api/tts') handle(req, res);
      else next();
    });
  };
  return { name: 'yahtzee-tts-proxy', configureServer: attach, configurePreviewServer: attach };
}
