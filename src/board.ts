/**
 * The board: an SVG built once from the compiled operations, plus `apply(t)`
 * which shows exactly what has been written and drawn at time t. Because the
 * picture is a pure function of time, seeking, stepping back and exporting
 * the final frame are all the same code path.
 *
 * Security: scenario text only ever reaches the DOM through `textContent`,
 * and path data is whitelisted in schema.ts before it gets here.
 */
import { CANVAS, type ColorName, type Scenario } from './schema';
import { compileScenario, type Compiled } from './compile';
import { FONT_STACK, type Measure } from './layout';
import { buildTimeline, opProgress, type TimedOp, type Timeline } from './timeline';

export const PAPER = '#faf7ef';
export const HEX: Record<ColorName, string> = {
  ink: '#23262d',
  blue: '#1d3f94',
  red: '#c9352b',
  amber: '#d4860b',
  green: '#2f7d4e',
};

const NS = 'http://www.w3.org/2000/svg';
let boardCounter = 0;

export interface Board {
  svg: SVGSVGElement;
  compiled: Compiled;
  timeline: Timeline;
  apply(t: number): void;
}

interface Node {
  op: TimedOp;
  el: SVGElement;
  clip?: SVGRectElement;
  last: number;
}

const easeInOut = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

export function buildBoard(scn: Scenario, measure: Measure, doc: Document = document): Board {
  const compiled = compileScenario(scn, measure);
  const timeline = buildTimeline(compiled);
  const id = `tb${++boardCounter}`;

  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const el = doc.createElementNS(NS, tag) as SVGElementTagNameMap[K];
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  const svg = make('svg', {
    xmlns: NS,
    viewBox: `0 0 ${CANVAS.width} ${CANVAS.height}`,
    width: CANVAS.width,
    height: CANVAS.height,
    role: 'img',
  });
  const label = doc.createElementNS(NS, 'title');
  label.textContent = scn.title;
  svg.appendChild(label);
  const defs = make('defs', {});
  svg.appendChild(defs);
  svg.appendChild(make('rect', { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height, fill: PAPER }));
  const fills = make('g', {});
  const strokes = make('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const texts = make('g', { 'font-family': FONT_STACK });
  svg.append(fills, strokes, texts);

  const nodes: Node[] = [];
  timeline.ops.forEach((op, i) => {
    if (op.kind === 'stroke') {
      const el = make('path', {
        d: op.d,
        stroke: HEX[op.color],
        'stroke-width': op.sw,
        pathLength: 1,
      });
      strokes.appendChild(el);
      nodes.push({ op, el, last: -1 });
    } else if (op.kind === 'fill') {
      const el = make('path', { d: op.d, fill: HEX[op.color], stroke: 'none' });
      fills.appendChild(el);
      nodes.push({ op, el, last: -1 });
    } else {
      const left = op.anchor === 'middle' ? op.x - op.width / 2 : op.anchor === 'end' ? op.x - op.width : op.x;
      const clipId = `${id}c${i}`;
      const clipPath = make('clipPath', { id: clipId });
      const rect = make('rect', { x: left - 8, y: op.y - op.px, width: 0, height: op.px * 1.45 });
      clipPath.appendChild(rect);
      defs.appendChild(clipPath);
      const g = make('g', op.tilt ? { transform: `rotate(${op.tilt.toFixed(2)} ${op.x} ${op.y})` } : {});
      const el = make('text', {
        x: op.x,
        y: op.y,
        'font-size': op.px,
        'font-weight': op.weight,
        'text-anchor': op.anchor,
        fill: HEX[op.color],
        'clip-path': `url(#${clipId})`,
      });
      el.textContent = op.text;
      g.appendChild(el);
      texts.appendChild(g);
      nodes.push({ op, el, clip: rect, last: -1 });
    }
  });

  const apply = (t: number) => {
    for (const n of nodes) {
      const p = opProgress(n.op, t);
      if (p === n.last) continue;
      n.last = p;
      if (p <= 0) {
        n.el.setAttribute('visibility', 'hidden');
        continue;
      }
      n.el.removeAttribute('visibility');
      if (n.op.kind === 'stroke') {
        if (p >= 1) {
          n.el.removeAttribute('stroke-dasharray');
          n.el.removeAttribute('stroke-dashoffset');
        } else {
          n.el.setAttribute('stroke-dasharray', '1 2');
          n.el.setAttribute('stroke-dashoffset', (1 - easeInOut(p)).toFixed(4));
        }
      } else if (n.op.kind === 'fill') {
        n.el.setAttribute('fill-opacity', (0.2 * p).toFixed(3));
      } else if (n.clip) {
        n.clip.setAttribute('width', ((n.op.width + 16) * p).toFixed(1));
      }
    }
  };
  apply(0);

  return { svg, compiled, timeline, apply };
}
