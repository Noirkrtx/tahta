/**
 * Scenario → drawing operations. Pure: no DOM, deterministic for a given
 * scenario and measure function. The board (DOM) and the timeline both work
 * from this list.
 */
import type { Anchor, BoardElement, ColorName, Scenario } from './schema';
import { parsePathData, serializePath } from './schema';
import {
  FONT_PX,
  LABEL_PX,
  SUMMARY,
  TITLE,
  defaultMaxWidth,
  estimateWidth,
  makeBlock,
  resolveCollision,
  type Box,
  type Measure,
  type TextBlock,
} from './layout';
import {
  arrowHead,
  chainStroke,
  chainToD,
  dashChain,
  hashSeed,
  headSize,
  makeRand,
  roughArc,
  roughCurve,
  roughEllipse,
  roughLine,
  roughPathLength,
  roughPolyline,
  type Chain,
  type Pt,
  type Rand,
  type Stroke,
} from './rough';

export interface TextOp {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  px: number;
  weight: number;
  anchor: Anchor;
  color: ColorName;
  width: number;
  /** Small rotation in degrees for a handwritten feel. */
  tilt: number;
  dur: number;
}
export interface StrokeOp {
  kind: 'stroke';
  d: string;
  color: ColorName;
  sw: number;
  dur: number;
}
export interface FillOp {
  kind: 'fill';
  d: string;
  color: ColorName;
  dur: number;
}
export type Op = TextOp | StrokeOp | FillOp;

export interface CompiledStep {
  title: string;
  narration?: string;
  /** One group of operations per scenario element, drawn in order. */
  groups: Op[][];
}

export interface Compiled {
  steps: CompiledStep[];
  /** Notes about automatic layout fixes, for debugging and tests. */
  adjustments: string[];
}

export const STROKE_WIDTH = 4;
const MS_PER_CHAR = 38;
const PX_PER_MS = 1.1;

const textDur = (s: string) => Math.max(260, s.length * MS_PER_CHAR);
const strokeDur = (len: number) => Math.min(1500, Math.max(len < 40 ? 18 : 130, len / PX_PER_MS));

function strokeOps(strokes: Stroke[], color: ColorName, sw = STROKE_WIDTH): StrokeOp[] {
  return strokes.map((s) => ({ kind: 'stroke', d: s.d, color, sw, dur: strokeDur(s.len) }));
}

function outline(chain: Chain, dashed: boolean | undefined): Stroke[] {
  return dashed ? dashChain(chain) : [chainStroke(chain)];
}

function blockOps(block: TextBlock, color: ColorName, r: Rand): TextOp[] {
  return block.lines.map((line, i) => ({
    kind: 'text',
    x: block.x,
    y: block.y + i * block.lineHeight,
    text: line.text,
    px: block.px,
    weight: block.weight,
    anchor: block.anchor,
    color,
    width: line.width,
    tilt: (r() * 2 - 1) * 0.4,
    dur: textDur(line.text),
  }));
}

function labelOp(text: string, x: number, y: number, anchor: Anchor, color: ColorName, measure: Measure): TextOp {
  return {
    kind: 'text',
    x,
    y,
    text,
    px: LABEL_PX,
    weight: 500,
    anchor,
    color,
    width: measure(text, LABEL_PX, 500),
    tilt: 0,
    dur: textDur(text),
  };
}

/** Where to put a label next to a segment: beside its midpoint, on the upper (or right) side. */
export function labelPlacement(a: Pt, b: Pt): { x: number; y: number; anchor: Anchor } {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let nx = -(b[1] - a[1]) / len;
  let ny = (b[0] - a[0]) / len;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const mx = (a[0] + b[0]) / 2 + nx * 16;
  const my = (a[1] + b[1]) / 2 + ny * 16;
  const anchor: Anchor = Math.abs(nx) < 0.35 ? 'middle' : nx > 0 ? 'start' : 'end';
  const y = my + LABEL_PX * 0.3 * (1 - Math.abs(ny)) - 6 * Math.abs(ny);
  return { x: mx, y, anchor };
}

function compileElement(el: BoardElement, r: Rand, measure: Measure, placed: Box[], notes: string[], where: string): Op[] {
  const color: ColorName = el.color ?? 'ink';
  switch (el.type) {
    case 'text': {
      const px = FONT_PX[el.size ?? 'md'];
      const anchor = el.anchor ?? 'start';
      const block = makeBlock(el.text, el.x, el.y, px, 500, anchor, defaultMaxWidth(el.x, anchor, el.maxWidth), measure);
      const moved = resolveCollision(block, placed);
      if (moved > 0) notes.push(`${where}: text moved down by ${Math.round(moved)} to avoid overlap`);
      placed.push(block.box);
      return blockOps(block, color, r);
    }
    case 'line': {
      return strokeOps(outline(roughLine([el.x1, el.y1], [el.x2, el.y2], r), el.dashed), color);
    }
    case 'arrow': {
      const a: Pt = [el.x1, el.y1];
      const b: Pt = [el.x2, el.y2];
      const shaft = roughLine(a, b, r);
      const size = headSize(Math.hypot(b[0] - a[0], b[1] - a[1]));
      const ops: Op[] = strokeOps([chainStroke(shaft)], color);
      const tip = shaft.segs[shaft.segs.length - 1].p;
      ops.push(...strokeOps(arrowHead(shaft.start, tip, size, r).map(chainStroke), color));
      if (el.double) ops.push(...strokeOps(arrowHead(tip, shaft.start, size, r).map(chainStroke), color));
      if (el.label) {
        const p = labelPlacement(a, b);
        ops.push(labelOp(el.label, p.x, p.y, p.anchor, color, measure));
      }
      return ops;
    }
    case 'circle':
    case 'ellipse': {
      const rx = el.type === 'circle' ? el.r : el.rx;
      const ry = el.type === 'circle' ? el.r : el.ry;
      const rot = el.type === 'ellipse' ? (el.rotation ?? 0) : 0;
      const chain = roughEllipse(el.cx, el.cy, rx, ry, rot, r);
      const ops: Op[] = strokeOps(outline(chain, el.dashed), color);
      if (el.fill) ops.push({ kind: 'fill', d: `${chainToD(chain)} Z`, color: el.fill, dur: 320 });
      return ops;
    }
    case 'rect': {
      const pts: Pt[] = [
        [el.x, el.y],
        [el.x + el.w, el.y],
        [el.x + el.w, el.y + el.h],
        [el.x, el.y + el.h],
      ];
      const chain = roughPolyline(pts, true, r);
      const ops: Op[] = strokeOps([chainStroke(chain)], color);
      if (el.fill) ops.push({ kind: 'fill', d: `${chainToD(chain)} Z`, color: el.fill, dur: 320 });
      return ops;
    }
    case 'polyline': {
      const chain = roughPolyline(el.points, !!el.closed, r);
      const ops: Op[] = strokeOps([chainStroke(chain)], color);
      if (el.fill) ops.push({ kind: 'fill', d: `${chainToD(chain)} Z`, color: el.fill, dur: 320 });
      return ops;
    }
    case 'curve': {
      const chain = roughCurve(el.points, !!el.closed, r);
      const ops: Op[] = strokeOps(outline(chain, el.dashed), color);
      if (el.arrowEnd && !el.closed) {
        const n = el.points.length;
        const tip = chain.segs[chain.segs.length - 1].p;
        // Direction of travel at the end: from the last control point towards the tip.
        const c2 = chain.segs[chain.segs.length - 1].c2;
        const from: Pt = Math.hypot(tip[0] - c2[0], tip[1] - c2[1]) > 1 ? c2 : el.points[n - 2];
        ops.push(...strokeOps(arrowHead(from, tip, 20, r).map(chainStroke), color));
      }
      if (el.fill) ops.push({ kind: 'fill', d: `${chainToD(chain)} Z`, color: el.fill, dur: 320 });
      return ops;
    }
    case 'arc': {
      const chain = roughArc(el.cx, el.cy, el.r, el.from, el.to, r);
      const ops: Op[] = strokeOps([chainStroke(chain)], color, 3.5);
      if (el.label) {
        const mid = (((el.from + el.to) / 2) * Math.PI) / 180;
        const lr = el.r + 24;
        const cos = Math.cos(mid);
        const anchor: Anchor = Math.abs(cos) < 0.35 ? 'middle' : cos > 0 ? 'start' : 'end';
        ops.push(
          labelOp(
            el.label,
            el.cx + cos * lr,
            el.cy - Math.sin(mid) * lr + LABEL_PX * 0.3,
            anchor,
            color,
            measure,
          ),
        );
      }
      return ops;
    }
    case 'path': {
      // Re-parse defensively: only whitelisted commands and numbers ever reach the DOM.
      const parsed = parsePathData(el.d);
      if (!parsed.ok) return [];
      const d = serializePath(parsed.commands);
      const len = roughPathLength(parsed.commands.flatMap((c) => c.args));
      const ops: Op[] = [{ kind: 'stroke', d, color, sw: STROKE_WIDTH, dur: strokeDur(len) }];
      if (el.fill) ops.push({ kind: 'fill', d, color: el.fill, dur: 320 });
      return ops;
    }
  }
}

/** Compile a (validated) scenario. Step 0 is always the intro: title, underline, one-sentence summary. */
export function compileScenario(scn: Scenario, measure: Measure = estimateWidth): Compiled {
  const notes: string[] = [];
  const placed: Box[] = [];
  const seedBase = `${scn.title}|${scn.steps.length}`;

  // --- intro -------------------------------------------------------------
  const r0 = makeRand(hashSeed(`${seedBase}|intro`));
  let titlePx: number = TITLE.px;
  const titleWidth = measure(scn.title, TITLE.px, 700);
  if (titleWidth > TITLE.maxWidth) {
    titlePx = Math.max(TITLE.minPx, Math.floor((TITLE.px * TITLE.maxWidth) / titleWidth));
  }
  const titleBlock = makeBlock(scn.title, TITLE.x, TITLE.y, titlePx, 700, 'start', TITLE.maxWidth, measure);
  placed.push({ ...titleBlock.box, h: TITLE.underlineY + 6 - titleBlock.box.y });
  const tw = Math.max(...titleBlock.lines.map((l) => l.width));
  const underline = roughLine([TITLE.x - 6, TITLE.underlineY], [TITLE.x + tw + 26, TITLE.underlineY + 2], r0);
  const summaryBlock = makeBlock(scn.summary, SUMMARY.x, SUMMARY.y, SUMMARY.px, 500, 'start', SUMMARY.maxWidth, measure);
  resolveCollision(summaryBlock, placed);
  placed.push(summaryBlock.box);

  const steps: CompiledStep[] = [
    {
      title: scn.title,
      groups: [
        blockOps(titleBlock, 'ink', r0).map((o) => ({ ...o, tilt: 0 })),
        strokeOps([chainStroke(underline)], 'red', 4.5),
        blockOps(summaryBlock, 'blue', r0).map((o) => ({ ...o, tilt: 0 })),
      ],
    },
  ];

  // --- content steps -----------------------------------------------------
  scn.steps.forEach((step, si) => {
    const groups: Op[][] = [];
    step.elements.forEach((el, ei) => {
      const r = makeRand(hashSeed(`${seedBase}|${si}|${ei}`));
      const ops = compileElement(el, r, measure, placed, notes, `steps[${si}].elements[${ei}]`);
      if (ops.length) groups.push(ops);
    });
    const cs: CompiledStep = { title: step.title, groups };
    if (step.narration) cs.narration = step.narration;
    steps.push(cs);
  });

  return { steps, adjustments: notes };
}
