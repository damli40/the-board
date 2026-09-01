import { describe, it, expect, vi } from 'vitest';
import { toRequest, toProxyPlan, stripAdditionalProperties } from './google';
import * as anthropicModule from './anthropic';

describe('google.toRequest', () => {
  const panelTools = [
    { name: 'open_exhibit', description: 'Read an exhibit.' },
    { name: 'extract_text', description: 'The page extracts text from a PDF page.' },
  ];
  const panelMessages = [
    { role: 'user' as const, content: 'open E1 then extract page 4' },
    { role: 'assistant' as const, content: 'opening E1' },
    { role: 'tool' as const, content: 'open_exhibit -> {"id":"E1"}' },
  ];

  it('posts to /v1beta/models/{model}:generateContent, url-encoding the model id', () => {
    const { path } = toRequest({ messages: panelMessages }, { model: 'gemini-3-pro' });
    expect(path).toBe('/v1beta/models/gemini-3-pro:generateContent');
  });

  it('round-trips a two-tool, three-message request', () => {
    const { body } = toRequest(
      { system: 'system instruction', messages: panelMessages, tools: panelTools },
      { model: 'gemini-3-pro', maxTokens: 4096 }
    ) as { body: Record<string, unknown> };

    expect(body.systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    expect((body.generationConfig as { maxOutputTokens: number }).maxOutputTokens).toBe(4096);

    const contents = body.contents as { role: string; parts: { text: string }[] }[];
    // Gemini's assistant role is `model`, not `assistant` — the single most
    // common porting bug (task 1 brief). Pinned directly, not just via a
    // round trip that could pass by accident if both sides used the wrong
    // value. (user, assistant, tool -> user, model, user: the tool turn
    // collapses to plain user text, same as every other wire adapter.)
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[1].parts[0].text).toBe('opening E1');

    const declarations = (body.tools as { functionDeclarations: { name: string; description: string; parameters: unknown }[] }[])[0]
      .functionDeclarations;
    expect(declarations).toHaveLength(2);
    expect(declarations[0].name).toBe('open_exhibit');
    expect(declarations[0].description).toBe('Read an exhibit.');
  });

  it('omits tools entirely when the panel holds no grant', () => {
    const { body } = toRequest({ messages: panelMessages, tools: [] }, { model: 'gemini-3-pro' }) as { body: Record<string, unknown> };
    expect(body.tools).toBeUndefined();
  });

  it('omits systemInstruction when the panel sent no system prompt', () => {
    const { body } = toRequest({ messages: panelMessages }, { model: 'gemini-3-pro' }) as { body: Record<string, unknown> };
    expect(body.systemInstruction).toBeUndefined();
  });

  it('pipes every tool schema through stripAdditionalProperties before sending, verified WIRING not coincidence (M1, fix round 1)', () => {
    // None of this catalogue's real schemas happen to declare
    // `additionalProperties` today (webmcp/tools.ts's `obj()` helper never
    // sets it), so a test that just compares toRequest's output against
    // `stripAdditionalProperties(schemaFor(name))` passes whether or not
    // toRequest actually strips anything — it reduces to `toEqual(schemaFor(...))`
    // either way. Push a SYNTHETIC schema carrying nested `additionalProperties`
    // through the real pipeline (via a spy on schemaFor, the only seam
    // toRequest reads a schema through) and assert it is gone at every depth.
    const nested = {
      type: 'object',
      additionalProperties: false,
      properties: {
        locator: {
          type: 'object',
          additionalProperties: false,
          properties: { page: { type: 'number' } },
        },
      },
    };
    const spy = vi.spyOn(anthropicModule, 'schemaFor').mockReturnValue(nested);
    try {
      const { body } = toRequest(
        { messages: panelMessages, tools: [{ name: 'synthetic_tool', description: 'exists only for this test' }] },
        { model: 'gemini-3-pro' }
      ) as { body: Record<string, unknown> };

      const declarations = (body.tools as { functionDeclarations: { name: string; parameters: unknown }[] }[])[0].functionDeclarations;
      expect(JSON.stringify(declarations[0].parameters)).not.toContain('additionalProperties');
      expect(declarations[0].parameters).toEqual({
        type: 'object',
        properties: { locator: { type: 'object', properties: { page: { type: 'number' } } } },
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('stripAdditionalProperties', () => {
  it('removes the key at every depth of a nested schema', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        locator: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'number' },
          },
        },
        tags: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, properties: {} },
        },
      },
    };
    const stripped = JSON.stringify(stripAdditionalProperties(schema));
    expect(stripped).not.toContain('additionalProperties');
    // Everything else survives the strip.
    expect(stripped).toContain('page');
    expect(stripped).toContain('tags');
  });

  it('leaves a schema with no additionalProperties untouched in shape', () => {
    const schema = { type: 'string', description: 'a plain field' };
    expect(stripAdditionalProperties(schema)).toEqual(schema);
  });

  it('passes primitives and null through unchanged', () => {
    expect(stripAdditionalProperties('x')).toBe('x');
    expect(stripAdditionalProperties(5)).toBe(5);
    expect(stripAdditionalProperties(null)).toBe(null);
  });
});

describe('google.toProxyPlan', () => {
  it('turns text parts into message and functionCall parts into calls, args already an object', () => {
    const raw = {
      candidates: [
        {
          content: {
            parts: [
              { text: "I'll open the delivery log first." },
              { functionCall: { name: 'open_exhibit', args: { exhibitId: 'E1' } } },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    };
    expect(toProxyPlan(raw)).toEqual({
      message: "I'll open the delivery log first.",
      calls: [{ name: 'open_exhibit', arguments: { exhibitId: 'E1' } }],
    });
  });

  it('maps finishReason SAFETY / PROHIBITED_CONTENT to MODEL DECLINED, never a boundary refusal (M5, fix round 1)', () => {
    for (const reason of ['SAFETY', 'PROHIBITED_CONTENT']) {
      const raw = { candidates: [{ content: { parts: [] }, finishReason: reason }] };
      const plan = toProxyPlan(raw);
      expect(plan.message, reason).toContain('MODEL DECLINED');
      expect(plan.message, reason).toContain(reason);
      expect(plan.message, reason).not.toMatch(/^REFUSED:/);
      expect(plan.calls, reason).toBeUndefined();
    }
  });

  it('maps finishReason MAX_TOKENS to a truncation message, discarding the call', () => {
    const raw = {
      candidates: [
        {
          content: { parts: [{ functionCall: { name: 'record_assessment', args: { factId: 'F1' } } }] },
          finishReason: 'MAX_TOKENS',
        },
      ],
    };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('cut off');
    expect(plan.message).toContain('record_assessment');
  });

  it('never returns a plan with neither message nor calls', () => {
    const raw = { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] };
    const plan = toProxyPlan(raw);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('no text and no tool call');
  });

  it('handles a response with no candidates without throwing', () => {
    expect(() => toProxyPlan({ candidates: [] })).not.toThrow();
    expect(toProxyPlan({ candidates: [] }).message).toContain('no candidate');
    expect(() => toProxyPlan({})).not.toThrow();
  });
});
