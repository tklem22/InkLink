// Checks the daily message bank: no repeats, one pick per day, 6 AM New York time, dated messages, safety checks.
import assert from 'node:assert';
import { createRequire } from 'node:module';
import worker, { runDaily, pickNext, etNow } from '../src/worker.js';
const C = createRequire(import.meta.url)('../public/convert.js');

const store = new Map();
const kv = {
  async get(k, type) { const v = store.get(k); if (v === undefined) return null; return type === 'arrayBuffer' ? v.slice(0) : v; },
  async put(k, v) { store.set(k, typeof v === 'string' ? v : v.slice(0)); },
  async delete(k) { store.delete(k); },
};
const env = { SEND_KEY: 'secret-key-123', FRAME: kv };
const call = (path, init, e) => worker.fetch(new Request('https://x.workers.dev' + path, init), e || env);
const KEY = { 'x-key': env.SEND_KEY };

// a distinct valid picture per message (a square at a different spot), made by the real converter
function pic(n) {
  const rgba = new Uint8Array(800 * 480 * 4).fill(255);
  for (let y = 50; y < 90; y++) for (let x = 20 * n; x < 20 * n + 40; x++) { const i = (y * 800 + x) * 4; rgba[i] = rgba[i+1] = rgba[i+2] = 0; }
  return C.toFrameBMP(rgba, false);
}
const add = (text, n, date) =>
  call('/bank/add?text=' + encodeURIComponent(text) + (date ? '&date=' + date : ''), { method: 'POST', headers: KEY, body: pic(n) });
const list = async () => (await call('/bank/list', { headers: KEY })).json();

// ---- safety ----
assert.equal((await call('/bank/list')).status, 401, 'list needs the key');
assert.equal((await call('/bank/add?text=hi', { method: 'POST', body: pic(1) })).status, 401, 'add needs the key');
assert.equal((await call('/bank/pick-now', { method: 'POST' })).status, 401, 'pick-now needs the key');
assert.equal((await call('/bank/remove?id=x', { method: 'POST' })).status, 401, 'remove needs the key');
assert.equal((await call('/bank/add?text=hi', { method: 'POST', headers: KEY, body: new Uint8Array(10) })).status, 400, 'not a picture');
assert.equal((await call('/bank/add?text=', { method: 'POST', headers: KEY, body: pic(1) })).status, 400, 'no words');
assert.equal((await call('/bank/add?text=' + 'a'.repeat(301), { method: 'POST', headers: KEY, body: pic(1) })).status, 400, 'too long');
assert.equal((await call('/bank/add?text=hi&date=nope', { method: 'POST', headers: KEY, body: pic(1) })).status, 400, 'bad date');
assert.equal((await list()).total, 0, 'nothing was added by the bad requests');

// ---- adding, and no duplicates ----
for (let n = 1; n <= 5; n++) assert.equal((await add('I love you because reason ' + n, n)).status, 200);
assert.equal((await add('  i LOVE you   because reason 3 ', 9)).status, 409, 'same words (any spacing or capitals) are refused');
let l = await list();
assert.equal(l.total, 5); assert.equal(l.left, 5); assert.equal(l.used, 0);

// ---- time: 6 AM New York, winter and summer ----
assert.equal(etNow(new Date('2026-12-06T11:00:00Z')).hour, 6, '6 AM winter time = 11:00 UTC');
assert.equal(etNow(new Date('2026-07-01T10:00:00Z')).hour, 6, '6 AM summer time = 10:00 UTC');
assert.equal(etNow(new Date('2026-12-06T11:00:00Z')).ymd, '2026-12-06');

// ---- the morning run ----
assert.equal((await runDaily(env, new Date('2026-12-01T10:00:00Z'))).status, 'not-morning', '5 AM: too early');
assert.equal((await runDaily(env, new Date('2026-12-01T21:00:00Z'))).status, 'not-morning', '4 PM: not in the morning window');
const noImageYet = await call('/drawing.bmp');
assert.ok(new Uint8Array(await noImageYet.arrayBuffer()).slice(70).every((b) => b === 0), 'nothing picked yet: still blank');

const seen = new Set();
const days = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'];
for (const d of days) {
  const r = await runDaily(env, new Date(d + 'T11:05:00Z'));
  assert.equal(r.status, 'picked', d + ' picks');
  assert.ok(!seen.has(r.id), 'no repeats: ' + r.text);
  seen.add(r.id);
  // the frame now serves exactly that message's picture
  const text = r.text; const n = Number(text.slice(-1));
  const served = new Uint8Array(await (await call('/drawing.bmp')).arrayBuffer());
  assert.deepEqual(served, pic(n), 'frame serves the picked picture');
  // a second run the same morning does nothing
  assert.equal((await runDaily(env, new Date(d + 'T12:05:00Z'))).status, 'already', 'only once a day');
}
assert.equal(seen.size, 5, 'all five messages used once');
l = await list(); assert.equal(l.left, 0); assert.equal(l.used, 5);

// ---- empty bank: frame keeps the last picture, nothing breaks ----
const before = new Uint8Array(await (await call('/drawing.bmp')).arrayBuffer());
assert.equal((await runDaily(env, new Date('2026-12-06T11:05:00Z'))).status, 'empty');
assert.deepEqual(new Uint8Array(await (await call('/drawing.bmp')).arrayBuffer()), before, 'last picture stays');

// ---- catch-up: the 6 o'clock run missed, the 8 o'clock run still does it ----
assert.equal((await add('New one for the catch-up', 6)).status, 200);
assert.equal((await runDaily(env, new Date('2026-12-07T13:00:00Z'))).status, 'picked', '8 AM catch-up');

// ---- dated message: kept for its day, used on that day, never early ----
assert.equal((await add('Happy anniversary my love', 7, '12-10')).status, 200);
assert.equal((await add('Everyday message', 8)).status, 200);
let r = await runDaily(env, new Date('2026-12-08T11:05:00Z'));
assert.equal(r.text, 'Everyday message', 'dated message is not used early');
assert.equal((await runDaily(env, new Date('2026-12-09T11:05:00Z'))).status, 'empty', 'dated message still waits');
r = await runDaily(env, new Date('2026-12-10T11:05:00Z'));
assert.equal(r.text, 'Happy anniversary my love', 'dated message used on its day');
assert.equal((await runDaily(env, new Date('2026-12-10T12:00:00Z'))).status, 'already');

// ---- pick-now (testing) and remove ----
assert.equal((await add('Spare message', 10)).status, 200);
const pn = await (await call('/bank/pick-now', { method: 'POST', headers: KEY })).json();
assert.equal(pn.status, 'picked'); assert.equal(pn.text, 'Spare message');
assert.equal((await add('To be removed', 11)).status, 200);
l = await list();
const rm = l.items.find((i) => i.text === 'To be removed');
assert.equal((await call('/bank/remove?id=' + rm.id, { method: 'POST', headers: KEY })).status, 200);
assert.equal(store.has('bank:' + rm.id), false, 'picture deleted too');
assert.equal((await call('/bank/remove?id=' + rm.id, { method: 'POST', headers: KEY })).status, 404);
assert.equal((await list()).items.some((i) => i.text === 'To be removed'), false);

// ---- a bank picture that went missing is skipped, not fatal ----
assert.equal((await add('Lost picture', 12)).status, 200);
assert.equal((await add('Good picture', 13)).status, 200);
const lost = (await list()).items.find((i) => i.text === 'Lost picture');
store.delete('bank:' + lost.id);
const idxNow = JSON.parse(store.get('bank-index')); idxNow.lastPick = null; store.set('bank-index', JSON.stringify(idxNow));
r = await pickNext(env, etNow(new Date('2026-12-11T11:05:00Z')), false);
assert.equal(r.text, 'Good picture', 'skips the missing picture');

// ---- the scheduled hook runs the same thing ----
const waits = [];
await worker.scheduled({ scheduledTime: Date.parse('2026-12-12T11:00:00Z') }, env, { waitUntil: (p) => waits.push(p) });
await Promise.all(waits);
console.log('bank tests passed');
