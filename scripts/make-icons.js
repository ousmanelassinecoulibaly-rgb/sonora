// Génère les icônes PNG de l'application (écran d'accueil du téléphone). Usage : node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
const ACCENT = [0x1e, 0xd4, 0xa0];
const DARK = [0x0b, 0x0b, 0x0b];

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x + 0.5, y + 0.5), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA 8 bits
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Rectangle arrondi (distance signée) avec anticrénelage
function roundRect(x, y, cx, cy, w, h, r) {
  const qx = Math.abs(x - cx) - w / 2 + r, qy = Math.abs(y - cy) - h / 2 + r;
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return Math.max(0, Math.min(1, 0.5 - d));
}

function icon(size, maskable) {
  const s = size / 24;
  // 4 barres d'égaliseur (mêmes proportions que le logo SVG), réduites pour la zone sûre « maskable »
  const k = maskable ? 0.72 : 1;
  const bars = [[5.5, 4], [9.75, 11], [14, 16], [18.25, 8]].map(([cx, h]) => [12 + (cx - 11.875) * k, h * k]);
  return png(size, (x, y) => {
    const bg = maskable ? 1 : roundRect(x, y, size / 2, size / 2, size, size, size * 0.22);
    let bar = 0;
    for (const [cx, h] of bars) bar = Math.max(bar, roundRect(x, y, cx * s, 12 * s, 3 * k * s, h * s, 1.5 * k * s));
    const c = ACCENT.map((v, i) => Math.round(v * (1 - bar) + DARK[i] * bar));
    return [...c, Math.round(255 * bg)];
  });
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), icon(size, false));
  fs.writeFileSync(path.join(OUT, `maskable-${size}.png`), icon(size, true));
}
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), icon(180, true));
console.log('Icônes générées dans', OUT);
