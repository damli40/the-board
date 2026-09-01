import { describe, it, expect } from 'vitest';
import { toRequest, toProxyPlan } from './openai';
import { TOOLS } from '../../../record/src/webmcp/tools';

describe('openai.toRequest', () => {
  const panelTools = [
    { name: 'open_exhibit', description: 'Read an exhibit.' },
    { name: 'extract_text', description: 'The page extracts text from a PDF page.' },
  ];
  const panelMessages = [
    { role: 'user' as const, content: 'open E1 then extract page 4' },
    { role: 'tool' as const, content: 'open_exhibit -> {"id":"E1"}' },
    { role: 'tool' as const, content: 'extract_text -> "Page 4 of the delivery log."' },
  ];

  it('posts to /v1/chat/completions', () => {
    const { path } = toRequest({ messages: panelMessages }, { model: 'gpt-5' });
    expect(path).toBe('/v1/chat/completions');
  });

  it('round-trips a two-tool, three-message request: system leads, tools translate, model/max_tokens carry', () => {
    const { body } = toRequest(
      { system: 'system instruction', messages: panelMessages, tools: panelTools },
      { model: 'gpt-5', maxTokens: 4096 }
    ) as { body: Record<string, unknown> };

    expect(body.model).toBe('gpt-5');
    expect(body.max_tokens).toBe(4096);

    const messages = body.messages as { role: string; content: string }[];
    // system becomes a LEADING {role:'system', content} message.
    expect(messages[0]).toEqual({ role: 'system', content: 'system instruction' });
    // The remaining messages are the same collapse anthropic.ts's
    // toApiMessages already does — the three panel turns join into one user
    // turn, since tool turns become user text and there is no assistant turn
    // to alternate against.
    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('open E1 then extract page 4');
    expect(messages[1].content).toContain('open_exhibit -> {"id":"E1"}');

    const tools = body.tools as { type: string; function: { name: string; description: string; parameters: unknown } }[];
    expect(tools).toHaveLength(2);
    expect(tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'open_exhibit',
        description: 'Read an exhibit.',
        parameters: TOOLS.find((t) => t.name === 'open_exhibit')!.inputSchema,
      },
    });
  });

  it('omits tools entirely when the panel holds no grant, rather than sending an empty list', () => {
    const { body } = toRequest({ messages: panelMessages, tools: [] }, { model: 'gpt-5' }) as { body: Record<string, unknown> };
    expect(body.tools).toBeUndefined();
  });

  it('omits the leading system message when the panel sent no system instruction', () => {
    const { body } = toRequest({ messages: panelMessages }, { model: 'gpt-5' }) as { body: Record<string, unknown> };
    const messages = body.messages as { role: string }[];
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
  });

  it('sends max_tokens by default, when the provider entry sets no maxTokensParam', () => {
    const { body } = toRequest({ messages: panelMessages }, { model: 'llama3', maxTokens: 512 }) as { body: Record<string, unknown> };
    expect(body.max_tokens).toBe(512);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('sends max_completion_tokens when maxTokensParam says so (I8, fix round 1)', () => {
    // gpt-5 (the openai provider's own default model) rejects `max_tokens`
    // outright — see providers.ts's ProviderDef.maxTokensParam.
    const { body } = toRequest(
      { messages: panelMessages },
      { model: 'gpt-5', maxTokens: 512, maxTokensParam: 'max_completion_tokens' }
    ) as { body: Record<string, unknown> };
    expect(body.max_completion_tokens).toBe(512);
    expect(body.max_tokens).toBeUndefined();
  });
});

describe('openai.toProxyPlan', () => {
  it('turns choices[0].message.tool_calls into calls, parsing the arguments JSON string', () => {
    const raw = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'open_exhibit', arguments: '{"exhibitId":"E1"}' } },
            ],
          },
        },
      ],
    };
    expect(toProxyPlan(raw)).toEqual({
      calls: [{ name: 'open_exhibit', arguments: { exhibitId: 'E1' } }],
    });
  });

  it('carries a final text answer with no tool calls', () => {
    const raw = {
      choices: [{ finish_reason: 'stop', message: { content: 'Exhibit E1 is filed.', tool_calls: [] } }],
    };
    const plan = toProxyPlan(raw);
    expect(plan.message).toBe('Exhibit E1 is filed.');
    expect(plan.calls).toBeUndefined();
  });

  it('discards a malformed arguments string instead of throwing', () => {
    const raw = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{ function: { name: 'open_exhibit', arguments: '{not valid json' } }],
          },
        },
      ],
    };
    expect(() => toProxyPlan(raw)).not.toThrow();
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('open_exhibit');
    expect(plan.message).toContain('did not parse');
  });

  it('names EVERY discarded call, including the VALID ones swept away alongside the malformed ones (I5, fix round 2)', () => {
    const raw = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [
              { function: { name: 'open_exhibit', arguments: '{"exhibitId":"E1"}' } },
              { function: { name: 'extract_text', arguments: '{not valid' } },
              { function: { name: 'search_exhibits', arguments: '{also not valid' } },
            ],
          },
        },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    // Fix round 2, item 1 (round-1 half-fix): extract_text and
    // search_exhibits are the malformed ones, but open_exhibit parsed FINE
    // and is STILL discarded — the whole response drops together. A message
    // naming only the malformed two let the operator read "extract_text,
    // search_exhibits were discarded" and reasonably conclude open_exhibit
    // ran. It did not. All three must be named.
    expect(plan.message).toContain('open_exhibit');
    expect(plan.message).toContain('extract_text');
    expect(plan.message).toContain('search_exhibits');
    expect(plan.message).toContain('were discarded');
    // The malformed ones are still called out specifically, so the operator
    // knows WHICH ones actually failed to parse.
    expect(plan.message).toContain('did not parse');
  });

  it('drops a nameless tool call rather than inventing "unknown tool" (M4, fix round 1)', () => {
    const raw = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [
              { function: { arguments: '{}' } }, // no name at all
              { function: { name: 'open_exhibit', arguments: '{"exhibitId":"E1"}' } },
            ],
          },
        },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toEqual([{ name: 'open_exhibit', arguments: { exhibitId: 'E1' } }]);
    expect(JSON.stringify(plan)).not.toContain('unknown tool');
  });

  it('pushes {arguments: {}} rather than {arguments: undefined} for a call with no arguments string (M3, fix round 1)', () => {
    const raw = {
      choices: [
        { finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'confirm' } }] } },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toEqual([{ name: 'confirm', arguments: {} }]);
  });

  it('reports finish_reason "length" truncation even when the cut-off arguments are unparseable JSON (I6, fix round 1)', () => {
    // This is the realistic OpenAI truncation case: the output cap hits
    // mid-write, so the arguments string is half-written JSON. Checking
    // parse-validity before finish_reason used to report "did not parse"
    // here, hiding that the model simply ran out of tokens.
    const raw = {
      choices: [
        {
          finish_reason: 'length',
          message: { tool_calls: [{ function: { name: 'record_assessment', arguments: '{"factId":"F1"' } }] },
        },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('cut off');
    expect(plan.message).toContain('record_assessment');
    expect(plan.message).not.toContain('did not parse');
  });

  it('maps finish_reason "content_filter" to MODEL DECLINED, never as a boundary refusal (M5, fix round 1)', () => {
    const raw = { choices: [{ finish_reason: 'content_filter', message: {} }] };
    const plan = toProxyPlan(raw);
    expect(plan.message).toContain('MODEL DECLINED');
    expect(plan.message).toContain('content_filter');
    expect(plan.message).not.toMatch(/^REFUSED:/);
    expect(plan.calls).toBeUndefined();
  });

  it('maps finish_reason "length" with a syntactically valid but truncated call to a cut-off message', () => {
    const raw = {
      choices: [
        {
          finish_reason: 'length',
          message: {
            tool_calls: [{ function: { name: 'record_assessment', arguments: '{}' } }],
          },
        },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('cut off');
    expect(plan.message).toContain('record_assessment');
  });

  it('never returns a plan with neither message nor calls', () => {
    const raw = { choices: [{ finish_reason: 'stop', message: { content: '', tool_calls: [] } }] };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toBeTruthy();
    expect(plan.message).toContain('no text and no tool call');
  });

  it('handles a response with no choices without throwing', () => {
    expect(() => toProxyPlan({ choices: [] })).not.toThrow();
    expect(toProxyPlan({ choices: [] }).message).toContain('no choice');
    expect(() => toProxyPlan({})).not.toThrow();
  });
});
