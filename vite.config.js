import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Phase 1: scaffold + PWA shell. Logic is still the ported in-memory mockup.
export default defineConfig({
  // Bind to all interfaces so the dev server is reachable from a phone on the LAN.
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
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
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
