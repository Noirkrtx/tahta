/** Export helpers: scenario JSON, final board as standalone SVG, PNG via canvas. */
import { buildBoard } from './board';
import { FONT_FAMILY, type Measure } from './layout';
import { CANVAS, type Scenario } from './schema';
import latin500 from './assets/fonts/caveat-latin-500-normal.woff2?url';
import latinExt500 from './assets/fonts/caveat-latin-ext-500-normal.woff2?url';
import latin700 from './assets/fonts/caveat-latin-700-normal.woff2?url';
import latinExt700 from './assets/fonts/caveat-latin-ext-700-normal.woff2?url';

const FONT_FILES = [
  { url: latin500, weight: 500 },
  { url: latinExt500, weight: 500 },
  { url: latin700, weight: 700 },
  { url: latinExt700, weight: 700 },
];

let fontCssCache: Promise<string> | null = null;

async function toDataUrl(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

/** @font-face rules with the font files inlined, so an exported SVG renders the same anywhere. */
function embeddedFontCss(): Promise<string> {
  fontCssCache ??= Promise.all(
    FONT_FILES.map(async (f) => {
      const data = await toDataUrl(f.url);
      return `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:${f.weight};src:url(${data}) format('woff2');}`;
    }),
  ).then((rules) => rules.join(''));
  return fontCssCache;
}

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  const slug = s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'tahta';
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function scenarioBlob(scn: Scenario): Blob {
  return new Blob([JSON.stringify(scn, null, 2)], { type: 'application/json' });
}

/** The finished board (everything drawn) as a standalone SVG string. */
export async function finalSvg(scn: Scenario, measure: Measure): Promise<string> {
  const board = buildBoard(scn, measure);
  board.apply(board.timeline.total);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = await embeddedFontCss();
  board.svg.querySelector('defs')?.appendChild(style);
  return new XMLSerializer().serializeToString(board.svg);
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('could not rasterise SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS.width * scale;
    canvas.height = CANVAS.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
