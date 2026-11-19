// Build tahta as one self-contained HTML file for use as a Claude artifact.
//
//   npm run build:artifact  ->  artifact/tahta-artifact.html
//
// Runs a normal Vite build with every asset inlined (the Caveat font files
// become base64 data: URIs, registered from script by src/fonts.ts), then folds the emitted JS and CSS
// into index.html. The result loads nothing from the network, so it works in
// the artifact sandbox (which blocks most external requests) and from file://.
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'artifact', 'tahta-artifact.html');
const tmp = await mkdtemp(path.join(tmpdir(), 'tahta-artifact-'));

try {
  await build({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'artifact',
    base: './',
    logLevel: 'warn',
    plugins: [
      {
        // The fonts are registered from script in this build (src/fonts.ts), so the
        // CSS copies would only double the file size.
        name: 'tahta-artifact-drop-css-fonts',
        enforce: 'pre',
        transform(code, id) {
          if (!id.split('?')[0].endsWith('/src/style.css')) return null;
          const out = code.replace(/@font-face\s*\{[^}]*\}\s*/g, '');
          if (out === code) throw new Error('no @font-face rules found in style.css');
          return { code: out, map: null };
        },
      },
    ],
    build: {
      outDir: tmp,
      emptyOutDir: true,
      assetsInlineLimit: () => true,
      cssCodeSplit: false,
      modulePreload: false,
      copyPublicDir: false,
    },
  });

  let html = await readFile(path.join(tmp, 'index.html'), 'utf8');
  const assetDir = path.join(tmp, 'assets');
  const files = await readdir(assetDir);
  const leftovers = files.filter((f) => !f.endsWith('.js') && !f.endsWith('.css'));
  if (leftovers.length) throw new Error(`assets were not inlined: ${leftovers.join(', ')}`);

  const read = (rel) => readFile(path.join(tmp, rel.replace(/^\.\//, '')), 'utf8');
  // `</script` or `</style` inside the code would end the inline element early.
  const safe = (code, tag) => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

  const scripts = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
  const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)];
  if (scripts.length !== 1) throw new Error(`expected one module script, found ${scripts.length}`);
  for (const [tag, href] of styles) {
    html = html.replace(tag, () => '');
    const css = safe(await read(href), 'style');
    html = html.replace('</head>', () => `<style>\n${css}\n</style>\n</head>`);
  }
  {
    const [tag, src] = scripts[0];
    html = html.replace(tag, () => '');
    const js = safe(await read(src), 'script');
    // Module scripts are deferred; placing it at the end of <body> keeps the same order.
    html = html.replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);
  }
  if (/\s(?:src|href)="\.\/assets\//.test(html)) throw new Error('an asset reference was left in the HTML');

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, html);
  const { size } = await stat(outFile);
  console.log(`artifact/tahta-artifact.html  ${(size / 1024).toFixed(1)} KiB (${size} bytes)`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
