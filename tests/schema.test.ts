import { describe, expect, it } from 'vitest';
import { parsePathData, serializePath, validateScenario, LIMITS } from '../src/schema';

const minimal = () => ({
  version: 1,
  lang: 'tr',
  title: 'Deneme',
  summary: 'Tek cümle.',
  steps: [{ title: 'Adım', elements: [{ type: 'text', x: 60, y: 300, text: 'ğüşiöçİı' }] }],
});

function errorsOf(raw: unknown): string[] {
  const r = validateScenario(raw);
  return r.ok ? [] : r.errors;
}

describe('validateScenario', () => {
  it('accepts a minimal scenario and returns a clean copy', () => {
    const r = validateScenario(minimal());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scenario.steps[0].elements[0]).toEqual({ type: 'text', x: 60, y: 300, text: 'ğüşiöçİı' });
    }
  });

  it('accepts every element type', () => {
    const s = minimal();
    s.steps[0].elements = [
      { type: 'text', x: 1, y: 2, text: 'a', size: 'lg', color: 'red', anchor: 'middle', maxWidth: 300 },
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, dashed: true },
      { type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10, label: 'ok', double: true },
      { type: 'circle', cx: 100, cy: 100, r: 20, fill: 'amber' },
      { type: 'ellipse', cx: 100, cy: 100, rx: 20, ry: 10, rotation: 30 },
      { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { type: 'polyline', points: [[0, 0], [5, 5], [9, 0]], closed: true },
      { type: 'curve', points: [[0, 0], [5, 5]], arrowEnd: true },
      { type: 'arc', cx: 0, cy: 0, r: 40, from: 0, to: 90, label: '90°' },
      { type: 'path', d: 'M 0 0 L 10 10 Z', fill: 'green' },
    ] as never;
    expect(errorsOf(s)).toEqual([]);
  });

  it('rejects non-objects and wrong version', () => {
    expect(errorsOf(null)).toHaveLength(1);
    expect(errorsOf([])).toHaveLength(1);
    expect(errorsOf({ ...minimal(), version: 2 }).join()).toContain('version');
  });

  it('rejects unknown fields at every level', () => {
    expect(errorsOf({ ...minimal(), extra: 1 }).join()).toContain('extra');
    const s = minimal();
    (s.steps[0] as Record<string, unknown>).foo = 1;
    expect(errorsOf(s).join()).toContain('steps[0].foo');
    const s2 = minimal();
    (s2.steps[0].elements[0] as Record<string, unknown>).onclick = 'alert(1)';
    expect(errorsOf(s2).join()).toContain('onclick');
  });

  it('rejects unknown element types, colours and bad numbers', () => {
    const s = minimal();
    s.steps[0].elements = [
      { type: 'image', href: 'x' },
      { type: 'circle', cx: 0, cy: 0, r: 10, color: '#ff0000' },
      { type: 'circle', cx: Number.NaN, cy: 0, r: 10 },
      { type: 'circle', cx: 99999, cy: 0, r: 10 },
      { type: 'circle', cx: '10', cy: 0, r: 10 },
      { type: 'rect', x: 0, y: 0, w: -5, h: 10 },
    ] as never;
    const errs = errorsOf(s);
    expect(errs).toHaveLength(6);
    expect(errs[0]).toContain('elements[0].type');
    expect(errs[1]).toContain('color');
  });

  it('reports missing required fields with their path', () => {
    const s = minimal();
    s.steps[0].elements = [{ type: 'line', x1: 0, y1: 0, x2: 5 }] as never;
    expect(errorsOf(s)).toEqual(['steps[0].elements[0].y2: required']);
  });

  it('enforces limits on steps, elements and text length', () => {
    const many = minimal();
    many.steps = Array.from({ length: LIMITS.maxSteps + 1 }, () => minimal().steps[0]);
    expect(errorsOf(many).join()).toContain('steps: expected');
    expect(errorsOf({ ...minimal(), steps: [] }).join()).toContain('steps: expected');
    const empty = minimal();
    empty.steps[0].elements = [];
    expect(errorsOf(empty).join()).toContain('elements: expected');
    const long = minimal();
    (long.steps[0].elements[0] as { text: string }).text = 'x'.repeat(LIMITS.maxText + 1);
    expect(errorsOf(long).join()).toContain('too long');
    expect(errorsOf({ ...minimal(), title: '   ' }).join()).toContain('title');
  });

  it('keeps markup-looking text as plain text (it is rendered with textContent)', () => {
    const s = minimal();
    (s.steps[0].elements[0] as { text: string }).text = '<img src=x onerror=alert(1)>';
    const r = validateScenario(s);
    expect(r.ok).toBe(true);
  });

  it('validates points', () => {
    const s = minimal();
    s.steps[0].elements = [{ type: 'curve', points: [[0, 0]] }] as never;
    expect(errorsOf(s).join()).toContain('points');
    s.steps[0].elements = [{ type: 'curve', points: [[0, 0], [1, 'a']] }] as never;
    expect(errorsOf(s).join()).toContain('points[1]');
  });
});

describe('parsePathData', () => {
  it('accepts standard commands and normalises the output', () => {
    const r = parsePathData('M10,20 L 30 40 C1 2 3 4 5 6z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializePath(r.commands)).toBe('M 10 20 L 30 40 C 1 2 3 4 5 6 z');
  });

  it('accepts negative numbers, decimals and arcs', () => {
    expect(parsePathData('M -1.5 .5 a 10 10 0 0 1 20 0 q 1 2 3 4 t 5 6 h 3 v -3 s 1 2 3 4 Z').ok).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['L 1 2', 'start with M'],
    ['M 1 2 L 3', 'multiple'],
    ['M 1 2 X 3 4', 'unexpected'],
    ['M 1 2 <script>', 'unexpected'],
    ['M 1 2 L url(#a)', 'unexpected'],
    ['M 1 2 Z 5', 'no numbers'],
    ['M 1 2 A 5 5 0 2 1 9 9', 'flags'],
    ['M 1 2 L 99999 0', 'out of range'],
    ['1 2 L 3 4', 'start with a command'],
  ])('rejects %j', (d, reason) => {
    const r = parsePathData(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(reason);
  });

  it('rejects oversized path data', () => {
    expect(parsePathData(`M 0 0 ${'L 1 1 '.repeat(400)}`).ok).toBe(false);
  });

  it('path elements are stored in normalised form', () => {
    const s = minimal();
    s.steps[0].elements = [{ type: 'path', d: 'M0,0L10,10' }] as never;
    const r = validateScenario(s);
    expect(r.ok && (r.scenario.steps[0].elements[0] as { d: string }).d).toBe('M 0 0 L 10 10');
  });
});
