import './style.css';
import { buildBoard, type Board } from './board';
import { EXAMPLES, counterpart, defaultExample, findExample } from './examples';
import { download, finalSvg, scenarioBlob, slugify, svgToPng } from './export';
import { t } from './i18n';
import { FONT_FAMILY, estimateWidth, type Measure } from './layout';
import { TahtaError, generateScenario } from './llm';
import { generateScenarioWithClaude, getClaudeHost, type CallForm } from './llm-artifact';
import { Player, SPEEDS, type PlayerState } from './player';
import { DEFAULT_MODEL } from './prompt';
import { validateScenario, type Lang, type Scenario } from './schema';

const STORE = { lang: 'tahta.lang', model: 'tahta.model', key: 'tahta.apiKey' } as const;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): settings simply do not persist */
  }
}

const params = new URLSearchParams(location.search);
const paramLang = params.get('lang');

let lang: Lang =
  paramLang === 'en' || paramLang === 'tr' ? paramLang : readStore(STORE.lang) === 'en' ? 'en' : 'tr';
let scenario: Scenario | null = null;
let board: Board | null = null;
let player: Player | null = null;
let currentExample: string | null = null;
let generated = false;
let busy = false;
let lastStep = -1;
let measure: Measure = estimateWidth;
/** Artifact mode: running inside Claude with window.claude available; no API key or settings. */
let artifactMode = false;
let claudeForm: CallForm | undefined;

// --- text measuring with the real font ---------------------------------------

function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return estimateWidth;
  return (text, px, weight) => {
    ctx.font = `${weight} ${px}px '${FONT_FAMILY}'`;
    return ctx.measureText(text).width;
  };
}

async function loadFonts(): Promise<void> {
  const sample = 'AaĞğŞşİıÇçÖöÜü';
  try {
    await Promise.all([
      document.fonts.load(`500 34px '${FONT_FAMILY}'`, sample),
      document.fonts.load(`700 72px '${FONT_FAMILY}'`, sample),
    ]);
    if (document.fonts.check(`500 34px '${FONT_FAMILY}'`, sample)) measure = canvasMeasure();
  } catch {
    /* fall back to the width estimator and the cursive fallback font */
  }
}

// --- i18n ------------------------------------------------------------------------

function applyI18n(): void {
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n as string);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(lang, el.dataset.i18nPlaceholder as string);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const s = t(lang, el.dataset.i18nTitle as string);
    el.title = s;
    el.setAttribute('aria-label', s);
  });
  $('btn-lang').textContent = lang === 'tr' ? 'EN' : 'TR';
  renderDemos();
  renderSteps();
  if (player) onPlayerChange(player.state, true);
}

// --- status / errors ---------------------------------------------------------------

function setStatus(message: string | null, opts: { error?: boolean; details?: string[] } = {}): void {
  const el = $('status');
  el.replaceChildren();
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.classList.toggle('error', !!opts.error);
  const p = document.createElement('div');
  p.textContent = message;
  el.appendChild(p);
  if (opts.details && opts.details.length) {
    const d = document.createElement('details');
    const s = document.createElement('summary');
    s.textContent = t(lang, 'errDetails');
    const ul = document.createElement('ul');
    for (const line of opts.details.slice(0, 12)) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    d.append(s, ul);
    el.appendChild(d);
  }
}

function errorMessage(e: unknown): { message: string; details: string[] } {
  if (e instanceof TahtaError) {
    switch (e.code) {
      case 'no-key':
        return { message: t(lang, 'errNoKey'), details: [] };
      case 'no-question':
        return { message: t(lang, 'errNoQuestion'), details: [] };
      case 'network':
        return { message: t(lang, 'errNetwork'), details: [] };
      case 'empty':
        return { message: t(lang, 'errEmpty'), details: [] };
      case 'invalid':
        return { message: t(lang, artifactMode ? 'errInvalidArtifact' : 'errInvalid'), details: e.details };
      case 'no-claude':
        return { message: t(lang, 'errNoClaude'), details: [] };
      case 'claude':
        return { message: t(lang, 'errClaude'), details: e.details };
      case 'http': {
        const specific = e.status === 401 || e.status === 404 || e.status === 429 ? `errHttp${e.status}` : 'errHttp';
        return { message: t(lang, specific, { status: e.status ?? '?' }), details: e.details };
      }
    }
  }
  return { message: t(lang, 'errNetwork'), details: [] };
}

// --- board / player ----------------------------------------------------------------

function renderDemos(): void {
  const list = $('demo-list');
  list.replaceChildren();
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ex.label;
    const tag = document.createElement('span');
    tag.className = 'lang-tag';
    tag.textContent = ex.lang;
    b.appendChild(tag);
    b.setAttribute('aria-pressed', String(ex.id === currentExample));
    b.addEventListener('click', () => loadExample(ex.id, true));
    list.appendChild(b);
  }
}

function renderSteps(): void {
  const ol = $('step-list');
  ol.replaceChildren();
  if (!board) return;
  board.timeline.steps.forEach((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i);
    const label = document.createElement('span');
    label.textContent = i === 0 ? t(lang, 'introStep') : s.title;
    b.append(num, label);
    b.addEventListener('click', () => player?.goToStep(i));
    li.appendChild(b);
    ol.appendChild(li);
  });
  lastStep = -1;
}

function onPlayerChange(s: PlayerState, force = false): void {
  if (!board) return;
  const tl = board.timeline;
  const playBtn = $('btn-play');
  const label = s.playing ? t(lang, 'pause') : t(lang, 'play');
  playBtn.textContent = `${s.playing ? '❚❚' : '▶'} ${label}`;
  ($('progress') as HTMLInputElement).value = String(Math.round((s.time / tl.total) * 1000));
  $('step-count').textContent = `${s.step}/${tl.steps.length - 1}`;
  if (s.step !== lastStep || force) {
    lastStep = s.step;
    const items = $('step-list').children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', i === s.step);
      items[i].classList.toggle('done', i < s.step);
      if (i === s.step) items[i].querySelector('button')?.setAttribute('aria-current', 'step');
      else items[i].querySelector('button')?.removeAttribute('aria-current');
    }
    const step = tl.steps[s.step];
    const box = $('narration');
    box.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = s.step === 0 ? (scenario?.question ?? step.title) : step.title;
    box.appendChild(strong);
    const text = s.step === 0 ? scenario?.summary : step.narration;
    if (text) box.appendChild(document.createTextNode(` — ${text}`));
    if (generated) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = t(lang, 'aiNote');
      box.appendChild(note);
    }
  }
}

function mountScenario(scn: Scenario, opts: { autoplay: boolean; at?: number }): void {
  player?.destroy();
  scenario = scn;
  board = buildBoard(scn, measure);
  // Number of automatic text nudges; read by the screenshot script to catch layout regressions.
  document.documentElement.dataset.layoutFixes = String(board.compiled.adjustments.length);
  document.documentElement.dataset.layoutNotes = board.compiled.adjustments.join(' | ');
  $('board').replaceChildren(board.svg);
  player = new Player(board, (s) => onPlayerChange(s));
  renderSteps();
  if (opts.at !== undefined) player.seek(board.timeline.total * opts.at);
  else if (opts.autoplay) player.play();
  else player.seek(0);
}

function loadExample(id: string, autoplay: boolean, at?: number): boolean {
  const ex = findExample(id);
  if (!ex) return false;
  const res = validateScenario(ex.data);
  if (!res.ok) {
    setStatus(t(lang, 'errFile'), { error: true, details: res.errors });
    return false;
  }
  currentExample = id;
  generated = false;
  setStatus(null);
  renderDemos();
  mountScenario(res.scenario, { autoplay, at });
  return true;
}

// --- asking the model --------------------------------------------------------------

async function ask(): Promise<void> {
  if (busy) return;
  if (!artifactMode && getClaudeHost()) applyMode(true); // helper injected after load
  const question = ($('question') as HTMLInputElement).value;
  const apiKey = readStore(STORE.key) ?? '';
  if (!question.trim()) {
    setStatus(t(lang, 'errNoQuestion'), { error: true });
    return;
  }
  if (!artifactMode && !apiKey) {
    setStatus(t(lang, 'errNoKey'), { error: true });
    openSettings();
    return;
  }
  busy = true;
  const btn = $('btn-ask') as HTMLButtonElement;
  btn.disabled = true;
  setStatus(t(lang, 'asking'));
  try {
    let res;
    if (artifactMode) {
      res = await generateScenarioWithClaude({ question, lang, form: claudeForm });
      claudeForm = res.form;
    } else {
      res = await generateScenario({
        apiKey,
        model: readStore(STORE.model) || DEFAULT_MODEL,
        question,
        lang,
      });
    }
    currentExample = null;
    generated = true;
    renderDemos();
    setStatus(res.repaired ? t(lang, 'repairedNote') : null);
    mountScenario(res.scenario, { autoplay: true });
  } catch (e) {
    const { message, details } = errorMessage(e);
    setStatus(message, { error: true, details });
  } finally {
    busy = false;
    btn.disabled = false;
  }
}

/**
 * Switch the UI between the API-key build and the Claude artifact build.
 * In artifact mode the key/model settings are hidden (Claude pays from the
 * viewer's own plan) and so are the download buttons: the artifact viewer
 * blocks downloads a page starts by itself.
 */
function applyMode(artifact: boolean): void {
  artifactMode = artifact;
  document.documentElement.dataset.mode = artifact ? 'artifact' : 'byok';
  $('btn-settings').hidden = artifact;
  $('mode-note').hidden = !artifact;
  $('demos-label').dataset.i18n = artifact ? 'demosArtifact' : 'demos';
  $('footer-text').dataset.i18n = artifact ? 'footerArtifact' : 'footer';
  for (const id of ['btn-json', 'btn-svg', 'btn-png']) $(id).hidden = artifact;
  applyI18n();
}

// --- settings ------------------------------------------------------------------------

function openSettings(): void {
  ($('api-key') as HTMLInputElement).value = readStore(STORE.key) ?? '';
  ($('model') as HTMLInputElement).value = readStore(STORE.model) || DEFAULT_MODEL;
  $('settings-msg').textContent = '';
  ($('settings') as HTMLDialogElement).showModal();
}

function saveSettings(): void {
  const key = ($('api-key') as HTMLInputElement).value.trim();
  const model = ($('model') as HTMLInputElement).value.trim();
  writeStore(STORE.key, key || null);
  writeStore(STORE.model, model && model !== DEFAULT_MODEL ? model : null);
  ($('settings') as HTMLDialogElement).close();
  setStatus(null);
}

// --- wiring ----------------------------------------------------------------------------

/** Should a global shortcut be ignored because the focused control uses that key itself? */
function keyBelongsToControl(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return (target as HTMLInputElement).type !== 'range' || key !== ' ';
  // Space activates a focused button or link natively; arrows are free.
  if (tag === 'BUTTON' || tag === 'A') return key === ' ';
  return false;
}

function wire(): void {
  $('ask').addEventListener('submit', (e) => {
    e.preventDefault();
    void ask();
  });
  $('btn-lang').addEventListener('click', () => {
    lang = lang === 'tr' ? 'en' : 'tr';
    writeStore(STORE.lang, lang);
    const other = currentExample ? counterpart(currentExample, lang) : undefined;
    if (other && other.id !== currentExample) loadExample(other.id, false, 1);
    applyI18n();
  });
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-save').addEventListener('click', saveSettings);
  $('btn-close').addEventListener('click', () => ($('settings') as HTMLDialogElement).close());
  $('btn-remove-key').addEventListener('click', () => {
    writeStore(STORE.key, null);
    ($('api-key') as HTMLInputElement).value = '';
    $('settings-msg').textContent = t(lang, 'keyRemoved');
  });

  $('btn-play').addEventListener('click', () => player?.toggle());
  $('btn-prev').addEventListener('click', () => player?.prev());
  $('btn-next').addEventListener('click', () => player?.next());
  $('btn-restart').addEventListener('click', () => player?.restart());
  $('progress').addEventListener('input', (e) => {
    if (!board || !player) return;
    player.pause();
    player.seek((Number((e.target as HTMLInputElement).value) / 1000) * board.timeline.total);
  });

  const speed = $('speed') as HTMLSelectElement;
  for (const v of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = `${v}×`;
    if (v === 1) o.selected = true;
    speed.appendChild(o);
  }
  speed.addEventListener('change', () => player?.setSpeed(Number(speed.value)));

  $('btn-json').addEventListener('click', () => {
    if (scenario) download(`${slugify(scenario.title)}.tahta.json`, scenarioBlob(scenario));
  });
  $('btn-svg').addEventListener('click', async () => {
    if (!scenario) return;
    const svg = await finalSvg(scenario, measure);
    download(`${slugify(scenario.title)}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
  });
  $('btn-png').addEventListener('click', async () => {
    if (!scenario) return;
    const png = await svgToPng(await finalSvg(scenario, measure));
    download(`${slugify(scenario.title)}.png`, png);
  });
  const file = $('file') as HTMLInputElement;
  $('btn-load').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    let raw: unknown;
    try {
      raw = JSON.parse(await f.text());
    } catch {
      setStatus(t(lang, 'errFile'), { error: true });
      return;
    }
    const res = validateScenario(raw);
    if (!res.ok) {
      setStatus(t(lang, 'errFile'), { error: true, details: res.errors });
      return;
    }
    currentExample = null;
    generated = false;
    renderDemos();
    setStatus(null);
    mountScenario(res.scenario, { autoplay: true });
  });

  document.addEventListener('keydown', (e) => {
    if (!player || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.code === 'Space' ? ' ' : e.key;
    if (($('settings') as HTMLDialogElement).open || keyBelongsToControl(e.target, key)) return;
    if (key === ' ') {
      e.preventDefault();
      player.toggle();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      player.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      player.prev();
    }
  });
}

async function init(): Promise<void> {
  wire();
  applyMode(getClaudeHost() !== null);
  await loadFonts();
  // ?demo=<id>&at=<0..1> opens a demo paused at a fraction of its timeline (used for screenshots and sharing).
  const demo = params.get('demo');
  const atRaw = params.get('at');
  const at = atRaw !== null && Number.isFinite(Number(atRaw)) ? Math.min(1, Math.max(0, Number(atRaw))) : undefined;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const id = demo && findExample(demo) ? demo : defaultExample(lang).id;
  loadExample(id, !reduceMotion, at ?? (reduceMotion ? 1 : undefined));
  applyI18n();
  document.documentElement.dataset.ready = '1';
}

void init();
