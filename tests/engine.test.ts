import { describe, expect, it } from 'vitest';
import { compileScenario, labelPlacement } from '../src/compile';
import { estimateWidth, makeBlock, overlaps, resolveCollision, wrapText, defaultMaxWidth, REGIONS } from '../src/layout';
import {
  chainLength,
  chainToD,
  dashChain,
  hashSeed,
  makeRand,
  roughArc,
  roughEllipse,
  roughLine,
  roughPolyline,
  sampleChain,
} from '../src/rough';
import { parsePathData, type Scenario } from '../src/schema';
import {
  GAP_BETWEEN_ELEMENTS,
  buildTimeline,
  holdFor,
  nextTime,
  opProgress,
  prevTime,
  stepIndexAt,
} from '../src/timeline';

const scn: Scenario = {
  version: 1,
  lang: 'tr',
  title: 'Deneme tahtası',
  summary: 'Kısa bir özet cümlesi.',
  steps: [
    {
      title: 'Bir',
      narration: 'Birinci adımın açıklaması.',
      elements: [
        { type: 'text', x: 60, y: 300, text: 'Merhaba dünya', size: 'sm' },
        { type: 'circle', cx: 1000, cy: 500, r: 100, fill: 'amber' },
      ],
    },
    {
      title: 'İki',
      elements: [
        { type: 'arrow', x1: 800, y1: 400, x2: 1200, y2: 400, label: 'etiket' },
        { type: 'line', x1: 800, y1: 700, x2: 1200, y2: 700, dashed: true },
      ],
    },
  ],
};

describe('rough geometry', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    const a = chainToD(roughEllipse(500, 400, 120, 80, 0, makeRand(hashSeed('x'))));
    const b = chainToD(roughEllipse(500, 400, 120, 80, 0, makeRand(hashSeed('x'))));
    const c = chainToD(roughEllipse(500, 400, 120, 80, 0, makeRand(hashSeed('y'))));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('produces only whitelisted path data', () => {
    const r = makeRand(7);
    const ds = [
      chainToD(roughLine([0, 0], [300, 40], r)),
      chainToD(roughPolyline([[0, 0], [100, 0], [100, 100]], true, r)),
      chainToD(roughArc(100, 100, 60, 0, 90, r)),
      ...dashChain(roughLine([0, 0], [300, 0], r)).map((s) => s.d),
    ];
    for (const d of ds) expect(parsePathData(d).ok, d).toBe(true);
  });

  it('wobbles a little but stays close to the ideal shape', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = makeRand(seed);
      const line = roughLine([100, 100], [500, 100], r);
      for (const [, y] of sampleChain(line)) expect(Math.abs(y - 100)).toBeLessThan(7);
      const circle = roughEllipse(400, 300, 100, 100, 0, r);
      for (const [x, y] of sampleChain(circle)) {
        const d = Math.hypot(x - 400, y - 300);
        expect(d).toBeGreaterThan(92);
        expect(d).toBeLessThan(108);
      }
      // One full turn plus a small overshoot.
      expect(chainLength(circle)).toBeGreaterThan(2 * Math.PI * 100 * 0.98);
      expect(chainLength(circle)).toBeLessThan(2 * Math.PI * 100 * 1.12);
    }
  });

  it('arc follows the screen convention: 90° points up', () => {
    const arc = roughArc(100, 100, 50, 0, 90, makeRand(1));
    const end = arc.segs[arc.segs.length - 1].p;
    expect(arc.start[0]).toBeGreaterThan(145);
    expect(end[1]).toBeLessThan(55);
  });

  it('dashes cover roughly half of the line, in order', () => {
    const dashes = dashChain(roughLine([0, 0], [600, 0], makeRand(3)));
    expect(dashes.length).toBeGreaterThan(15);
    const total = dashes.reduce((s, d) => s + d.len, 0);
    expect(total).toBeGreaterThan(250);
    expect(total).toBeLessThan(420);
  });
});

describe('layout', () => {
  it('wraps text to the given width', () => {
    const lines = wrapText('bir iki üç dört beş altı yedi sekiz dokuz on', 150, 34, 500, estimateWidth);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(estimateWidth(l, 34, 500)).toBeLessThanOrEqual(150);
    expect(lines.join(' ')).toBe('bir iki üç dört beş altı yedi sekiz dokuz on');
  });

  it('keeps left-column text out of the drawing area by default', () => {
    expect(defaultMaxWidth(60, 'start')).toBe(REGIONS.text.right - 60);
    expect(defaultMaxWidth(60, 'start', 1200)).toBe(1200);
    expect(defaultMaxWidth(900, 'start')).toBe(1600 - 40 - 900);
    expect(defaultMaxWidth(1500, 'middle')).toBe(160);
  });

  it('pushes an overlapping block down until it is clear', () => {
    const a = makeBlock('ilk satır burada', 60, 300, 34, 500, 'start', 600, estimateWidth);
    const b = makeBlock('ikinci satır da burada', 60, 310, 34, 500, 'start', 600, estimateWidth);
    expect(overlaps(a.box, b.box)).toBe(true);
    const moved = resolveCollision(b, [a.box]);
    expect(moved).toBeGreaterThan(0);
    expect(overlaps(a.box, b.box)).toBe(false);
    expect(b.box.y).toBeGreaterThanOrEqual(a.box.y + a.box.h);
  });

  it('does not push text off the bottom of the canvas', () => {
    const a = makeBlock('alt satır', 60, 880, 34, 500, 'start', 600, estimateWidth);
    const b = makeBlock('alt satır', 60, 880, 34, 500, 'start', 600, estimateWidth);
    resolveCollision(b, [a.box]);
    expect(b.box.y + b.box.h).toBeLessThanOrEqual(900);
  });

  it('shifts blocks that would leave the canvas sideways', () => {
    const b = makeBlock('çok uzun bir etiket metni', 1590, 400, 34, 500, 'middle', 600, estimateWidth);
    expect(b.box.x + b.box.w).toBeLessThanOrEqual(1600);
  });

  it('records automatic fixes when a scenario has overlapping text', () => {
    const clash: Scenario = {
      ...scn,
      steps: [
        {
          title: 'x',
          elements: [
            { type: 'text', x: 60, y: 300, text: 'aynı yere yazılan satır' },
            { type: 'text', x: 60, y: 300, text: 'aynı yere yazılan satır' },
          ],
        },
      ],
    };
    const c = compileScenario(clash);
    expect(c.adjustments).toHaveLength(1);
    const [first, second] = c.steps[1].groups.map((g) => g[0]);
    expect(first.kind === 'text' && second.kind === 'text' && second.y > first.y + 30).toBe(true);
  });

  it('places labels above horizontal arrows and beside vertical ones', () => {
    const h = labelPlacement([0, 100], [200, 100]);
    expect(h.anchor).toBe('middle');
    expect(h.y).toBeLessThan(100);
    const v = labelPlacement([100, 0], [100, 200]);
    expect(v.anchor).toBe('start');
    expect(v.x).toBeGreaterThan(100);
  });
});

describe('compile + timeline', () => {
  const compiled = compileScenario(scn);
  const tl = buildTimeline(compiled);

  it('adds the intro step and keeps one group per element', () => {
    expect(compiled.steps).toHaveLength(3);
    expect(compiled.steps[0].groups).toHaveLength(3); // title, underline, summary
    expect(compiled.steps[1].groups).toHaveLength(2);
    const circle = compiled.steps[1].groups[1];
    expect(circle.map((o) => o.kind)).toEqual(['stroke', 'fill']);
    const arrow = compiled.steps[2].groups[0];
    expect(arrow.map((o) => o.kind)).toEqual(['stroke', 'stroke', 'stroke', 'text']);
    expect(compiled.steps[2].groups[1].length).toBeGreaterThan(8); // dashes
  });

  it('is deterministic', () => {
    expect(JSON.stringify(compileScenario(scn))).toBe(JSON.stringify(compiled));
  });

  it('orders operations without overlap and steps back to back', () => {
    for (let i = 1; i < tl.ops.length; i++) {
      expect(tl.ops[i].start).toBeGreaterThanOrEqual(tl.ops[i - 1].end);
    }
    expect(tl.steps[0].start).toBe(0);
    for (let i = 1; i < tl.steps.length; i++) {
      expect(tl.steps[i].start).toBe(tl.steps[i - 1].end);
      expect(tl.steps[i - 1].end - tl.steps[i - 1].drawEnd).toBe(holdFor(tl.steps[i - 1].narration));
    }
    expect(tl.total).toBe(tl.steps[2].drawEnd);
    const s1 = tl.ops.filter((o) => o.step === 1);
    const firstOfCircle = s1.find((o) => o.kind === 'stroke');
    const text = s1[0];
    expect((firstOfCircle?.start ?? 0) - text.end).toBe(GAP_BETWEEN_ELEMENTS);
  });

  it('reading pause grows with narration and is capped', () => {
    expect(holdFor(undefined)).toBe(700);
    expect(holdFor('x'.repeat(10))).toBe(1100);
    expect(holdFor('x'.repeat(1000))).toBe(5200);
  });

  it('maps time to step index and operation progress', () => {
    expect(stepIndexAt(tl, 0)).toBe(0);
    expect(stepIndexAt(tl, tl.steps[1].start)).toBe(1);
    expect(stepIndexAt(tl, tl.steps[1].start - 1)).toBe(0);
    expect(stepIndexAt(tl, tl.total + 999)).toBe(2);
    const op = tl.ops[0];
    expect(opProgress(op, op.start - 1)).toBe(0);
    expect(opProgress(op, op.end + 1)).toBe(1);
    expect(opProgress(op, (op.start + op.end) / 2)).toBeCloseTo(0.5, 6);
  });

  it('steps forward when paused: finish current step, then the next one', () => {
    let t = nextTime(tl, 0, false);
    expect(t).toBe(tl.steps[0].drawEnd);
    t = nextTime(tl, t, false);
    expect(t).toBe(tl.steps[1].drawEnd);
    t = nextTime(tl, t, false);
    expect(t).toBe(tl.steps[2].drawEnd);
    expect(nextTime(tl, t, false)).toBe(tl.total);
    // Mid-step: complete the step that is being drawn.
    expect(nextTime(tl, tl.steps[1].start + 10, false)).toBe(tl.steps[1].drawEnd);
  });

  it('steps back when paused: previous finished step, then the empty board', () => {
    let t = prevTime(tl, tl.total, false);
    expect(t).toBe(tl.steps[1].drawEnd);
    t = prevTime(tl, t, false);
    expect(t).toBe(tl.steps[0].drawEnd);
    expect(prevTime(tl, t, false)).toBe(0);
    expect(prevTime(tl, 0, false)).toBe(0);
    // During the reading pause, go back to the finished drawing of the same step.
    expect(prevTime(tl, tl.steps[0].drawEnd + 300, false)).toBe(tl.steps[0].drawEnd);
  });

  it('skips between step starts while playing', () => {
    expect(nextTime(tl, 5, true)).toBe(tl.steps[1].start);
    expect(nextTime(tl, tl.steps[2].start + 5, true)).toBe(tl.total);
    expect(prevTime(tl, tl.steps[1].start + 2000, true)).toBe(tl.steps[1].start);
    expect(prevTime(tl, tl.steps[1].start + 100, true)).toBe(tl.steps[0].start);
  });
});
