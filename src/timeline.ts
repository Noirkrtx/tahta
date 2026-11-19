/**
 * Timeline: assigns a start/end time (ms at 1× speed) to every drawing
 * operation and every step, and answers "what should the board look like at
 * time t" style questions. Pure and DOM-free.
 */
import type { Compiled, Op } from './compile';

export type TimedOp = Op & { start: number; end: number; step: number };

export interface StepTiming {
  index: number;
  title: string;
  narration?: string;
  /** First operation of the step begins here. */
  start: number;
  /** Everything in the step is fully drawn here. */
  drawEnd: number;
  /** End of the reading pause; the next step starts here. */
  end: number;
}

export interface Timeline {
  ops: TimedOp[];
  steps: StepTiming[];
  total: number;
}

export const GAP_BETWEEN_ELEMENTS = 140;
export const GAP_WITHIN_ELEMENT = 25;
export const HOLD_BASE = 700;
export const HOLD_PER_CHAR = 40;
export const HOLD_MAX = 5200;

export function holdFor(narration: string | undefined): number {
  return Math.min(HOLD_MAX, HOLD_BASE + (narration ? narration.length * HOLD_PER_CHAR : 0));
}

export function buildTimeline(compiled: Compiled): Timeline {
  const ops: TimedOp[] = [];
  const steps: StepTiming[] = [];
  let t = 0;
  compiled.steps.forEach((step, index) => {
    const start = t;
    step.groups.forEach((group, gi) => {
      if (gi > 0) t += GAP_BETWEEN_ELEMENTS;
      group.forEach((op, oi) => {
        if (oi > 0) t += Math.min(GAP_WITHIN_ELEMENT, op.dur * 0.3);
        ops.push({ ...op, start: t, end: t + op.dur, step: index });
        t += op.dur;
      });
    });
    const drawEnd = t;
    t += holdFor(step.narration);
    const timing: StepTiming = { index, title: step.title, start, drawEnd, end: t };
    if (step.narration) timing.narration = step.narration;
    steps.push(timing);
  });
  // No reading pause after the very last step: playback ends when the drawing is done.
  const last = steps[steps.length - 1];
  if (last) {
    last.end = last.drawEnd;
    t = last.drawEnd;
  }
  return { ops, steps, total: t };
}

export function clampTime(tl: Timeline, t: number): number {
  return Math.min(tl.total, Math.max(0, t));
}

/** Index of the step that is being drawn (or held) at time t. */
export function stepIndexAt(tl: Timeline, t: number): number {
  for (let i = tl.steps.length - 1; i >= 0; i--) {
    if (t >= tl.steps[i].start) return i;
  }
  return 0;
}

/** Progress of one operation at time t, 0..1. */
export function opProgress(op: { start: number; end: number }, t: number): number {
  if (t <= op.start) return 0;
  if (t >= op.end) return 1;
  return (t - op.start) / (op.end - op.start);
}

const EPS = 0.5;

/**
 * "Step forward".
 * Paused: finish the current step if it is still being drawn, otherwise show
 * the next step fully drawn. Playing: skip to the start of the next step.
 */
export function nextTime(tl: Timeline, t: number, playing: boolean): number {
  const i = stepIndexAt(tl, t);
  const lastIndex = tl.steps.length - 1;
  if (playing) return i < lastIndex ? tl.steps[i + 1].start : tl.total;
  if (t < tl.steps[i].drawEnd - EPS) return tl.steps[i].drawEnd;
  return i < lastIndex ? tl.steps[i + 1].drawEnd : tl.total;
}

/**
 * "Step back".
 * Paused: show the previous step fully drawn (or the empty board from step 0).
 * Playing: restart the current step, or the previous one if it has only just begun.
 */
export function prevTime(tl: Timeline, t: number, playing: boolean): number {
  const i = stepIndexAt(tl, t);
  if (playing) {
    if (t - tl.steps[i].start > 600 || i === 0) return tl.steps[i].start;
    return tl.steps[i - 1].start;
  }
  if (t > tl.steps[i].drawEnd + EPS) return tl.steps[i].drawEnd;
  return i > 0 ? tl.steps[i - 1].drawEnd : 0;
}
