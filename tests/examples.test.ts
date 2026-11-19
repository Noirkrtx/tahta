import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileScenario } from '../src/compile';
import { EXAMPLES, counterpart, defaultExample } from '../src/examples';
import { CANVAS, validateScenario, type Scenario } from '../src/schema';
import { buildTimeline } from '../src/timeline';
import { woff2Codepoints } from './woff2';

const dir = join(__dirname, '..', 'examples');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const fontDir = join(__dirname, '..', 'src', 'assets', 'fonts');

function load(file: string): Scenario {
  const r = validateScenario(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  if (!r.ok) throw new Error(`${file}: ${r.errors.join('; ')}`);
  return r.scenario;
}

/** Every string that is written on the board with the handwriting font. */
function boardStrings(s: Scenario): string[] {
  const out = [s.title, s.summary];
  for (const st of s.steps) {
    for (const el of st.elements) {
      if (el.type === 'text') out.push(el.text);
      if ((el.type === 'arrow' || el.type === 'arc') && el.label) out.push(el.label);
    }
  }
  return out;
}

describe('bundled font', () => {
  const cps = (w: number) =>
    new Set([
      ...woff2Codepoints(join(fontDir, `caveat-latin-${w}-normal.woff2`)),
      ...woff2Codepoints(join(fontDir, `caveat-latin-ext-${w}-normal.woff2`)),
    ]);

  it.each([500, 700])('weight %i covers the Turkish alphabet', (w) => {
    const have = cps(w);
    for (const ch of 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZabcçdefgğhıijklmnoöprsştuüvyz0123456789.,:;!?()+=%°²') {
      expect(have.has(ch.codePointAt(0) as number), `missing "${ch}" in weight ${w}`).toBe(true);
    }
  });

  it('covers every character written on the board in the examples', () => {
    const regular = cps(500);
    const bold = cps(700);
    for (const f of files) {
      const s = load(f);
      for (const str of boardStrings(s)) {
        for (const ch of str) {
          const cp = ch.codePointAt(0) as number;
          expect(regular.has(cp), `${f}: "${ch}" (U+${cp.toString(16)}) not in font`).toBe(true);
        }
      }
      for (const ch of s.title) expect(bold.has(ch.codePointAt(0) as number)).toBe(true);
    }
  });
});

describe('example scenarios', () => {
  it('has the required demos', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(EXAMPLES.map((e) => e.id)).toEqual(
      expect.arrayContaining(['mevsimler', 'seasons', 'kalp', 'pisagor', 'fotosentez']),
    );
    expect(counterpart('mevsimler', 'en')?.id).toBe('seasons');
    expect(counterpart('kalp', 'en')).toBeUndefined();
    expect(defaultExample('tr').lang).toBe('tr');
    expect(defaultExample('en').lang).toBe('en');
  });

  it('every registered example is backed by a file and validates', () => {
    for (const ex of EXAMPLES) {
      const r = validateScenario(ex.data);
      expect(r.ok, ex.id).toBe(true);
      if (r.ok) expect(r.scenario.lang).toBe(ex.lang);
    }
  });

  it.each(files)('%s follows the teaching format', (file) => {
    const s = load(file);
    expect(s.steps.length).toBeGreaterThanOrEqual(4);
    expect(s.steps.length).toBeLessThanOrEqual(10);
    expect(s.question).toBeTruthy();
    for (const st of s.steps) expect(st.narration, st.title).toBeTruthy();
  });

  it.each(files)('%s compiles inside the canvas without layout fixes', (file) => {
    const s = load(file);
    const compiled = compileScenario(s);
    expect(compiled.adjustments).toEqual([]);
    expect(compiled.steps).toHaveLength(s.steps.length + 1);
    for (const step of compiled.steps) {
      for (const op of step.groups.flat()) {
        if (op.kind === 'text') {
          const left = op.anchor === 'middle' ? op.x - op.width / 2 : op.anchor === 'end' ? op.x - op.width : op.x;
          expect(left, op.text).toBeGreaterThanOrEqual(0);
          expect(left + op.width, op.text).toBeLessThanOrEqual(CANVAS.width);
          expect(op.y, op.text).toBeLessThanOrEqual(CANVAS.height - 8);
        } else {
          const nums = (op.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
          for (const n of nums) {
            expect(n).toBeGreaterThanOrEqual(-20);
            expect(n).toBeLessThanOrEqual(CANVAS.width + 20);
          }
        }
      }
    }
    const tl = buildTimeline(compiled);
    expect(tl.total).toBeGreaterThan(10_000);
    expect(tl.total).toBeLessThan(180_000);
  });

  it('the seasons demos correct the distance misconception and state the tilt', () => {
    const tr = JSON.stringify(load('mevsimler.tr.json'));
    const en = JSON.stringify(load('seasons.en.json'));
    expect(tr).toContain('23,4°');
    expect(tr).toContain('Yanılgı');
    expect(tr).toContain('uzaklık değil');
    expect(en).toContain('23.4°');
    expect(en).toContain('Myth');
    expect(en).toContain('not distance');
  });

  it('the Pythagoras demo uses a consistent a, b, c triangle', () => {
    const s = load('pisagor.tr.json');
    const inner = s.steps[2].elements[0];
    expect(inner.type).toBe('polyline');
    if (inner.type !== 'polyline') return;
    const side = (i: number) => {
      const p = inner.points[i];
      const q = inner.points[(i + 1) % 4];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    };
    const c = side(0);
    // All four sides equal and perpendicular neighbours: the inner figure really is a square of side c.
    for (let i = 1; i < 4; i++) expect(side(i)).toBeCloseTo(c, 6);
    const [p0, p1, p2] = inner.points;
    expect((p1[0] - p0[0]) * (p2[0] - p1[0]) + (p1[1] - p0[1]) * (p2[1] - p1[1])).toBeCloseTo(0, 6);
    // a = 120, b = 210 in the drawing: a² + b² = c².
    expect(120 ** 2 + 210 ** 2).toBeCloseTo(c ** 2, 6);
  });
});
