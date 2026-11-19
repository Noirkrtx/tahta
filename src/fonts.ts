/**
 * The Caveat handwriting font files (OFL 1.1). style.css declares them with
 * @font-face for the normal build; export.ts inlines them into SVG exports.
 *
 * The single-file artifact build (`npm run build:artifact`) inlines every
 * asset as a data: URI. To avoid carrying each font twice (once in the CSS,
 * once in the JS for exports), that build drops the CSS @font-face rules and
 * registers the same faces from here with the FontFace API instead.
 */
import { FONT_FAMILY } from './layout';
import latin500 from './assets/fonts/caveat-latin-500-normal.woff2?url';
import latinExt500 from './assets/fonts/caveat-latin-ext-500-normal.woff2?url';
import latin700 from './assets/fonts/caveat-latin-700-normal.woff2?url';
import latinExt700 from './assets/fonts/caveat-latin-ext-700-normal.woff2?url';

/** Same unicode-range values as in style.css. */
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

export const FONT_FILES = [
  { url: latin500, weight: 500, unicodeRange: LATIN },
  { url: latinExt500, weight: 500, unicodeRange: LATIN_EXT },
  { url: latin700, weight: 700, unicodeRange: LATIN },
  { url: latinExt700, weight: 700, unicodeRange: LATIN_EXT },
];

/** Register the font faces from script (artifact build only; see above). */
export function installFontFaces(): void {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  for (const f of FONT_FILES) {
    const face = new FontFace(FONT_FAMILY, `url(${f.url}) format('woff2')`, {
      style: 'normal',
      weight: String(f.weight),
      display: 'swap',
      unicodeRange: f.unicodeRange,
    });
    document.fonts.add(face);
  }
}
