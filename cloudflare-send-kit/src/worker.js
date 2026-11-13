// Free Cloudflare Worker: keeps the latest picture and hands it to the frame.
// Frame asks:   GET  /drawing.bmp          (no key; keep the Worker name long and random)
// Phone sends:  POST /send   header "X-Key: <your secret key>"   body = the 96,070-byte picture
const SIZE = 96070;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/drawing.bmp' && request.method === 'GET') {
      const img = await env.FRAME.get('current', 'arrayBuffer');
      if (!img) return new Response('No picture yet', { status: 404 });
      return new Response(img, {
        headers: {
          'content-type': 'image/bmp',
          'content-length': String(img.byteLength),
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/send' && request.method === 'POST') {
      const key = request.headers.get('x-key') || '';
      if (!env.SEND_KEY || key.length !== env.SEND_KEY.length || key !== env.SEND_KEY) {
        return new Response('Wrong key', { status: 401 });
      }
      const body = await request.arrayBuffer();
      const bytes = new Uint8Array(body);
      if (bytes.length !== SIZE || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
        return new Response('That is not a frame picture', { status: 400 });
      }
      await env.FRAME.put('current', body);
      return new Response('Sent', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};
