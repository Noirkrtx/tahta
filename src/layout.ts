/**
 * Text layout on the fixed 1600×900 canvas: measuring, wrapping, and a simple
 * collision fix that pushes overlapping text blocks down.
 *
 * Measuring is injected so the same code runs in tests (estimator) and in the
 * browser (canvas measureText with the real handwriting font).
 */
import { CANVAS, type Anchor, type SizeName } from './schema';

export type Measure = (text: string, px: number, weight: number) => number;

export const FONT_FAMILY = 'Caveat';
export const FONT_STACK = `'${FONT_FAMILY}', 'Segoe Print', 'Comic Sans MS', cursive`;

export const FONT_PX: Record<SizeName, number> = { sm: 34, md: 42, lg: 58 };
export const LINE_HEIGHT = 1.2;

export const TITLE = { x: 60, y: 96, px: 72, minPx: 46, maxWidth: 1480, underlineY: 120 } as const;
export const SUMMARY = { x: 60, y: 170, px: 34, maxWidth: 1480 } as const;
export const LABEL_PX = 32;

/** Layout regions recommended to scenario authors (and to the model). */
export const REGIONS = {
  contentTop: 250,
  bottom: 870,
  text: { x: 60, right: 690 },
  drawing: { x: 720, right: 1560 },
} as const;

const NARROW = new Set(" .,:;'!|iıİIlj()[]°".split(''));
const WIDE = new Set('mwMWOQGD@%'.split(''));

/** Rough width model for Caveat; used when no real font is available (tests, pre-layout). */
export const estimateWidth: Measure = (text, px, weight) => {
  let units = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) units += 0.21;
    else if (WIDE.has(ch)) units += 0.56;
    else if (ch >= '0' && ch <= '9') units += 0.42;
    else if (ch !== ch.toLowerCase()) units += 0.46;
    else units += 0.36;
  }
  return units * px * (weight >= 700 ? 1.04 : 1);
};

export function wrapText(text: string, maxWidth: number, px: number, weight: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (line && measure(candidate, px, weight) > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextBlock {
  lines: { text: string; width: number }[];
  x: number;
  /** Baseline of the first line. */
  y: number;
  px: number;
  weight: number;
  anchor: Anchor;
  lineHeight: number;
  box: Box;
}

export function defaultMaxWidth(x: number, anchor: Anchor, explicit?: number): number {
  const margin = 40;
  let room: number;
  if (anchor === 'middle') room = 2 * Math.min(x - margin / 2, CANVAS.width - margin / 2 - x);
  else if (anchor === 'end') room = x - margin / 2;
  else room = CANVAS.width - margin - x;
  room = Math.max(room, 120);
  if (explicit !== undefined) return Math.min(explicit, room);
  // Text that starts in the left column stays out of the drawing area by default.
  if (anchor === 'start' && x < REGIONS.text.right - 80) return REGIONS.text.right - x;
  return room;
}

export function makeBlock(
  text: string,
  x: number,
  y: number,
  px: number,
  weight: number,
  anchor: Anchor,
  maxWidth: number,
  measure: Measure,
): TextBlock {
  const lineHeight = Math.round(px * LINE_HEIGHT);
  const lines = wrapText(text, maxWidth, px, weight, measure).map((t) => ({
    text: t,
    width: measure(t, px, weight),
  }));
  const block: TextBlock = { lines, x, y, px, weight, anchor, lineHeight, box: { x: 0, y: 0, w: 0, h: 0 } };
  // Keep the block inside the canvas horizontally.
  const w = Math.max(...lines.map((l) => l.width));
  let left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const pad = 12;
  if (left + w > CANVAS.width - pad) left = CANVAS.width - pad - w;
  if (left < pad) left = pad;
  block.x = anchor === 'middle' ? left + w / 2 : anchor === 'end' ? left + w : left;
  updateBox(block);
  return block;
}

export function updateBox(b: TextBlock): void {
  const w = Math.max(...b.lines.map((l) => l.width));
  const left = b.anchor === 'middle' ? b.x - w / 2 : b.anchor === 'end' ? b.x - w : b.x;
  b.box = {
    x: left,
    y: b.y - b.px * 0.72,
    w,
    h: (b.lines.length - 1) * b.lineHeight + b.px * 0.95,
  };
}

export function overlaps(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    b.x < a.x + a.w + margin &&
    a.y < b.y + b.h + margin &&
    b.y < a.y + a.h + margin
  );
}

/**
 * Push `block` down until it no longer overlaps any already placed text box.
 * Returns the number of canvas units it was moved. Blocks are never moved
 * below the canvas: if there is no room left the block stays where it fits last.
 */
export function resolveCollision(block: TextBlock, placed: Box[]): number {
  const startY = block.y;
  for (let guard = 0; guard < 60; guard++) {
    const hit = placed.find((p) => overlaps(block.box, p, 2));
    if (!hit) break;
    const nextY = block.y + (hit.y + hit.h - block.box.y) + 6;
    const bottom = nextY - block.px * 0.72 + block.box.h;
    if (bottom > CANVAS.height - 6) break;
    block.y = nextY;
    updateBox(block);
  }
  return block.y - startY;
}
