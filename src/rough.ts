/**
 * Hand-drawn geometry. Every shape is turned into cubic Bézier segments with a
 * little seeded wobble, so the same scenario always produces the same strokes.
 * Written from scratch for this project; no drawing library involved.
 */

export type Pt = [number, number];

/** A chain of cubic segments starting at `start`. */
export interface Chain {
  start: Pt;
  segs: { c1: Pt; c2: Pt; p: Pt }[];
}

/** One pen stroke: SVG path data plus its approximate length in canvas units. */
export interface Stroke {
  d: string;
  len: number;
}

export type Rand = () => number;

/** mulberry32: small, fast, deterministic PRNG. */
export function makeRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const sym = (r: Rand, amount: number) => (r() * 2 - 1) * amount;
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f = (n: number) => String(Math.round(n * 10) / 10);

export function chainToD(c: Chain): string {
  let d = `M ${f(c.start[0])} ${f(c.start[1])}`;
  for (const s of c.segs) {
    d += ` C ${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`;
  }
  return d;
}

function bez(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + e * p1[0],
    a * p0[1] + b * c1[1] + c * c2[1] + e * p1[1],
  ];
}

/** Flatten a chain into a dense polyline (roughly one point every `step` units). */
export function sampleChain(c: Chain, step = 6): Pt[] {
  const out: Pt[] = [c.start];
  let prev = c.start;
  for (const s of c.segs) {
    const approx = dist(prev, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p);
    const n = Math.max(2, Math.ceil(approx / step));
    for (let i = 1; i <= n; i++) out.push(bez(prev, s.c1, s.c2, s.p, i / n));
    prev = s.p;
  }
  return out;
}

export function polyLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

export function chainLength(c: Chain): number {
  return polyLength(sampleChain(c, 12));
}

export function chainStroke(c: Chain): Stroke {
  return { d: chainToD(c), len: chainLength(c) };
}

/** Cut a chain into short dashes; each dash is its own stroke so it can be drawn in order. */
export function dashChain(c: Chain, on = 16, off = 13): Stroke[] {
  const pts = sampleChain(c, 3);
  const strokes: Stroke[] = [];
  let acc = 0;
  let drawing = true;
  let cur: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (drawing) cur.push(pts[i]);
    if (drawing && acc >= on) {
      strokes.push(polyStroke(cur));
      drawing = false;
      acc = 0;
    } else if (!drawing && acc >= off) {
      drawing = true;
      acc = 0;
      cur = [pts[i]];
    }
  }
  if (drawing && cur.length > 1) strokes.push(polyStroke(cur));
  return strokes;
}

function polyStroke(pts: Pt[]): Stroke {
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${f(pts[i][0])} ${f(pts[i][1])}`;
  return { d, len: polyLength(pts) };
}

/** A straight segment with a slight bow, as if drawn freehand. */
function bowedSeg(a: Pt, b: Pt, r: Rand): { c1: Pt; c2: Pt; p: Pt } {
  const len = dist(a, b) || 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const bow = clamp(len * 0.012, 0.6, 4.5);
  const o1 = sym(r, bow);
  const o2 = o1 * 0.4 + sym(r, bow * 0.6);
  const t1 = 0.3 + sym(r, 0.06);
  const t2 = 0.7 + sym(r, 0.06);
  return {
    c1: [a[0] + (b[0] - a[0]) * t1 + nx * o1, a[1] + (b[1] - a[1]) * t1 + ny * o1],
    c2: [a[0] + (b[0] - a[0]) * t2 + nx * o2, a[1] + (b[1] - a[1]) * t2 + ny * o2],
    p: b,
  };
}

const jitter = (p: Pt, r: Rand, amount: number): Pt => [p[0] + sym(r, amount), p[1] + sym(r, amount)];

export function roughLine(a: Pt, b: Pt, r: Rand): Chain {
  const len = dist(a, b);
  const j = clamp(len * 0.006, 0.4, 1.8);
  const s = jitter(a, r, j);
  const e = jitter(b, r, j);
  return { start: s, segs: [bowedSeg(s, e, r)] };
}

/** Straight segments through the given points, corners slightly off, one continuous stroke. */
export function roughPolyline(points: Pt[], closed: boolean, r: Rand): Chain {
  const pts = points.map((p) => jitter(p, r, 1.2));
  const chain: Chain = { start: pts[0], segs: [] };
  for (let i = 1; i < pts.length; i++) chain.segs.push(bowedSeg(pts[i - 1], pts[i], r));
  if (closed && pts.length > 2) {
    // Close with a tiny miss, like a hand that does not land exactly on the starting point.
    const end = jitter(pts[0], r, 1.8);
    chain.segs.push(bowedSeg(pts[pts.length - 1], end, r));
  }
  return chain;
}

/** Catmull-Rom spline through points, expressed as cubic Béziers. */
export function smoothChain(pts: Pt[], closed: boolean): Chain {
  const n = pts.length;
  const at = (i: number): Pt => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const chain: Chain = { start: pts[0], segs: [] };
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    chain.segs.push({
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p: p2,
    });
  }
  return chain;
}

export function roughCurve(points: Pt[], closed: boolean, r: Rand): Chain {
  return smoothChain(
    points.map((p) => jitter(p, r, 1.2)),
    closed,
  );
}

/**
 * Ellipse drawn in one sweep: starts at a random angle, the radius drifts a
 * little, and the stroke overshoots its starting point instead of closing
 * perfectly.
 */
export function roughEllipse(cx: number, cy: number, rx: number, ry: number, rotDeg: number, r: Rand): Chain {
  const size = Math.max(rx, ry);
  const n = clamp(Math.round(size / 9) + 8, 10, 28);
  const a0 = r() * Math.PI * 2;
  const over = 0.12 + r() * 0.2;
  const sweep = Math.PI * 2 + over;
  const wobble = clamp(0.03 - size * 0.00004, 0.012, 0.03);
  const drift = sym(r, wobble * 0.9);
  const rot = (rotDeg * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const pts: Pt[] = [];
  const steps = Math.ceil((n * sweep) / (Math.PI * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + t * sweep;
    const k = 1 + sym(r, wobble * 0.5) + drift * t;
    const x = Math.cos(a) * rx * k;
    const y = -Math.sin(a) * ry * k;
    pts.push([cx + x * cosR - y * sinR, cy + x * sinR + y * cosR]);
  }
  return smoothChain(pts, false);
}

/** Arc from `fromDeg` to `toDeg`; 0° points right and angles grow counter-clockwise on screen. */
export function roughArc(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number, r: Rand): Chain {
  const span = toDeg - fromDeg;
  const n = Math.max(3, Math.ceil(Math.abs(span) / 12));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((fromDeg + (span * i) / n) * Math.PI) / 180;
    const k = 1 + sym(r, 0.012);
    pts.push([cx + Math.cos(a) * radius * k, cy - Math.sin(a) * radius * k]);
  }
  return smoothChain(pts, false);
}

/** Two short strokes forming an arrow head at `tip`, pointing along (from → tip). */
export function arrowHead(from: Pt, tip: Pt, size: number, r: Rand): Chain[] {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = 0.44;
  return [-1, 1].map((side) => {
    const a = ang + Math.PI + side * (spread + sym(r, 0.06));
    const l = size * (1 + sym(r, 0.12));
    const back: Pt = [tip[0] + Math.cos(a) * l, tip[1] + Math.sin(a) * l];
    return roughLine(back, tip, r);
  });
}

export function headSize(shaftLen: number): number {
  return clamp(shaftLen * 0.16, 13, 24);
}

/** Approximate bounding size of arbitrary path arguments, used only for timing. */
export function roughPathLength(numbers: number[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  if (!Number.isFinite(minX)) return 200;
  return clamp(1.6 * (maxX - minX + (maxY - minY)), 80, 2400);
}
