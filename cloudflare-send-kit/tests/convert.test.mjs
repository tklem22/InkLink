// Checks the picture converter produces exactly what the frame expects.
import assert from 'node:assert';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../public/convert.js');

const W = 800, H = 480;
function solid(r, g, b) {
  const a = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { a[i*4] = r; a[i*4+1] = g; a[i*4+2] = b; a[i*4+3] = 255; }
  return a;
}
function pixel(bmp, x, y) { return (bmp[70 + y * 200 + (x >> 2)] >> (6 - 2 * (x & 3))) & 3; }

// size and header
const white = C.toFrameBMP(solid(255, 255, 255), false);
assert.equal(white.length, 96070, 'file must be 96,070 bytes');
assert.equal(String.fromCharCode(white[0], white[1]), 'BM');
const dv = new DataView(white.buffer);
assert.equal(dv.getUint32(10, true), 70, 'pixels start at byte 70');
assert.equal(dv.getInt32(18, true), 800);
assert.equal(dv.getInt32(22, true), -480, 'top row first');
assert.equal(dv.getUint16(28, true), 2, '2 bits per pixel');

// header matches, byte for byte, the 70-byte header the InkLink server builds (createBmpBuffer in server/index.ts)
const expected = '424d4677010000000000460000002800000020030000' + '20feffff01000200' + '0000000000770100' + '0000000000000000' + '0400000000000000' + 'ffffffff000000ff0000ffff00ffffff';
const hex = Buffer.from(white.slice(0, 70)).toString('hex');
assert.equal(hex, expected, 'header must match the InkLink server header');

// solid colors map to 0 white / 1 black / 2 red everywhere
for (const [rgb, want] of [[[255,255,255],0],[[0,0,0],1],[[255,0,0],2]]) {
  const b = C.toFrameBMP(solid(...rgb), false);
  for (const [x, y] of [[0,0],[1,0],[2,0],[3,0],[799,479],[400,240]]) assert.equal(pixel(b, x, y), want);
}

// pixel packing: leftmost pixel in the high bits
const a = solid(255, 255, 255);
a.set([0,0,0,255], 0); a.set([255,0,0,255], 4); // x=0 black, x=1 red
const p = C.toFrameBMP(a, false);
assert.equal(pixel(p, 0, 0), 1); assert.equal(pixel(p, 1, 0), 2);
assert.equal(p[70] >> 6, 1, 'x=0 sits in the top two bits');

// see-through pixels count as white
const t = solid(0, 0, 0); for (let i = 0; i < W * H; i++) t[i*4+3] = 0;
assert.equal(pixel(C.toFrameBMP(t, false), 10, 10), 0);

// photo mode only ever uses the 3 colors
const g = solid(128, 128, 128);
const d = C.toFrameBMP(g, true);
const seen = new Set(); for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 5) seen.add(pixel(d, x, y));
assert.ok([...seen].every(v => v <= 2) && seen.size >= 2, 'gray dithers into black and white dots');
console.log('convert tests passed');
