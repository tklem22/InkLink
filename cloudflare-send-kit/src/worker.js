// Free Cloudflare Worker: keeps the latest picture and hands it to the frame.
// Frame asks:   GET  /drawing.bmp          (optional viewing key, see VIEW_KEY below)
// Phone sends:  POST /send   header "x-key: <your secret key>"   body = the 96,070-byte picture
//
// Secrets (set in Cloudflare, never in the repo):
//   SEND_KEY  required. Needed to send a picture.
//   VIEW_KEY  optional. If set, GET /drawing.bmp also needs header "x-frame-key: <VIEW_KEY>".
//             Leave it unset until the frame's firmware sends that header.

const SIZE = 96070;
const HEADER_HEX =
  '424d4677010000000000460000002800000020030000' + '20feffff01000200' +
  '0000000000770100' + '0000000000000000' + '0400000000000000' +
  'ffffffff000000ff0000ffff00ffffff';

const HEADER = new Uint8Array(HEADER_HEX.match(/../g).map((h) => parseInt(h, 16)));

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
      if (!env.SEND_KEY || !same(request.headers.get('x-key') || '', env.SEND_KEY)) {
        return new Response('Wrong key', { status: 401 });
      }
      const body = await request.arrayBuffer();
      if (!validHeader(new Uint8Array(body))) {
        return new Response('That is not a frame picture', { status: 400 });
      }
      await env.FRAME.put('current', body);
      return new Response('Sent', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};
