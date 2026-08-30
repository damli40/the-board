import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  parsePanelRequest,
  schemaFor,
  schemaIsUnknown,
  toApiMessages,
  toMessagesRequest,
  toProxyPlan,
} from './anthropic';
import { TOOLS } from '../../../record/src/webmcp/tools';

// ---------------------------------------------------------------------------
// Recorded provider responses.
//
// WHY THESE EXIST (final review, Blocker 1): every existing test of the agent
// loop stubs `fetch` to return the `{ calls }` shape the loop wants, so the
// loop's own tests can never catch a provider that answers something else.
// they hand back the answer. These fixtures are the other side of that seam:
// real Anthropic Messages API response objects, typed as `Anthropic.Message`
// so the SDK's own type definitions are what validates their shape. If the
// response shape this adapter reads ever stops matching the shape the SDK
// declares, `tsc --noEmit` fails on this file rather than the demo failing on
// camera.
//
// PROVENANCE, stated plainly: these were written to the documented Messages
// API response shape and are type-checked against the installed
// `@anthropic-ai/sdk`. They are NOT captures of a live call: a live call
// from this machine returns 400 "credit balance is too low", so a real
// round trip could not be recorded. See the fix report for exactly what that
// leaves unverified.
// ---------------------------------------------------------------------------

/** Every recorded response shares this envelope; only content/stop differ. */
function recorded(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_01RecordedFixtureForTheBoard',
    type: 'message',
    container: null,
    role: 'assistant',
    model: 'claude-opus-5',
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 1462,
      output_tokens: 87,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard',
    },
    ...overrides,
  };
}

/** A turn where the model chose a tool: the shape the whole demo depends on. */
const TOOL_USE_RESPONSE = recorded({
  content: [
    { type: 'text', text: "I'll open the delivery log first.", citations: null },
    {
      type: 'tool_use',
      caller: { type: 'direct' },
      id: 'toolu_01RecordedOpenExhibit',
      name: 'open_exhibit',
      input: { exhibitId: 'E1' },
    },
  ],
  stop_reason: 'tool_use',
});

/** Two calls in one turn. Parallel tool use is on by default. */
const PARALLEL_TOOL_USE_RESPONSE = recorded({
  content: [
    {
      type: 'tool_use',
      caller: { type: 'direct' },
      id: 'toolu_01RecordedOpenE4',
      name: 'open_exhibit',
      input: { exhibitId: 'E4' },
    },
    {
      type: 'tool_use',
      caller: { type: 'direct' },
      id: 'toolu_01RecordedExtract',
      name: 'extract_text',
      input: { exhibitId: 'E1', page: 4 },
    },
  ],
  stop_reason: 'tool_use',
});

/** A final answer with nothing left to call. */
const FINAL_TEXT_RESPONSE = recorded({
  content: [{ type: 'text', text: 'Exhibit E1 is filed and its page 4 says delivery completed on day four.', citations: null }],
  stop_reason: 'end_turn',
});

/** Thinking is on by default on Claude Opus 5; the block must be ignored, not read as an answer. */
const THINKING_THEN_TOOL_RESPONSE = recorded({
  content: [
    { type: 'thinking', thinking: '', signature: 'recorded-signature' },
    {
      type: 'tool_use',
      caller: { type: 'direct' },
      id: 'toolu_01RecordedAfterThinking',
      name: 'search_exhibits',
      input: { query: 'notice' },
    },
  ],
  stop_reason: 'tool_use',
});

/** HTTP 200, but the model declined. Does not throw, so it has to be read. */
const REFUSAL_RESPONSE = recorded({
  content: [],
  stop_reason: 'refusal',
  stop_details: { type: 'refusal', category: 'general_harms', explanation: 'declined by a safety classifier' },
});

/** The output cap hit while the model was still writing a tool call's arguments. */
const TRUNCATED_TOOL_USE_RESPONSE = recorded({
  content: [
    {
      type: 'tool_use',
      caller: { type: 'direct' },
      id: 'toolu_01RecordedTruncated',
      name: 'record_assessment',
      // Cut off mid-write: `quote`, `finding` and `because` never arrived.
      input: { factId: 'F1', exhibitId: 'E1' },
    },
  ],
  stop_reason: 'max_tokens',
});

/** The exact shape that used to break the loop at step zero: nothing usable. */
const EMPTY_RESPONSE = recorded({ content: [], stop_reason: 'end_turn' });

describe('response translation: recorded provider response -> ProxyPlan', () => {
  it('turns a recorded tool_use response into the calls the loop executes', () => {
    expect(toProxyPlan(TOOL_USE_RESPONSE)).toEqual({
      message: "I'll open the delivery log first.",
      calls: [{ name: 'open_exhibit', arguments: { exhibitId: 'E1' } }],
    });
  });

  it('carries every call from a parallel-tool-use turn, not just the first', () => {
    expect(toProxyPlan(PARALLEL_TOOL_USE_RESPONSE).calls).toEqual([
      { name: 'open_exhibit', arguments: { exhibitId: 'E4' } },
      { name: 'extract_text', arguments: { exhibitId: 'E1', page: 4 } },
    ]);
  });

  it('turns a recorded end_turn response into the final message, with no calls', () => {
    const plan = toProxyPlan(FINAL_TEXT_RESPONSE);
    expect(plan.message).toBe('Exhibit E1 is filed and its page 4 says delivery completed on day four.');
    expect(plan.calls).toBeUndefined();
  });

  it('ignores a thinking block rather than reading it as an answer', () => {
    const plan = toProxyPlan(THINKING_THEN_TOOL_RESPONSE);
    expect(plan.message).toBeUndefined();
    expect(plan.calls).toEqual([{ name: 'search_exhibits', arguments: { query: 'notice' } }]);
  });

  it("names a model refusal as the model's, never with this project's REFUSED: prefix", () => {
    const plan = toProxyPlan(REFUSAL_RESPONSE);
    // The panel renders a leading `REFUSED:` in the loud treatment reserved
    // for the boundary refusing. A model declining is a different event and
    // must not be filmed as if the browser had enforced something.
    expect(plan.message).not.toMatch(/^REFUSED:/);
    expect(plan.message).toContain('MODEL DECLINED');
    expect(plan.message).toContain('general_harms');
    expect(plan.calls).toBeUndefined();
  });

  it('discards a tool call truncated by the output cap instead of running it with half its arguments', () => {
    const plan = toProxyPlan(TRUNCATED_TOOL_USE_RESPONSE);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toContain('cut off');
    expect(plan.message).toContain('record_assessment');
  });

  it('never returns a plan with neither a message nor calls, the shape that made the panel hang', () => {
    const plan = toProxyPlan(EMPTY_RESPONSE);
    expect(plan.calls).toBeUndefined();
    expect(plan.message).toBeTruthy();
    expect(plan.message).toContain('no text and no tool call');
  });
});

/**
 * `MessageCreateParams.tools` is a union that also covers Anthropic's own
 * server tools, which carry no `name`. This adapter only ever emits custom
 * tools, so narrowing here keeps the assertions readable.
 */
function customTools(request: Anthropic.MessageCreateParamsNonStreaming): Anthropic.Tool[] {
  return (request.tools ?? []) as Anthropic.Tool[];
}

describe('request translation: panel request -> Messages API request', () => {
  const panelTools = [
    { name: 'open_exhibit', description: 'Read an exhibit.' },
    { name: 'extract_text', description: 'The page extracts text from a PDF page.' },
  ];

  it('sends real input schemas, so the model is never left to guess an argument', () => {
    const request = toMessagesRequest({
      system: 'system instruction',
      messages: [{ role: 'user', content: 'open E1' }],
      tools: panelTools,
    });

    const openExhibit = customTools(request).find((t) => t.name === 'open_exhibit')!;
    expect(openExhibit.input_schema).toEqual(
      TOOLS.find((t) => t.name === 'open_exhibit')!.inputSchema
    );
    // The specific property that matters: without it the model invents an id.
    expect((openExhibit.input_schema as { required?: string[] }).required).toEqual(['exhibitId']);
    expect((openExhibit.input_schema as { properties?: Record<string, unknown> }).properties).toHaveProperty('exhibitId');
  });

  it('carries the panel system instruction through unchanged', () => {
    const request = toMessagesRequest({
      system: 'system instruction',
      messages: [{ role: 'user', content: 'go' }],
    });
    expect(request.system).toBe('system instruction');
  });

  it('defaults to Claude Opus 5 and a bounded output, and honours a model override', () => {
    const base = toMessagesRequest({ messages: [{ role: 'user', content: 'go' }] });
    expect(base.model).toBe(DEFAULT_MODEL);
    expect(base.max_tokens).toBe(DEFAULT_MAX_TOKENS);

    const overridden = toMessagesRequest({ messages: [{ role: 'user', content: 'go' }] }, { model: 'claude-sonnet-5' });
    expect(overridden.model).toBe('claude-sonnet-5');
  });

  it('omits tools entirely when the panel holds no grant, rather than sending an empty list', () => {
    const request = toMessagesRequest({ messages: [{ role: 'user', content: 'go' }], tools: [] });
    expect(request.tools).toBeUndefined();
  });

  it('shows an unrecognised tool with an empty schema rather than dropping it from the request', () => {
    // Dropping it would make the model unable to call a tool it genuinely
    // holds, and the panel would print `NOT GRANTED:` for a granted tool,
    // the one lie this project must never tell.
    const request = toMessagesRequest({
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ name: 'not_in_the_catalogue', description: 'unknown' }],
    });
    expect(customTools(request).map((t) => t.name)).toContain('not_in_the_catalogue');
    expect(schemaIsUnknown('not_in_the_catalogue')).toBe(true);
    expect(schemaIsUnknown('open_exhibit')).toBe(false);
    expect(schemaFor('not_in_the_catalogue')).toEqual({ type: 'object', properties: {} });
  });

  it('every tool name declared twice in the catalogue declares the same schema', () => {
    // `open_exhibit` (filing + boardRead) and `spend_appeal` (A + B) each
    // appear twice. The by-name schema map is only unambiguous while their
    // schemas match; this fails the moment one of them diverges, instead of
    // silently showing the model whichever copy was declared last.
    const byName = new Map<string, unknown>();
    for (const tool of TOOLS) {
      if (byName.has(tool.name)) {
        expect(tool.inputSchema, `${tool.name} declares two different schemas`).toEqual(byName.get(tool.name));
      }
      byName.set(tool.name, tool.inputSchema);
    }
    // Guard against this test quietly becoming vacuous.
    expect(TOOLS.length).toBeGreaterThan(new Set(TOOLS.map((t) => t.name)).size);
  });
});

describe('message translation: the panel has a tool role, the Messages API does not', () => {
  it("maps the loop's tool results onto user turns and keeps roles alternating", () => {
    const messages = toApiMessages([
      { role: 'user', content: 'open E1 then extract page 4' },
      { role: 'tool', content: 'open_exhibit -> {"id":"E1"}' },
      { role: 'tool', content: 'extract_text -> "Page 4 of the delivery log."' },
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: 'open E1 then extract page 4\nopen_exhibit -> {"id":"E1"}\nextract_text -> "Page 4 of the delivery log."',
      },
    ]);
    // The API rejects two turns of the same role in a row.
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].role).not.toBe(messages[i - 1].role);
    }
  });

  it('keeps a refusal line in the transcript, because the model has to see what was refused', () => {
    const messages = toApiMessages([
      { role: 'user', content: 'cite F9' },
      { role: 'tool', content: 'REFUSED: seat1 never assessed F9' },
    ]);
    expect(messages[0].content).toContain('REFUSED: seat1 never assessed F9');
  });

  it('preserves an assistant turn as its own alternating turn', () => {
    const messages = toApiMessages([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'opening E1' },
      { role: 'tool', content: 'open_exhibit -> {"id":"E1"}' },
    ]);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('drops an empty turn rather than sending a text block the API rejects', () => {
    const messages = toApiMessages([
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'again' },
    ]);
    expect(messages).toEqual([{ role: 'user', content: 'go\nagain' }]);
  });

  it('refuses to build a request with nothing to say, instead of sending an empty conversation', () => {
    expect(() => toApiMessages([])).toThrow(/no usable messages/);
    expect(() => toMessagesRequest({ messages: [] })).toThrow(/no usable messages/);
  });
});

describe('request parsing', () => {
  it('reads the body the panel actually sends', () => {
    const body = JSON.stringify({ system: 's', messages: [{ role: 'user', content: 'g' }], tools: [] });
    expect(parsePanelRequest(body)).toEqual({ system: 's', messages: [{ role: 'user', content: 'g' }], tools: [] });
  });

  it('treats a missing body as an empty request rather than throwing on null', () => {
    expect(parsePanelRequest(null)).toEqual({});
  });

  it('says what is wrong with a malformed body instead of throwing a bare SyntaxError', () => {
    expect(() => parsePanelRequest('not json')).toThrow(/not valid JSON/);
    expect(() => parsePanelRequest('[1,2,3]')).toThrow(/must be a JSON object/);
  });
});
