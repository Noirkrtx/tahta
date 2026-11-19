/**
 * Anthropic Messages API client for the browser (bring-your-own-key).
 *
 * The key is passed in by the caller, sent only to api.anthropic.com, and
 * never logged or put into error messages. `fetchImpl` is injectable so the
 * whole flow (including the single repair round) is testable with a fake.
 */
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from './prompt';
import { validateScenario, type Lang, type Scenario } from './schema';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';

export type TahtaErrorCode =
  | 'no-key'
  | 'no-question'
  | 'network'
  | 'http'
  | 'empty'
  | 'invalid'
  /** Artifact mode: window.claude is missing or its call was rejected. */
  | 'no-claude'
  | 'claude';

export class TahtaError extends Error {
  constructor(
    public readonly code: TahtaErrorCode,
    message: string,
    public readonly details: string[] = [],
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TahtaError';
  }
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  question: string;
  lang: Lang;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface GenerateResult {
  scenario: Scenario;
  /** True when the first reply was invalid and the repair round fixed it. */
  repaired: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Pull the JSON object out of a model reply (tolerates code fences and stray prose around it). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('reply contains no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

async function callApi(opts: GenerateOptions, system: string, messages: Message[]): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8000,
        system,
        messages,
      }),
      signal: opts.signal,
    });
  } catch {
    throw new TahtaError('network', 'network request failed');
  }
  if (!res.ok) {
    let apiMessage = '';
    try {
      const body = (await res.json()) as { error?: { message?: unknown } };
      if (typeof body?.error?.message === 'string') apiMessage = body.error.message;
    } catch {
      /* body was not JSON */
    }
    throw new TahtaError('http', `API responded with HTTP ${res.status}`, apiMessage ? [apiMessage] : [], res.status);
  }
  let data: { content?: unknown };
  try {
    data = (await res.json()) as { content?: unknown };
  } catch {
    throw new TahtaError('empty', 'API reply was not JSON');
  }
  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .filter(
      (b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string',
    )
    .map((b) => b.text)
    .join('');
  if (!text.trim()) throw new TahtaError('empty', 'API reply contained no text');
  return text;
}

function check(text: string): { ok: true; scenario: Scenario } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  return validateScenario(raw);
}

/** One model round trip: system prompt + conversation in, reply text out. */
export type Complete = (system: string, messages: Message[]) => Promise<string>;

/**
 * The transport-independent part: build the prompts, validate the reply and,
 * if it is invalid, send exactly one repair request that lists the
 * validation errors. If that fails too, a TahtaError with code "invalid" is
 * thrown. Used by both the API-key client and the Claude artifact client.
 */
export async function runWithRepair(question: string, lang: Lang, complete: Complete): Promise<GenerateResult> {
  const system = buildSystemPrompt(lang);
  const messages: Message[] = [{ role: 'user', content: buildUserPrompt(question, lang) }];

  const first = await complete(system, messages);
  const firstCheck = check(first);
  if (firstCheck.ok) return { scenario: { ...firstCheck.scenario, question }, repaired: false };

  messages.push({ role: 'assistant', content: first });
  messages.push({ role: 'user', content: buildRepairPrompt(firstCheck.errors) });
  const second = await complete(system, messages);
  const secondCheck = check(second);
  if (secondCheck.ok) return { scenario: { ...secondCheck.scenario, question }, repaired: true };

  throw new TahtaError('invalid', 'model did not return a valid board scenario', secondCheck.errors);
}

/** Ask the model for a board scenario through the Anthropic API (bring-your-own-key). */
export async function generateScenario(opts: GenerateOptions): Promise<GenerateResult> {
  const question = opts.question.trim();
  if (!opts.apiKey.trim()) throw new TahtaError('no-key', 'API key is missing');
  if (!question) throw new TahtaError('no-question', 'question is empty');
  return runWithRepair(question, opts.lang, (system, messages) => callApi(opts, system, messages));
}
