// Static preview of the production build, served under /tahta/ exactly like GitHub Pages.
// Usage: npm run build && npm run preview [-- port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const port = Number(process.argv[2]) || 4173;
const base = '/tahta/';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/') {
    res.writeHead(302, { location: base }).end();
    return;
  }
  const rel = path.startsWith(base) ? path.slice(base.length) || 'index.html' : null;
  const file = rel === null ? null : normalize(join(dist, rel));
  // Refuse anything outside dist/.
  if (!file || !file.startsWith(dist)) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`tahta preview: http://127.0.0.1:${port}${base}`);
});
