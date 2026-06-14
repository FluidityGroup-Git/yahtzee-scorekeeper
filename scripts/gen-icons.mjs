// Generate simple dice-themed PWA icons with zero image dependencies.
// Draws a grape background + a white die with black pips, encodes RGBA -> PNG via zlib.
// Phase 7 can replace these with nicer art; this just satisfies installability.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const GRAPE = [124, 92, 252];
const INK = [26, 27, 38];
const WHITE = [255, 255, 255];

// --- tiny PNG encoder ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  // add filter byte (0) per row
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function makeIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => { const i = (y * size + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };
  const inRR = (x, y, cx, cy, hw, hh, rad) => {
    const dx = Math.abs(x - cx) - (hw - rad), dy = Math.abs(y - cy) - (hh - rad);
    if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh;
    return dx * dx + dy * dy <= rad * rad;
  };
  const c = size / 2;
  const bgHalf = size / 2, bgRad = maskable ? 0 : size * 0.20;
  const dieHalf = maskable ? size * 0.30 : size * 0.34;   // smaller for maskable safe zone
  const dieRad = dieHalf * 0.34, border = size * 0.035;
  const pipR = size * 0.045, off = dieHalf * 0.46;
  const pips = [[-off, -off], [off, -off], [0, 0], [-off, off], [off, off]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!maskable && !inRR(x, y, c, c, bgHalf - 1, bgHalf - 1, bgRad)) { set(x, y, INK, 0); continue; }
    set(x, y, GRAPE);
    if (inRR(x, y, c, c, dieHalf, dieHalf, dieRad)) {
      set(x, y, INK); // die border
      if (inRR(x, y, c, c, dieHalf - border, dieHalf - border, dieRad)) {
        set(x, y, WHITE);
        for (const [px, py] of pips) { const dx = x - (c + px), dy = y - (c + py); if (dx * dx + dy * dy <= pipR * pipR) set(x, y, INK); }
      }
    }
  }
  return encodePNG(size, buf);
}

writeFileSync(join(OUT, 'icon-192.png'), makeIcon(192, false));
writeFileSync(join(OUT, 'icon-512.png'), makeIcon(512, false));
writeFileSync(join(OUT, 'maskable-512.png'), makeIcon(512, true));
console.log('Wrote icon-192.png, icon-512.png, maskable-512.png to public/icons/');
