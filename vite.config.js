import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ttsProxyPlugin } from './server/ttsProxy.js';

// Phase 2+: vanilla JS app, PWA shell, and a dev/preview-only proxy for ElevenLabs TTS
// (keeps ELEVENLABS_API_KEY server-side, read from .env).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // load all vars (incl. unprefixed ELEVENLABS_API_KEY)
  const getElevenKey = () => process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY || '';
  return {
    // Bind to all interfaces so the dev server is reachable from a phone on the LAN.
    server: { host: true },
    plugins: [
      ttsProxyPlugin(getElevenKey),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
        // generateSW precaches the local app shell only and adds no runtime caching, so the
        // cross-origin Anthropic call and the same-origin /api/tts proxy (which streams the
        // ElevenLabs mp3) are never intercepted or cached. The denylist makes that explicit.
        // Don't add runtimeCaching for either.
        workbox: { navigateFallbackDenylist: [/^\/api\//, /^https:\/\/api\.anthropic\.com/, /^https:\/\/api\.elevenlabs\.io/] },
        manifest: {
          name: 'Yahtzee Scorekeeper',
          short_name: 'Yahtzee',
          description: 'Two-player Yahtzee scorekeeper for physical dice.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#FFE3A8',
          theme_color: '#7C5CFC',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  };
});
