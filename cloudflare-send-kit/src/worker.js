// Free Cloudflare Worker: keeps the latest picture and hands it to the frame.
// Frame asks:   GET  /drawing.bmp          (optional viewing key, see VIEW_KEY below)
// Phone sends:  POST /send   header "x-key: <your secret key>"   body = the 96,070-byte picture
//
// Daily message bank (every morning one unused message picture becomes the frame's picture):
//   POST /bank/add?text=...&date=MM-DD   body = picture   add one message (no repeats: same words are refused)
//   GET  /bank/list                                      what is in the bank, what is left
//   POST /bank/remove?id=...                             take one out
//   POST /bank/pick-now                                  pick the next one right now (for testing)
//   All of these need the header "x-key: <your secret key>".
//
// Secrets (set in Cloudflare, never in the repo):
//   SEND_KEY  required. Needed to send a picture or touch the bank.
//   VIEW_KEY  optional. If set, GET /drawing.bmp also needs header "x-frame-key: <VIEW_KEY>".
//             Leave it unset until the frame's firmware sends that header.

const SIZE = 96070;
const HEADER_HEX =
  '424d4677010000000000460000002800000020030000' + '20feffff01000200' +
  '0000000000770100' + '0000000000000000' + '0400000000000000' +
  'ffffffff000000ff0000ffff00ffffff';

const HEADER = new Uint8Array(HEADER_HEX.match(/../g).map((h) => parseInt(h, 16)));

// The morning swap happens at this hour, New York time (7 AM wake-up, 8 AM at the desk).
const TZ = 'America/New_York';
const PICK_HOUR = 6;
const CATCH_UP_UNTIL_HOUR = 11; // if the 6 o'clock run was missed, a later run this morning still does it
const MAX_BANK = 800;
const MAX_TEXT = 300;

// Shown until the first picture is sent: an all-white picture (every pixel byte 0 = white).
function blankPicture() {
  const b = new Uint8Array(SIZE);
  b.set(HEADER, 0);
  return b.buffer;
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validHeader(bytes) {
  if (bytes.length !== SIZE) return false;
  for (let i = 0; i < HEADER.length; i++) if (bytes[i] !== HEADER[i]) return false;
  return true;
}

// ---- time (New York clock, handles winter/summer time by itself) ----
export function etNow(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date || new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, md: `${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// ---- the bank ----
// index = { items: [{ id, text, date, usedOn }], lastPick: 'YYYY-MM-DD' | null }
async function loadIndex(env) {
  const raw = await env.FRAME.get('bank-index');
  if (!raw) return { items: [], lastPick: null };
  try { return JSON.parse(raw); } catch (e) { return { items: [], lastPick: null }; }
}
async function saveIndex(env, idx) { await env.FRAME.put('bank-index', JSON.stringify(idx)); }

function normalize(text) { return String(text).toLowerCase().replace(/\s+/g, ' ').trim(); }
function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
function randomBelow(n) {
  const b = crypto.getRandomValues(new Uint32Array(1));
  return b[0] % n;
}
function validDate(d) { return d === '' || /^(\d{4}-)?\d{2}-\d{2}$/.test(d); }
function matchesToday(date, now) { return date === now.md || date === now.ymd; }

function summary(idx) {
  const unused = idx.items.filter((i) => !i.usedOn);
  return {
    total: idx.items.length,
    left: unused.length,
    used: idx.items.length - unused.length,
    lastPick: idx.lastPick,
    items: idx.items.map((i) => ({ id: i.id, text: i.text, date: i.date || '', usedOn: i.usedOn || '' })),
  };
}

// Picks today's message. Never repeats: a used message is never picked again.
// A message with a date (like 12-06) is kept for that day only. Everything else is picked at random.
export async function pickNext(env, now, force) {
  const idx = await loadIndex(env);
  if (!force && idx.lastPick === now.ymd) return { status: 'already' };
  const unused = idx.items.filter((i) => !i.usedOn);
  const todays = unused.filter((i) => i.date && matchesToday(i.date, now));
  const pool = todays.length ? todays : unused.filter((i) => !i.date);
  const tried = new Set();
  while (tried.size < pool.length) {
    let choice;
    do { choice = pool[randomBelow(pool.length)]; } while (tried.has(choice.id));
    tried.add(choice.id);
    const img = await env.FRAME.get('bank:' + choice.id, 'arrayBuffer');
    if (!img || !validHeader(new Uint8Array(img))) continue; // picture missing: try another one
    await env.FRAME.put('current', img);
    choice.usedOn = now.ymd;
    idx.lastPick = now.ymd;
    await saveIndex(env, idx);
    return { status: 'picked', id: choice.id, text: choice.text, left: idx.items.filter((i) => !i.usedOn).length };
  }
  return { status: 'empty' }; // nothing left: the frame keeps showing the last picture
}

// Called by Cloudflare's timer (every hour). Only acts in the morning window, once per day.
export async function runDaily(env, date) {
  const now = etNow(date);
  if (now.hour < PICK_HOUR || now.hour > CATCH_UP_UNTIL_HOUR) return { status: 'not-morning' };
  return pickNext(env, now, false);
}

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const authed = (request, env) => !!env.SEND_KEY && same(request.headers.get('x-key') || '', env.SEND_KEY);

async function handleBank(request, env, url) {
  if (!authed(request, env)) return new Response('Wrong key', { status: 401 });
  const path = url.pathname;

  if (path === '/bank/list' && request.method === 'GET') {
    return json(summary(await loadIndex(env)));
  }

  if (path === '/bank/add' && request.method === 'POST') {
    const text = (url.searchParams.get('text') || '').replace(/\s+/g, ' ').trim();
    const date = (url.searchParams.get('date') || '').trim();
    if (!text) return new Response('No words', { status: 400 });
    if (text.length > MAX_TEXT) return new Response('Too long', { status: 400 });
    if (!validDate(date)) return new Response('Date must look like 12-06 or 2026-12-06', { status: 400 });
    const body = await request.arrayBuffer();
    if (!validHeader(new Uint8Array(body))) return new Response('That is not a frame picture', { status: 400 });
    const idx = await loadIndex(env);
    if (idx.items.some((i) => normalize(i.text) === normalize(text))) return new Response('Already in the bank', { status: 409 });
    if (idx.items.length >= MAX_BANK) return new Response('Bank is full', { status: 400 });
    const id = randomId();
    await env.FRAME.put('bank:' + id, body);
    idx.items.push({ id, text, date, usedOn: '' });
    await saveIndex(env, idx);
    return json({ ok: true, id, ...summary(idx), items: undefined });
  }

  if (path === '/bank/remove' && request.method === 'POST') {
    const id = url.searchParams.get('id') || '';
    const idx = await loadIndex(env);
    const at = idx.items.findIndex((i) => i.id === id);
    if (at < 0) return new Response('Not in the bank', { status: 404 });
    idx.items.splice(at, 1);
    await saveIndex(env, idx);
    await env.FRAME.delete('bank:' + id);
    return json({ ok: true, ...summary(idx), items: undefined });
  }

  if (path === '/bank/pick-now' && request.method === 'POST') {
    return json(await pickNext(env, etNow(new Date()), true));
  }

  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // ASSETS-HOOK (the single-file build puts the phone page here)

    if (url.pathname === '/drawing.bmp' && request.method === 'GET') {
      if (env.VIEW_KEY && !same(request.headers.get('x-frame-key') || '', env.VIEW_KEY)) {
        return new Response('Not allowed', { status: 401 });
      }
      const img = (await env.FRAME.get('current', 'arrayBuffer')) || blankPicture();
      return new Response(img, {
        headers: {
          'content-type': 'image/bmp',
          'content-length': String(img.byteLength),
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/send' && request.method === 'POST') {
      if (!authed(request, env)) {
        return new Response('Wrong key', { status: 401 });
      }
      const body = await request.arrayBuffer();
      if (!validHeader(new Uint8Array(body))) {
        return new Response('That is not a frame picture', { status: 400 });
      }
      await env.FRAME.put('current', body);
      return new Response('Sent', { status: 200 });
    }

    if (url.pathname.startsWith('/bank/')) return handleBank(request, env, url);

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDaily(env, new Date(event.scheduledTime)));
  },
};
