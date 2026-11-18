// Makes ONE file (dist/worker-single.js) that holds the Worker AND the phone page, so it can be
// pasted into the Cloudflare dashboard's code editor. Run:  node build.mjs
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const assets = {
  '/': [read('./public/index.html'), 'text/html; charset=utf-8'],
  '/index.html': [read('./public/index.html'), 'text/html; charset=utf-8'],
  '/convert.js': [read('./public/convert.js'), 'text/javascript; charset=utf-8'],
  '/layout.js': [read('./public/layout.js'), 'text/javascript; charset=utf-8'],
};
const hook = '// ASSETS-HOOK (the single-file build puts the phone page here)';
const worker = read('./src/worker.js');
if (!worker.includes(hook)) throw new Error('hook line missing in src/worker.js');

const injected =
  'if (request.method === \'GET\' && Object.prototype.hasOwnProperty.call(ASSETS, url.pathname)) {\n' +
  '      return new Response(ASSETS[url.pathname][0], { headers: { \'content-type\': ASSETS[url.pathname][1] } });\n' +
  '    }';
// Cloudflare only wants the default export, so the test-only named exports lose their "export" word here.
const plain = worker.replace(/^export (async )?function/gm, '$1function');
const out = 'const ASSETS = ' + JSON.stringify(assets) + ';\n' + plain.replace(hook, injected);

fs.mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./dist/worker-single.js', import.meta.url), out);
console.log('wrote dist/worker-single.js (' + out.length + ' characters)');
