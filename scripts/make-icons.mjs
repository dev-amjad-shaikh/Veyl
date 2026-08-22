/**
 * Renders Veyl's icon at the three sizes Chrome asks for.
 *
 * Written by hand rather than pulled from a design tool so the shipped binary
 * is reproducible from source — which matters more than usual for an extension
 * that asks you to trust it.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [17, 20, 28];
const MARK = [255, 255, 255];
const ACCENT = [111, 157, 255];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from point to segment, used to draw strokes with soft edges. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const s = size;
  const radius = s * 0.23;
  const stroke = s * 0.115;
  const ss = 3; // supersampling

  // The mark is a chevron — a "V" — with a shorter second stroke, reading as a
  // shield at small sizes and a V at large ones.
  const left = [s * 0.28, s * 0.3];
  const bottom = [s * 0.5, s * 0.74];
  const right = [s * 0.72, s * 0.3];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let bg = 0;
      let mark = 0;
      let accent = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          // rounded square coverage
          const qx = Math.max(Math.abs(px - s / 2) - (s / 2 - radius), 0);
          const qy = Math.max(Math.abs(py - s / 2) - (s / 2 - radius), 0);
          if (Math.hypot(qx, qy) <= radius) bg += 1;

          const d1 = distanceToSegment(px, py, left[0], left[1], bottom[0], bottom[1]);
          const d2 = distanceToSegment(px, py, bottom[0], bottom[1], right[0], right[1]);
          if (d1 <= stroke / 2) mark += 1;
          else if (d2 <= stroke / 2) accent += 1;
        }
      }
      const total = ss * ss;
      const i = (y * s + x) * 4;
      const bgA = bg / total;
      const markA = mark / total;
      const accentA = accent / total;
      const colour =
        markA > 0 || accentA > 0
          ? blend(MARK, ACCENT, accentA / Math.max(markA + accentA, 1e-6))
          : BG;
      const coverage = Math.min(1, markA + accentA);
      const [r, g, b] = blend(BG, colour, coverage);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = Math.round(bgA * 255);
    }
  }
  return pixels;
}

function blend(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, render(size)));
  console.log(`public/icons/icon${size}.png`);
}
