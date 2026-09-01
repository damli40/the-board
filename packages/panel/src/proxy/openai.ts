// The OpenAI chat-completions wire adapter (task 1, §1b). This is also what
// backs every `openai-compatible` deployment (OpenRouter, Groq, Together,
// Fireworks, DeepSeek, a local vLLM/Ollama/LM Studio server — see
// providers.ts): the endpoint and model differ per deployment, the request
// and response shape below does not.
//
// Mirrors the pair anthropic.ts exports (a request builder, a response
// parser) but under the uniform `toRequest`/`toProxyPlan` names handler.ts
// dispatches on — see anthropic.ts's own `toRequest`/`toProxyPlanRaw` for
// why THAT file can't use these exact names.
import { toApiMessages, schemaFor, truncationMessage, modelDeclinedMessage, type PanelRequest, type ProxyPlan } from './anthropic';
import type { WireOptions } from './providers';

interface OpenAiToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChoice {
  finish_reason?: string;
  message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
}

export function toRequest(request: PanelRequest, opts: WireOptions): { path: string; body: unknown } {
  // `toApiMessages` already does the collapse this project settled on for a
  // stateless proxy with no tool_use/tool_result pairing: a `tool` turn
  // becomes plain user text, same-role turns join, an empty turn drops (see
  // anthropic.ts's comment on `toApiMessages` for the full reasoning). It is
  // provider-agnostic — no provider here gets tool_use/tool_result pairs
  // reconstructed from this stateless request shape — so it is reused rather
  // than re-derived for OpenAI's wire format.
  const messages = toApiMessages(request.messages ?? []);
  // Fix round 1, I8: the request field name for the output cap is NOT fixed
  // across every `openai`-wire deployment. `providers.ts`'s registry says
  // which one this deployment needs — see `ProviderDef.maxTokensParam` for
  // why: OpenAI's current model family (gpt-5, the `openai` provider's own
  // default) rejects `max_tokens` outright.
  const maxTokensField = opts.maxTokensParam ?? 'max_tokens';
  const body: Record<string, unknown> = {
    model: opts.model,
    [maxTokensField]: opts.maxTokens,
    messages: request.system
      ? [{ role: 'system', content: request.system }, ...messages]
      : messages,
  };

  const tools = (request.tools ?? []).map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: schemaFor(t.name) },
  }));
  // Same reasoning as anthropic.ts's `toMessagesRequest`: an empty `tools`
  // array is not the same request as no tools at all, and this adapter is
  // reached with zero tools whenever a panel holds no grant in the current
  // phase.
  if (tools.length > 0) body.tools = tools;

  return { path: '/v1/chat/completions', body };
}

export function toProxyPlan(raw: unknown): ProxyPlan {
  const response = raw as OpenAiResponse;
  const choice = response.choices?.[0];
  if (!choice) {
    return { message: 'the model returned no choice' };
  }

  // A content-filter refusal is HTTP 200, the same situation as Anthropic's
  // `stop_reason: 'refusal'` — a model declining, not the boundary refusing
  // (M5, fix round 1). Checked before anything else here: a filtered
  // response's tool_calls (if any) are not a real plan.
  if (choice.finish_reason === 'content_filter') {
    return { message: modelDeclinedMessage('content_filter') };
  }

  const toolCalls = choice.message?.tool_calls ?? [];
  const callNames = toolCalls.map((c) => c.function?.name).filter((n): n is string => Boolean(n));

  // `finish_reason: 'length'` is OpenAI's truncation signal, the same
  // situation as Anthropic's `stop_reason: 'max_tokens'`. Checked BEFORE
  // parsing any call's arguments (I6, fix round 1): truncation at the
  // output cap is precisely what produces half-written JSON, so checking
  // parse-validity first made the realistic OpenAI truncation report
  // "arguments did not parse" instead of naming what actually happened.
  if (choice.finish_reason === 'length') {
    return { message: truncationMessage(callNames) };
  }

  const calls: { name: string; arguments?: Record<string, unknown> }[] = [];
  const malformedNames: string[] = [];

  for (const call of toolCalls) {
    const name = call.function?.name;
    // A nameless call is dropped, not invented a name (M4, fix round 1) —
    // anthropic.ts and google.ts both require a real name before pushing a
    // call; this adapter used to call it `'unknown tool'`, a call the
    // browser would then try to resolve and refuse under a name the model
    // never actually said.
    if (!name) continue;
    const rawArgs = call.function?.arguments;
    let args: Record<string, unknown> | undefined;
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        // A malformed arguments string must not throw. Collect every
        // malformed name rather than stopping at the first (I5, fix round
        // 1): dropping all the calls in this response is the safe choice,
        // but a message naming only one of three discarded calls states
        // something other than the truth.
        malformedNames.push(name);
        continue;
      }
    }
    // `?? {}`, matching anthropic.ts and google.ts (M3, fix round 1): a
    // tool call with no arguments string still gets an empty object, never
    // `undefined`.
    calls.push({ name, arguments: args ?? {} });
  }

  if (malformedNames.length > 0) {
    // Fix round 2, item 1: this used to name only the MALFORMED calls, but
    // a malformed call discards the WHOLE response — the valid calls
    // collected in `calls` above never run either. Naming only the
    // malformed ones let the operator read "extract_text, search_exhibits
    // were discarded" and reasonably (wrongly) conclude open_exhibit ran.
    // `callNames` (computed above, before this loop) already holds every
    // named call in the model's own order, discarded or not — reuse it
    // rather than reconstructing the union from `calls` + `malformedNames`,
    // which would also silently reorder them.
    const allPlural = callNames.length > 1;
    return {
      message:
        `tool call${allPlural ? 's' : ''} to ${callNames.join(', ')} ${allPlural ? 'were' : 'was'} discarded — ` +
        `${malformedNames.join(', ')} had arguments that did not parse as JSON`,
    };
  }

  const plan: ProxyPlan = {};
  const text = choice.message?.content?.trim();
  if (text) plan.message = text;
  if (calls.length > 0) plan.calls = calls;

  // Never hand back an object with neither field — the shape that made the
  // loop break at step zero and the panel render nothing forever.
  if (!plan.message && !plan.calls) {
    return {
      message: `the model returned no text and no tool call (finish_reason: ${choice.finish_reason ?? 'unknown'})`,
    };
  }

  return plan;
}
