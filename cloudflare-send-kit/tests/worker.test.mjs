// Checks the Worker: key check, size check, store and serve. Uses a pretend storage box.
import assert from 'node:assert';
import worker from '../src/worker.js';

const store = new Map();
const env = { SEND_KEY: 'secret-key-123', FRAME: { async get(k) { return store.get(k) ?? null; }, async put(k, v) { store.set(k, v); } } };
const call = (path, init) => worker.fetch(new Request('https://x.workers.dev' + path, init), env);

const good = new Uint8Array(96070); good[0] = 0x42; good[1] = 0x4d; good[100] = 7;

assert.equal((await call('/drawing.bmp')).status, 404, 'nothing yet');
assert.equal((await call('/send', { method: 'POST', body: good })).status, 401, 'no key');
assert.equal((await call('/send', { method: 'POST', headers: { 'x-key': 'wrong' }, body: good })).status, 401, 'wrong key');
assert.equal((await call('/send', { method: 'POST', headers: { 'x-key': env.SEND_KEY }, body: new Uint8Array(10) })).status, 400, 'wrong size');
const notBmp = new Uint8Array(96070);
assert.equal((await call('/send', { method: 'POST', headers: { 'x-key': env.SEND_KEY }, body: notBmp })).status, 400, 'not a BMP');
assert.equal((await call('/send', { method: 'POST', headers: { 'x-key': env.SEND_KEY }, body: good })).status, 200, 'good send');
const r = await call('/drawing.bmp');
assert.equal(r.status, 200);
assert.equal(r.headers.get('content-length'), '96070');
assert.equal(r.headers.get('cache-control'), 'no-store');
const back = new Uint8Array(await r.arrayBuffer());
assert.deepEqual(back, good, 'picture comes back identical');
assert.equal((await call('/send')).status, 404, 'GET /send is not a thing');
console.log('worker tests passed');
