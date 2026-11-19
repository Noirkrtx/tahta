/**
 * Claude artifact client: when tahta runs as an AI-powered artifact inside
 * Claude, the host page provides `window.claude.complete`, and each request
 * runs on the signed-in viewer's own Claude plan. No API key is involved.
 *
 * What is known about the helper (see docs/KARARLAR.md for sources):
 *  - `window.claude.complete(prompt: string): Promise<string>` — a single
 *    prompt string in, the reply text out.
 *  - Newer hosts also accept a Messages-API-like object
 *    (`{ system, messages, max_tokens }`); without `max_tokens` the output is
 *    reportedly capped at 1024 tokens, too short for a board scenario.
 *
 * Neither shape is in Anthropic's public documentation, so the client tries
 * the object form first and falls back to the plain string form if the host
 * rejects it. Prompt building, JSON extraction, schema validation and the
 * single repair round are shared with the API-key client (`runWithRepair`).
 */
import { TahtaError, runWithRepair, type GenerateResult, type Message } from './llm';
import type { Lang } from './schema';

export interface CompleteRequest {
  system?: string;
  messages: Message[];
  max_tokens?: number;
}

export interface ClaudeHost {
  complete(input: string | CompleteRequest): Promise<unknown>;
}

/** `messages`: object request; `prompt`: one flattened string. */
export type CallForm = 'messages' | 'prompt';

export interface ArtifactGenerateOptions {
  question: string;
  lang: Lang;
  /** Defaults to `window.claude`. */
  host?: ClaudeHost | null;
  /** Skip the probe when an earlier call already showed which form works. */
  form?: CallForm;
  maxTokens?: number;
}

export interface ArtifactGenerateResult extends GenerateResult {
  /** The call form that worked; pass it back in as `form` next time. */
  form: CallForm;
}

/** The host's Claude helper, if this page runs inside a Claude artifact. */
export function getClaudeHost(scope: unknown = globalThis): ClaudeHost | null {
  const claude = (scope as { claude?: unknown } | null | undefined)?.claude;
  if (typeof claude !== 'object' || claude === null) return null;
  const complete = (claude as { complete?: unknown }).complete;
  if (typeof complete !== 'function') return null;
  return { complete: (input) => (complete as ClaudeHost['complete']).call(claude, input) };
}

/**
 * Flatten system prompt + conversation into one string, following the
 * pattern Anthropic's own artifact instructions give for multi-turn state:
 * the whole history as JSON, then the instruction to answer the last turn.
 */
export function flattenPrompt(system: string, messages: Message[]): string {
  if (messages.length === 1) return `${system}\n\n---\n\n${messages[0].content}`;
  return [
    system,
    '---',
    'The following is the COMPLETE conversation so far, as a JSON array. Reply to the LAST user message, taking all earlier messages into account:',
    JSON.stringify(messages),
    'Your entire reply MUST be a single valid JSON object, with no text before or after it.',
  ].join('\n\n');
}

/** Reply text from whatever the host resolved with (normally a plain string). */
export function replyText(reply: unknown): string {
  if (typeof reply === 'string') return reply;
  if (reply && typeof reply === 'object') {
    const r = reply as { text?: unknown; content?: unknown; completion?: unknown };
    if (typeof r.text === 'string') return r.text;
    if (typeof r.completion === 'string') return r.completion;
    if (Array.isArray(r.content)) {
      return r.content
        .map((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : ''))
        .join('');
    }
  }
  return '';
}

function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return msg.slice(0, 300);
}

/** Generate a board scenario through `window.claude.complete`. */
export async function generateScenarioWithClaude(opts: ArtifactGenerateOptions): Promise<ArtifactGenerateResult> {
  const question = opts.question.trim();
  const host = opts.host === undefined ? getClaudeHost() : opts.host;
  if (!host) throw new TahtaError('no-claude', 'window.claude is not available');
  if (!question) throw new TahtaError('no-question', 'question is empty');
  const maxTokens = opts.maxTokens ?? 8000;
  let form: CallForm | undefined = opts.form;

  const call = async (f: CallForm, system: string, messages: Message[]): Promise<unknown> =>
    f === 'messages'
      ? host.complete({ system, messages, max_tokens: maxTokens })
      : host.complete(flattenPrompt(system, messages));

  const complete = async (system: string, messages: Message[]): Promise<string> => {
    let reply: unknown;
    if (form) {
      try {
        reply = await call(form, system, messages);
      } catch (e) {
        throw new TahtaError('claude', 'Claude request failed', describe(e) ? [describe(e)] : []);
      }
    } else {
      // First call of the session: probe the object form, fall back to the string form.
      try {
        reply = await call('messages', system, messages);
        form = 'messages';
      } catch (e1) {
        try {
          reply = await call('prompt', system, messages);
          form = 'prompt';
        } catch (e2) {
          const details = [describe(e1), describe(e2)].filter((d, i, a) => d && a.indexOf(d) === i);
          throw new TahtaError('claude', 'Claude request failed', details);
        }
      }
    }
    const text = replyText(reply);
    if (!text.trim()) throw new TahtaError('empty', 'Claude reply contained no text');
    return text;
  };

  const res = await runWithRepair(question, opts.lang, complete);
  return { ...res, form: form ?? 'messages' };
}
