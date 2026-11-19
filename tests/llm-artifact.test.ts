import { describe, expect, it } from 'vitest';
import { TahtaError } from '../src/llm';
import {
  flattenPrompt,
  generateScenarioWithClaude,
  getClaudeHost,
  replyText,
  type ClaudeHost,
  type CompleteRequest,
} from '../src/llm-artifact';
import { buildRepairPrompt, buildSystemPrompt } from '../src/prompt';

const good = {
  version: 1,
  lang: 'en',
  title: 'Why is the sky blue?',
  summary: 'Air scatters blue light more than red.',
  steps: [{ title: 'Sunlight', elements: [{ type: 'text', x: 60, y: 300, text: 'Sunlight is a mix.' }] }],
};

type Reply = unknown | Error;

/**
 * Fake `window.claude`: answers with the queued replies in order and records
 * every input. With `stringOnly`, object inputs are rejected the way an older
 * host that only takes a prompt string might.
 */
function fakeClaude(replies: Reply[], opts: { stringOnly?: boolean } = {}) {
  const inputs: (string | CompleteRequest)[] = [];
  const host: ClaudeHost = {
    async complete(input) {
      inputs.push(input);
      if (opts.stringOnly && typeof input !== 'string') throw new TypeError('prompt must be a string');
      if (!replies.length) throw new Error('unexpected extra Claude call');
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { host, inputs };
}

const base = { question: ' Why is the sky blue? ', lang: 'en' as const };

describe('getClaudeHost', () => {
  it('finds window.claude.complete and keeps its `this`', async () => {
    const claude = {
      tag: 'host',
      complete(this: { tag: string }, p: unknown) {
        return Promise.resolve(`${this.tag}:${String(p)}`);
      },
    };
    const host = getClaudeHost({ claude });
    expect(host).not.toBeNull();
    expect(await host!.complete('hi')).toBe('host:hi');
  });
  it('returns null outside Claude', () => {
    expect(getClaudeHost({})).toBeNull();
    expect(getClaudeHost({ claude: {} })).toBeNull();
    expect(getClaudeHost({ claude: { complete: 'nope' } })).toBeNull();
    expect(getClaudeHost(undefined)).toBeNull();
    expect(getClaudeHost(globalThis)).toBeNull();
  });
});

describe('generateScenarioWithClaude', () => {
  it('valid JSON: one object-form call with system prompt, messages and a raised output cap', async () => {
    const c = fakeClaude([JSON.stringify(good)]);
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.repaired).toBe(false);
    expect(res.form).toBe('messages');
    expect(res.scenario.title).toBe(good.title);
    expect(res.scenario.question).toBe('Why is the sky blue?');
    expect(c.inputs).toHaveLength(1);
    const req = c.inputs[0] as CompleteRequest;
    expect(req.system).toBe(buildSystemPrompt('en'));
    expect(req.max_tokens).toBe(8000);
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('Why is the sky blue?');
  });

  it('JSON inside a code fence with prose around it', async () => {
    const c = fakeClaude(['Here is the board:\n```json\n' + JSON.stringify(good, null, 2) + '\n```\nEnjoy!']);
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.repaired).toBe(false);
    expect(res.scenario.steps).toHaveLength(1);
  });

  it('broken JSON triggers exactly one repair round with the errors and the first reply', async () => {
    const broken = '{"version":1,"lang":"en","title":"x",';
    const c = fakeClaude([broken, JSON.stringify(good)]);
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.repaired).toBe(true);
    expect(c.inputs).toHaveLength(2);
    const repair = c.inputs[1] as CompleteRequest;
    expect(repair.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(repair.messages[1].content).toBe(broken);
    expect(repair.messages[2].content).toBe(buildRepairPrompt(['not valid JSON: reply contains no JSON object']));
  });

  it('schema errors are listed in the repair request', async () => {
    const bad = { ...good, steps: [{ title: 'S', elements: [{ type: 'text', x: 60, y: 300, text: 'a', color: 'pink' }] }] };
    const c = fakeClaude([JSON.stringify(bad), JSON.stringify(good)]);
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.repaired).toBe(true);
    expect((c.inputs[1] as CompleteRequest).messages[2].content).toContain('color');
  });

  it('gives up after one failed repair with code "invalid"', async () => {
    const c = fakeClaude(['no json here', '{"still": "wrong"}']);
    const err = await generateScenarioWithClaude({ ...base, host: c.host }).catch((e) => e);
    expect(err).toBeInstanceOf(TahtaError);
    expect((err as TahtaError).code).toBe('invalid');
    expect((err as TahtaError).details.length).toBeGreaterThan(0);
    expect(c.inputs).toHaveLength(2);
  });

  it('falls back to the plain prompt string when the host rejects the object form, and remembers it', async () => {
    const c = fakeClaude(['oops', JSON.stringify(good)], { stringOnly: true });
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.form).toBe('prompt');
    expect(res.repaired).toBe(true);
    // object probe (rejected) + string retry, then the repair goes straight to the string form
    expect(c.inputs.map((i) => typeof i)).toEqual(['object', 'string', 'string']);
    const first = c.inputs[1] as string;
    expect(first.startsWith(buildSystemPrompt('en'))).toBe(true);
    expect(first).toContain('Why is the sky blue?');
    const repair = c.inputs[2] as string;
    expect(repair).toContain('COMPLETE conversation');
    expect(repair).toContain('"role":"assistant","content":"oops"');
  });

  it('uses a remembered form without probing', async () => {
    const c = fakeClaude([JSON.stringify(good)]);
    const res = await generateScenarioWithClaude({ ...base, host: c.host, form: 'prompt' });
    expect(res.form).toBe('prompt');
    expect(typeof c.inputs[0]).toBe('string');
  });

  it('host errors become code "claude" with the host message as detail', async () => {
    const c = fakeClaude([new Error('rate limited'), new Error('rate limited')]);
    const err = await generateScenarioWithClaude({ ...base, host: c.host }).catch((e) => e);
    expect((err as TahtaError).code).toBe('claude');
    expect((err as TahtaError).details).toEqual(['rate limited']);
  });

  it('a host error during the repair round is reported, not swallowed', async () => {
    const c = fakeClaude(['not json', new Error('usage limit reached')]);
    const err = await generateScenarioWithClaude({ ...base, host: c.host }).catch((e) => e);
    expect((err as TahtaError).code).toBe('claude');
    expect((err as TahtaError).details).toEqual(['usage limit reached']);
  });

  it('empty reply is an "empty" error', async () => {
    const c = fakeClaude(['   ']);
    const err = await generateScenarioWithClaude({ ...base, host: c.host }).catch((e) => e);
    expect((err as TahtaError).code).toBe('empty');
  });

  it('accepts Messages-API-shaped replies too', async () => {
    const c = fakeClaude([{ content: [{ type: 'text', text: JSON.stringify(good) }] }]);
    const res = await generateScenarioWithClaude({ ...base, host: c.host });
    expect(res.scenario.title).toBe(good.title);
  });

  it('checks preconditions before calling Claude', async () => {
    const c = fakeClaude([]);
    const noHost = await generateScenarioWithClaude({ ...base, host: null }).catch((e) => e);
    expect((noHost as TahtaError).code).toBe('no-claude');
    const noQ = await generateScenarioWithClaude({ ...base, question: '  ', host: c.host }).catch((e) => e);
    expect((noQ as TahtaError).code).toBe('no-question');
    expect(c.inputs).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('flattenPrompt keeps a single turn simple and serialises longer conversations', () => {
    expect(flattenPrompt('SYS', [{ role: 'user', content: 'Q' }])).toBe('SYS\n\n---\n\nQ');
    const multi = flattenPrompt('SYS', [
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'A' },
      { role: 'user', content: 'fix' },
    ]);
    expect(multi.startsWith('SYS')).toBe(true);
    expect(multi).toContain(JSON.stringify([{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }, { role: 'user', content: 'fix' }]));
  });
  it('replyText reads strings and common object shapes', () => {
    expect(replyText('x')).toBe('x');
    expect(replyText({ text: 'y' })).toBe('y');
    expect(replyText({ completion: 'z' })).toBe('z');
    expect(replyText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab');
    expect(replyText(null)).toBe('');
    expect(replyText(42)).toBe('');
  });
});
