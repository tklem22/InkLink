// Checks the Worker: key checks, header check, store and serve. Uses a pretend storage box.
import assert from 'node:assert';
import { createRequire } from 'node:module';
import worker from '../src/worker.js';
const C = createRequire(import.meta.url)('../public/convert.js');

const store = new Map();
const kv = { async get(k) { return store.get(k) ?? null; }, async put(k, v) { store.set(k, v); } };
const call = (env, path, init) => worker.fetch(new Request('https://x.workers.dev' + path, init), env);
const env = { SEND_KEY: 'secret-key-123', FRAME: kv };

// a real picture made by the real converter (red square on white)
const rgba = new Uint8Array(800 * 480 * 4).fill(255);
for (let y = 100; y < 300; y++) for (let x = 200; x < 400; x++) { const i = (y * 800 + x) * 4; rgba[i+1] = 0; rgba[i+2] = 0; }
const good = C.toFrameBMP(rgba, false);
assert.equal(good.length, 96070);

// before any send: the frame still gets a valid all-white picture (not a 404)
let r = await call(env, '/drawing.bmp');
assert.equal(r.status, 200, 'blank picture before first send');
const blank = new Uint8Array(await r.arrayBuffer());
assert.equal(blank.length, 96070);
assert.equal(String.fromCharCode(blank[0], blank[1]), 'BM');
assert.ok(blank.slice(70).every((b) => b === 0), 'blank means all white');

// sending
const send = (headers, body) => call(env, '/send', { method: 'POST', headers, body });
assert.equal((await send({}, good)).status, 401, 'no key');
assert.equal((await send({ 'x-key': 'wrong' }, good)).status, 401, 'wrong key');
assert.equal((await send({ 'x-key': 'secret-key-123x' }, good)).status, 401, 'longer wrong key');
assert.equal((await send({ 'x-key': env.SEND_KEY }, new Uint8Array(10))).status, 400, 'wrong size');
assert.equal((await send({ 'x-key': env.SEND_KEY }, new Uint8Array(96070))).status, 400, 'not a BMP');
const badHeader = Uint8Array.from(good); badHeader[22] = 0xe0; // wrong height
assert.equal((await send({ 'x-key': env.SEND_KEY }, badHeader)).status, 400, 'header must match exactly');
assert.equal((await send({ 'x-key': env.SEND_KEY }, good)).status, 200, 'real converter picture accepted');

// serving
r = await call(env, '/drawing.bmp');
assert.equal(r.status, 200);
assert.equal(r.headers.get('content-length'), '96070');
assert.equal(r.headers.get('cache-control'), 'no-store');
assert.deepEqual(new Uint8Array(await r.arrayBuffer()), good, 'picture comes back identical');
assert.equal((await call(env, '/send')).status, 404, 'GET /send is not a thing');

// optional viewing key
const env2 = { SEND_KEY: 'secret-key-123', VIEW_KEY: 'view-key-456', FRAME: kv };
assert.equal((await call(env2, '/drawing.bmp')).status, 401, 'viewing key required when set');
assert.equal((await call(env2, '/drawing.bmp', { headers: { 'x-frame-key': 'nope' } })).status, 401);
r = await call(env2, '/drawing.bmp', { headers: { 'x-frame-key': 'view-key-456' } });
assert.equal(r.status, 200, 'right viewing key works');
console.log('worker tests passed');
