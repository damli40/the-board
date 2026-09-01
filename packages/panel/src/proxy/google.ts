// The Gemini (generateContent) wire adapter (task 1, §1b). Mirrors the pair
// anthropic.ts exports, under the uniform `toRequest`/`toProxyPlan` names
// handler.ts dispatches on — see anthropic.ts's own `toRequest`/
// `toProxyPlanRaw` for why that file can't use these exact names.
import { toApiMessages, schemaFor, truncationMessage, modelDeclinedMessage, type PanelRequest, type ProxyPlan } from './anthropic';
import type { WireOptions } from './providers';

interface GeminiFunctionCall {
  name?: string;
  args?: unknown;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Gemini rejects a JSON Schema carrying `additionalProperties` — strip it
 * recursively before sending. Recursive because the record's tool schemas
 * nest an object under `locator` (webmcp/tools.ts), and the key can appear
 * at any depth, not just the schema's top level.
 */
export function stripAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripAdditionalProperties);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === 'additionalProperties') continue;
      out[key] = stripAdditionalProperties(value);
    }
    return out;
  }
  return schema;
}

export function toRequest(request: PanelRequest, opts: WireOptions): { path: string; body: unknown } {
  const messages = toApiMessages(request.messages ?? []);
  const contents = messages.map((m) => ({
    // Gemini's assistant role is `model`, not `assistant` — the single most
    // common porting bug (task 1 brief, §1b). `toApiMessages` only ever
    // emits `'user' | 'assistant'`, so this is the one place that
    // translation happens for this wire format.
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined,
  };

  if (request.system) {
    body.systemInstruction = { parts: [{ text: request.system }] };
  }

  const functionDeclarations = (request.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: stripAdditionalProperties(schemaFor(t.name)),
  }));
  if (functionDeclarations.length > 0) {
    body.tools = [{ functionDeclarations }];
  }

  return { path: `/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`, body };
}

export function toProxyPlan(raw: unknown): ProxyPlan {
  const response = raw as GeminiResponse;
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return { message: 'the model returned no candidate' };
  }

  // A safety refusal is HTTP 200, the same situation as Anthropic's
  // `stop_reason: 'refusal'` — a model declining, not the boundary refusing
  // (M5, fix round 1). Gemini uses two distinct finishReason values for it.
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    return { message: modelDeclinedMessage(candidate.finishReason) };
  }

  const texts: string[] = [];
  const calls: { name: string; arguments?: Record<string, unknown> }[] = [];

  for (const part of candidate.content?.parts ?? []) {
    if (typeof part.text === 'string' && part.text) texts.push(part.text);
    // Gemini's function-call arguments arrive already as an object (`args`),
    // never a JSON string to parse — unlike OpenAI's `function.arguments`.
    if (part.functionCall?.name) {
      calls.push({
        name: part.functionCall.name,
        arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
      });
    }
  }

  // `finishReason: 'MAX_TOKENS'` is Gemini's truncation signal — the same
  // situation as Anthropic's `max_tokens` and OpenAI's `length`. Dropped and
  // reported, never executed with silently incomplete arguments.
  if (candidate.finishReason === 'MAX_TOKENS') {
    return { message: truncationMessage(calls.map((c) => c.name)) };
  }

  const plan: ProxyPlan = {};
  const text = texts.join('\n').trim();
  if (text) plan.message = text;
  if (calls.length > 0) plan.calls = calls;

  if (!plan.message && !plan.calls) {
    return {
      message: `the model returned no text and no tool call (finishReason: ${candidate.finishReason ?? 'unknown'})`,
    };
  }

  return plan;
}
