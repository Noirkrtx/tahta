/**
 * Board scenario schema: types + strict runtime validation.
 *
 * A scenario is plain JSON. It is produced either by hand (examples/) or by an
 * LLM, so it is treated as untrusted input: every field is type- and
 * range-checked, unknown keys are rejected, and path data is parsed against a
 * whitelist of commands. See docs/SCHEMA.md for the prose version.
 */

export const CANVAS = { width: 1600, height: 900 } as const;

export const COLORS = ['ink', 'blue', 'red', 'amber', 'green'] as const;
export type ColorName = (typeof COLORS)[number];

export const SIZES = ['sm', 'md', 'lg'] as const;
export type SizeName = (typeof SIZES)[number];

export const ANCHORS = ['start', 'middle', 'end'] as const;
export type Anchor = (typeof ANCHORS)[number];

export const LANGS = ['tr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export type Point = [number, number];

export interface TextEl {
  type: 'text';
  x: number;
  y: number;
  text: string;
  size?: SizeName;
  color?: ColorName;
  anchor?: Anchor;
  maxWidth?: number;
}
export interface LineEl {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: ColorName;
  dashed?: boolean;
}
export interface ArrowEl {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: ColorName;
  label?: string;
  double?: boolean;
}
export interface CircleEl {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  color?: ColorName;
  fill?: ColorName;
  dashed?: boolean;
}
export interface EllipseEl {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation?: number;
  color?: ColorName;
  fill?: ColorName;
  dashed?: boolean;
}
export interface RectEl {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  color?: ColorName;
  fill?: ColorName;
}
export interface PolylineEl {
  type: 'polyline';
  points: Point[];
  closed?: boolean;
  color?: ColorName;
  fill?: ColorName;
}
export interface CurveEl {
  type: 'curve';
  points: Point[];
  closed?: boolean;
  arrowEnd?: boolean;
  color?: ColorName;
  fill?: ColorName;
  dashed?: boolean;
}
export interface ArcEl {
  type: 'arc';
  cx: number;
  cy: number;
  r: number;
  /** Degrees. 0 = pointing right, 90 = pointing up (counter-clockwise on screen). */
  from: number;
  to: number;
  color?: ColorName;
  label?: string;
}
export interface PathEl {
  type: 'path';
  d: string;
  color?: ColorName;
  fill?: ColorName;
}

export type BoardElement =
  | TextEl
  | LineEl
  | ArrowEl
  | CircleEl
  | EllipseEl
  | RectEl
  | PolylineEl
  | CurveEl
  | ArcEl
  | PathEl;

export type ElementType = BoardElement['type'];

export interface Step {
  title: string;
  narration?: string;
  elements: BoardElement[];
}

export interface Scenario {
  version: 1;
  lang: Lang;
  question?: string;
  title: string;
  summary: string;
  steps: Step[];
}

export const LIMITS = {
  minSteps: 1,
  maxSteps: 14,
  maxElementsPerStep: 24,
  maxElementsTotal: 180,
  maxTitle: 80,
  maxSummary: 220,
  maxQuestion: 400,
  maxStepTitle: 70,
  maxNarration: 500,
  maxText: 180,
  maxLabel: 40,
  maxPoints: 40,
  maxPathChars: 2000,
  coordMin: -200,
  coordMax: 1800,
} as const;

export type ValidationResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Path data
// ---------------------------------------------------------------------------

const PATH_ARGS: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const PATH_TOKEN = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)/y;

export interface PathCommand {
  cmd: string;
  args: number[];
}

export type PathParse = { ok: true; commands: PathCommand[] } | { ok: false; error: string };

/**
 * Parse SVG path data strictly: only the standard path commands and plain
 * numbers are accepted. Anything else (letters, quotes, angle brackets, url(),
 * ...) is rejected, so a validated `d` can never smuggle markup.
 */
export function parsePathData(d: string): PathParse {
  if (typeof d !== 'string') return { ok: false, error: 'path data must be a string' };
  if (d.length === 0) return { ok: false, error: 'path data is empty' };
  if (d.length > LIMITS.maxPathChars) {
    return { ok: false, error: `path data longer than ${LIMITS.maxPathChars} characters` };
  }
  const commands: PathCommand[] = [];
  let current: PathCommand | null = null;
  let pos = 0;
  while (pos < d.length) {
    PATH_TOKEN.lastIndex = pos;
    const m = PATH_TOKEN.exec(d);
    if (!m) return { ok: false, error: `unexpected character "${d[pos]}" at offset ${pos}` };
    pos = PATH_TOKEN.lastIndex;
    if (m[1]) {
      current = { cmd: m[1], args: [] };
      commands.push(current);
    } else if (m[2]) {
      if (!current) return { ok: false, error: 'path data must start with a command (M)' };
      const n = Number(m[2]);
      if (!Number.isFinite(n) || Math.abs(n) > 5000) {
        return { ok: false, error: `number out of range: ${m[2]}` };
      }
      current.args.push(n);
    }
  }
  if (commands.length === 0) return { ok: false, error: 'path data has no commands' };
  if (commands[0].cmd !== 'M' && commands[0].cmd !== 'm') {
    return { ok: false, error: 'path data must start with M' };
  }
  for (const c of commands) {
    const need = PATH_ARGS[c.cmd.toUpperCase()];
    if (need === 0) {
      if (c.args.length !== 0) return { ok: false, error: `${c.cmd} takes no numbers` };
      continue;
    }
    if (c.args.length === 0 || c.args.length % need !== 0) {
      return {
        ok: false,
        error: `${c.cmd} needs a multiple of ${need} numbers, got ${c.args.length}`,
      };
    }
    if (c.cmd.toUpperCase() === 'A') {
      for (let i = 0; i < c.args.length; i += 7) {
        const large = c.args[i + 3];
        const sweep = c.args[i + 4];
        if ((large !== 0 && large !== 1) || (sweep !== 0 && sweep !== 1)) {
          return { ok: false, error: 'arc flags must be 0 or 1' };
        }
      }
    }
  }
  return { ok: true, commands };
}

/** Re-serialise parsed commands; the output contains only command letters, digits, '-', '.', 'e' and spaces. */
export function serializePath(commands: PathCommand[]): string {
  return commands
    .map((c) => (c.args.length ? `${c.cmd} ${c.args.map(fmt).join(' ')}` : c.cmd))
    .join(' ');
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------------------
// Field specs
// ---------------------------------------------------------------------------

type Field =
  | { kind: 'num'; min: number; max: number; req?: boolean }
  | { kind: 'str'; max: number; req?: boolean }
  | { kind: 'enum'; values: readonly string[]; req?: boolean }
  | { kind: 'bool'; req?: boolean }
  | { kind: 'points'; min: number; req?: boolean }
  | { kind: 'path'; req?: boolean };

const coord: Field = { kind: 'num', min: LIMITS.coordMin, max: LIMITS.coordMax, req: true };
const extent: Field = { kind: 'num', min: 1, max: 1600, req: true };
const color: Field = { kind: 'enum', values: COLORS };
const fill: Field = { kind: 'enum', values: COLORS };
const flag: Field = { kind: 'bool' };

export const ELEMENT_FIELDS: Record<ElementType, Record<string, Field>> = {
  text: {
    x: coord,
    y: coord,
    text: { kind: 'str', max: LIMITS.maxText, req: true },
    size: { kind: 'enum', values: SIZES },
    color,
    anchor: { kind: 'enum', values: ANCHORS },
    maxWidth: { kind: 'num', min: 80, max: 1600 },
  },
  line: { x1: coord, y1: coord, x2: coord, y2: coord, color, dashed: flag },
  arrow: {
    x1: coord,
    y1: coord,
    x2: coord,
    y2: coord,
    color,
    label: { kind: 'str', max: LIMITS.maxLabel },
    double: flag,
  },
  circle: { cx: coord, cy: coord, r: extent, color, fill, dashed: flag },
  ellipse: {
    cx: coord,
    cy: coord,
    rx: extent,
    ry: extent,
    rotation: { kind: 'num', min: -360, max: 360 },
    color,
    fill,
    dashed: flag,
  },
  rect: { x: coord, y: coord, w: extent, h: extent, color, fill },
  polyline: { points: { kind: 'points', min: 2, req: true }, closed: flag, color, fill },
  curve: {
    points: { kind: 'points', min: 2, req: true },
    closed: flag,
    arrowEnd: flag,
    color,
    fill,
    dashed: flag,
  },
  arc: {
    cx: coord,
    cy: coord,
    r: extent,
    from: { kind: 'num', min: -720, max: 720, req: true },
    to: { kind: 'num', min: -720, max: 720, req: true },
    color,
    label: { kind: 'str', max: LIMITS.maxLabel },
  },
  path: { d: { kind: 'path', req: true }, color, fill },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkString(v: unknown, path: string, max: number, errs: string[], allowEmpty = false): string | undefined {
  if (typeof v !== 'string') {
    errs.push(`${path}: expected a string`);
    return undefined;
  }
  const s = v.trim();
  if (!allowEmpty && s.length === 0) {
    errs.push(`${path}: must not be empty`);
    return undefined;
  }
  if (s.length > max) {
    errs.push(`${path}: too long (${s.length} characters, max ${max})`);
    return undefined;
  }
  // Control characters have no business on the board.
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)) {
    errs.push(`${path}: contains control characters`);
    return undefined;
  }
  return s;
}

function checkField(v: unknown, f: Field, path: string, errs: string[]): unknown {
  switch (f.kind) {
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errs.push(`${path}: expected a finite number`);
        return undefined;
      }
      if (v < f.min || v > f.max) {
        errs.push(`${path}: ${v} is outside [${f.min}, ${f.max}]`);
        return undefined;
      }
      return v;
    case 'str':
      return checkString(v, path, f.max, errs);
    case 'enum':
      if (typeof v !== 'string' || !f.values.includes(v)) {
        errs.push(`${path}: expected one of ${f.values.map((x) => `"${x}"`).join(', ')}`);
        return undefined;
      }
      return v;
    case 'bool':
      if (typeof v !== 'boolean') {
        errs.push(`${path}: expected true or false`);
        return undefined;
      }
      return v;
    case 'points': {
      if (!Array.isArray(v)) {
        errs.push(`${path}: expected an array of [x, y] pairs`);
        return undefined;
      }
      if (v.length < f.min || v.length > LIMITS.maxPoints) {
        errs.push(`${path}: expected ${f.min} to ${LIMITS.maxPoints} points, got ${v.length}`);
        return undefined;
      }
      const out: Point[] = [];
      for (let i = 0; i < v.length; i++) {
        const p = v[i];
        if (
          !Array.isArray(p) ||
          p.length !== 2 ||
          typeof p[0] !== 'number' ||
          typeof p[1] !== 'number' ||
          !Number.isFinite(p[0]) ||
          !Number.isFinite(p[1])
        ) {
          errs.push(`${path}[${i}]: expected [x, y] with two numbers`);
          return undefined;
        }
        if (
          p[0] < LIMITS.coordMin ||
          p[0] > LIMITS.coordMax ||
          p[1] < LIMITS.coordMin ||
          p[1] > LIMITS.coordMax
        ) {
          errs.push(`${path}[${i}]: coordinates outside [${LIMITS.coordMin}, ${LIMITS.coordMax}]`);
          return undefined;
        }
        out.push([p[0], p[1]]);
      }
      return out;
    }
    case 'path': {
      if (typeof v !== 'string') {
        errs.push(`${path}: expected a string of SVG path data`);
        return undefined;
      }
      const parsed = parsePathData(v);
      if (!parsed.ok) {
        errs.push(`${path}: ${parsed.error}`);
        return undefined;
      }
      return serializePath(parsed.commands);
    }
  }
}

function validateElement(raw: unknown, path: string, errs: string[]): BoardElement | undefined {
  if (!isObject(raw)) {
    errs.push(`${path}: expected an object`);
    return undefined;
  }
  const type = raw.type;
  if (typeof type !== 'string' || !(type in ELEMENT_FIELDS)) {
    errs.push(
      `${path}.type: expected one of ${Object.keys(ELEMENT_FIELDS)
        .map((t) => `"${t}"`)
        .join(', ')}`,
    );
    return undefined;
  }
  const fields = ELEMENT_FIELDS[type as ElementType];
  const out: Record<string, unknown> = { type };
  const before = errs.length;
  for (const key of Object.keys(raw)) {
    if (key !== 'type' && !(key in fields)) {
      errs.push(`${path}.${key}: unknown field for element type "${type}"`);
    }
  }
  for (const [key, f] of Object.entries(fields)) {
    const v = raw[key];
    if (v === undefined || v === null) {
      if (f.req) errs.push(`${path}.${key}: required`);
      continue;
    }
    const checked = checkField(v, f, `${path}.${key}`, errs);
    if (checked !== undefined) out[key] = checked;
  }
  if (errs.length > before) return undefined;
  return out as unknown as BoardElement;
}

const TOP_KEYS = ['version', 'lang', 'question', 'title', 'summary', 'steps'];
const STEP_KEYS = ['title', 'narration', 'elements'];

/** Validate untrusted data. On success returns a clean copy that contains only known fields. */
export function validateScenario(raw: unknown): ValidationResult {
  const errs: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['root: expected a JSON object'] };

  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.includes(key)) errs.push(`${key}: unknown top-level field`);
  }
  if (raw.version !== 1) errs.push('version: must be the number 1');
  if (typeof raw.lang !== 'string' || !(LANGS as readonly string[]).includes(raw.lang)) {
    errs.push('lang: expected "tr" or "en"');
  }
  const title = checkString(raw.title, 'title', LIMITS.maxTitle, errs);
  const summary = checkString(raw.summary, 'summary', LIMITS.maxSummary, errs);
  let question: string | undefined;
  if (raw.question !== undefined && raw.question !== null) {
    question = checkString(raw.question, 'question', LIMITS.maxQuestion, errs);
  }

  const steps: Step[] = [];
  if (!Array.isArray(raw.steps)) {
    errs.push('steps: expected an array');
  } else if (raw.steps.length < LIMITS.minSteps || raw.steps.length > LIMITS.maxSteps) {
    errs.push(
      `steps: expected ${LIMITS.minSteps} to ${LIMITS.maxSteps} steps, got ${raw.steps.length}`,
    );
  } else {
    let total = 0;
    raw.steps.forEach((rs: unknown, i: number) => {
      const sp = `steps[${i}]`;
      if (!isObject(rs)) {
        errs.push(`${sp}: expected an object`);
        return;
      }
      for (const key of Object.keys(rs)) {
        if (!STEP_KEYS.includes(key)) errs.push(`${sp}.${key}: unknown field`);
      }
      const st = checkString(rs.title, `${sp}.title`, LIMITS.maxStepTitle, errs);
      let narration: string | undefined;
      if (rs.narration !== undefined && rs.narration !== null) {
        narration = checkString(rs.narration, `${sp}.narration`, LIMITS.maxNarration, errs, true);
      }
      const elements: BoardElement[] = [];
      if (!Array.isArray(rs.elements)) {
        errs.push(`${sp}.elements: expected an array`);
      } else if (rs.elements.length < 1 || rs.elements.length > LIMITS.maxElementsPerStep) {
        errs.push(
          `${sp}.elements: expected 1 to ${LIMITS.maxElementsPerStep} elements, got ${rs.elements.length}`,
        );
      } else {
        rs.elements.forEach((re: unknown, j: number) => {
          const el = validateElement(re, `${sp}.elements[${j}]`, errs);
          if (el) elements.push(el);
        });
        total += rs.elements.length;
      }
      const step: Step = { title: st ?? '', elements };
      if (narration) step.narration = narration;
      steps.push(step);
    });
    if (total > LIMITS.maxElementsTotal) {
      errs.push(`steps: too many elements in total (${total}, max ${LIMITS.maxElementsTotal})`);
    }
  }

  if (errs.length > 0) return { ok: false, errors: errs };
  const scenario: Scenario = {
    version: 1,
    lang: raw.lang as Lang,
    title: title as string,
    summary: summary as string,
    steps,
  };
  if (question) scenario.question = question;
  return { ok: true, scenario };
}
