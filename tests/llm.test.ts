import { describe, expect, it } from 'vitest';
import { API_URL, TahtaError, extractJson, generateScenario } from '../src/llm';
import { buildRepairPrompt, buildSystemPrompt, DEFAULT_MODEL } from '../src/prompt';

const SECRET = 'sk-ant-test-SECRET-123';

const good = {
  version: 1,
  lang: 'en',
  title: 'Why is the sky blue?',
  summary: 'Air scatters blue light more than red.',
  steps: [{ title: 'Sunlight', elements: [{ type: 'text', x: 60, y: 300, text: 'Sunlight is a mix.' }] }],
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { model: string; system: string; max_tokens: number; messages: { role: string; content: string }[] };
}

/** Fake fetch that returns the queued replies in order and records every request. */
function fakeApi(replies: (string | { status: number; body: unknown } | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const next = replies.shift();
    if (next === undefined) throw new Error('unexpected extra API call');
    if (next instanceof Error) throw next;
    if (typeof next === 'string') {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: next }], stop_reason: 'end_turn' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const base = { apiKey: SECRET, model: DEFAULT_MODEL, question: ' Why is the sky blue? ', lang: 'en' as const };

describe('extractJson', () => {
  it('handles bare JSON, code fences and surrounding prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n{"a":{"b":2}}\nHope it helps')).toEqual({ a: { b: 2 } });
  });
  it('throws when there is no object', () => {
    expect(() => extractJson('sorry, no')).toThrow();
    expect(() => extractJson('{"a":')).toThrow();
  });
});

describe('generateScenario', () => {
  it('sends a direct browser request with the right headers and returns the scenario', async () => {
    const api = fakeApi([JSON.stringify(good)]);
    const res = await generateScenario({ ...base, fetchImpl: api.fetchImpl });
    expect(res.repaired).toBe(false);
    expect(res.scenario.title).toBe(good.title);
    expect(res.scenario.question).toBe('Why is the sky blue?');
    expect(api.calls).toHaveLength(1);
    const call = api.calls[0];
    expect(call.url).toBe(API_URL);
    expect(call.headers['x-api-key']).toBe(SECRET);
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(call.body.model).toBe('claude-fable-5-2');
    expect(call.body.system).toBe(buildSystemPrompt('en'));
    expect(call.body.messages).toHaveLength(1);
    expect(call.body.messages[0].content).toContain('Why is the sky blue?');
    // The key travels in the header only.
    expect(JSON.stringify(call.body)).not.toContain(SECRET);
  });

  it('asks for one repair when the first reply is invalid, and reports the validation errors', async () => {
    const bad = { ...good, steps: [{ title: 'x', elements: [{ type: 'blob', x: 1 }] }] };
    const api = fakeApi([JSON.stringify(bad), '```json\n' + JSON.stringify(good) + '\n```']);
    const res = await generateScenario({ ...base, fetchImpl: api.fetchImpl });
    expect(res.repaired).toBe(true);
    expect(res.scenario.steps).toHaveLength(1);
    expect(api.calls).toHaveLength(2);
    const msgs = api.calls[1].body.messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1].content).toBe(JSON.stringify(bad));
    expect(msgs[2].content).toContain('steps[0].elements[0].type');
  });

  it('repairs a reply that is not JSON at all', async () => {
    const api = fakeApi(['I would rather chat about this.', JSON.stringify(good)]);
    const res = await generateScenario({ ...base, fetchImpl: api.fetchImpl });
    expect(res.repaired).toBe(true);
    expect(api.calls[1].body.messages[2].content).toContain('not valid JSON');
  });

  it('gives up after a single failed repair with a clear error', async () => {
    const api = fakeApi(['nope', '{"version":1}']);
    const err = await generateScenario({ ...base, fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(TahtaError);
    expect(err.code).toBe('invalid');
    expect(err.details.length).toBeGreaterThan(0);
    expect(api.calls).toHaveLength(2);
  });

  it('maps HTTP errors and never leaks the key', async () => {
    const api = fakeApi([{ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }]);
    const err = await generateScenario({ ...base, fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(TahtaError);
    expect(err.code).toBe('http');
    expect(err.status).toBe(401);
    expect(err.details).toEqual(['invalid x-api-key']);
    expect(`${err.message} ${err.details.join(' ')} ${err.stack}`).not.toContain(SECRET);
  });

  it('maps network failures without exposing the underlying error', async () => {
    const api = fakeApi([new TypeError(`Failed to fetch with ${SECRET}`)]);
    const err = await generateScenario({ ...base, fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(err.code).toBe('network');
    expect(err.message).not.toContain(SECRET);
  });

  it('reports empty replies', async () => {
    const api = fakeApi([{ status: 200, body: { content: [] } }]);
    const err = await generateScenario({ ...base, fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(err.code).toBe('empty');
  });

  it('refuses to call the API without a key or a question', async () => {
    const api = fakeApi([]);
    const noKey = await generateScenario({ ...base, apiKey: ' ', fetchImpl: api.fetchImpl }).catch((e) => e);
    const noQ = await generateScenario({ ...base, question: '  ', fetchImpl: api.fetchImpl }).catch((e) => e);
    expect(noKey.code).toBe('no-key');
    expect(noQ.code).toBe('no-question');
    expect(api.calls).toHaveLength(0);
  });
});

describe('prompts', () => {
  it('system prompt pins language, canvas, regions and honesty', () => {
    const tr = buildSystemPrompt('tr');
    expect(tr).toContain('Turkish');
    expect(tr).toContain('"lang": "tr"');
    expect(tr).toContain('1600 wide, 900 high');
    expect(tr).toContain('Do not invent facts');
    expect(tr).toContain('misconception');
    for (const type of ['text', 'line', 'arrow', 'circle', 'ellipse', 'rect', 'polyline', 'curve', 'arc', 'path']) {
      expect(tr).toContain(`"type":"${type}"`);
    }
    expect(buildSystemPrompt('en')).toContain('English');
  });

  it('the example embedded in the system prompt is itself valid', async () => {
    const prompt = buildSystemPrompt('en');
    const example = prompt.slice(prompt.lastIndexOf('{"version":1'));
    const { validateScenario } = await import('../src/schema');
    const r = validateScenario(JSON.parse(example));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it('repair prompt lists errors and caps the list', () => {
    const p = buildRepairPrompt(Array.from({ length: 40 }, (_, i) => `err ${i}`));
    expect(p).toContain('- err 0');
    expect(p).toContain('- err 24');
    expect(p).not.toContain('- err 25');
    expect(p).toContain('+15 more');
  });
});
