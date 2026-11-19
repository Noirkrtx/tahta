/**
 * Hand-written demo scenarios, bundled so the app works without an API key.
 * `group` links translations of the same scenario.
 */
import type { Lang } from './schema';
import mevsimlerTr from '../examples/mevsimler.tr.json';
import seasonsEn from '../examples/seasons.en.json';
import kalpTr from '../examples/kalp.tr.json';
import pisagorTr from '../examples/pisagor.tr.json';
import fotosentezTr from '../examples/fotosentez.tr.json';

export interface Example {
  id: string;
  group: string;
  lang: Lang;
  label: string;
  /** Raw JSON; always passed through validateScenario before use. */
  data: unknown;
}

export const EXAMPLES: Example[] = [
  { id: 'mevsimler', group: 'seasons', lang: 'tr', label: 'Neden mevsimler var?', data: mevsimlerTr },
  { id: 'seasons', group: 'seasons', lang: 'en', label: 'Why do we have seasons?', data: seasonsEn },
  { id: 'kalp', group: 'heart', lang: 'tr', label: 'Kalp nasıl pompalar?', data: kalpTr },
  { id: 'pisagor', group: 'pythagoras', lang: 'tr', label: 'Pisagor teoremi neden doğru?', data: pisagorTr },
  { id: 'fotosentez', group: 'photosynthesis', lang: 'tr', label: 'Fotosentez kısaca', data: fotosentezTr },
];

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

/** The same scenario in another language, if one exists. */
export function counterpart(id: string, lang: Lang): Example | undefined {
  const cur = findExample(id);
  if (!cur) return undefined;
  return EXAMPLES.find((e) => e.group === cur.group && e.lang === lang);
}

export function defaultExample(lang: Lang): Example {
  return EXAMPLES.find((e) => e.lang === lang) ?? EXAMPLES[0];
}
