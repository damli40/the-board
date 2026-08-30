// The adapter that sits between the panel's agent loop and a real model
// provider. It lives here, under `src/`, rather than inside
// `netlify/functions/model-proxy.ts`, for one reason: vitest only collects
// `packages/*/src/**/*.test.ts` (see vitest.config.ts), so logic buried in
// the functions folder can never be tested. The function itself stays a thin
// shell (read the key, call the SDK, hand the translated result back) and
// every translation decision it makes is in this file, under test.
//
// WHY THIS FILE EXISTS AT ALL (final review, Blocker 1): the proxy used to
// forward the panel's request body upstream verbatim and hand the upstream
// body straight back. The panel speaks a shape of its own,
// `{ system, messages:[{role:'tool', content}], tools:[{name, description}] }`
// out and `{ message?, calls? }` back, and no provider on earth accepts the
// first or returns the second. Deployed, that fails silently rather than
// loudly: the provider answers 200 with a body carrying neither `.calls` nor
// `.message`, the loop breaks at step zero, `runAgentTurn` returns an empty
// string, and the panel renders the goal line and then nothing, forever.
//
// The panel's contract is deliberately unchanged. `loop.ts` is tested and
// reviewed; the translation belongs at the boundary, which is here.
import type Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '../../../record/src/webmcp/tools';

/** What `loop.ts`'s `askModel` sends. Mirrors its `ProxyMessage`. */
export interface PanelMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

/**
 * What `loop.ts` sends per tool: a name and a description, and no parameter
 * schema. See `schemaFor` below for how the schema is recovered.
 */
export interface PanelTool {
  name: string;
  description: string;
}

export interface PanelRequest {
  system?: string;
  messages?: PanelMessage[];
  tools?: PanelTool[];
}

/** What `loop.ts` expects back. Mirrors its `ProxyPlan` exactly. */
export interface ProxyPlan {
  message?: string;
  calls?: { name: string; arguments?: Record<string, unknown> }[];
}

/**
 * Claude Opus 5. Overridable per deployment with MODEL_ID, so a panel site
 * can be pointed at a different model without a code change.
 */
export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Bounded deliberately low. A Netlify synchronous function is killed at 10
 * seconds on the default plan, and this panel makes up to MAX_STEPS (6)
 * sequential calls during one filmed turn, so a long generation is not a
 * slow demo. It is a dead one. A tool-selection turn produces a few hundred
 * output tokens; 4096 is headroom, not a target.
 */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Effort controls how deeply the model thinks, and therefore how long the
 * turn takes. `low` for the same reason MAX_TOKENS is small: the work here
 * is "pick the right tool and fill in its arguments" against a catalogue of
 * fifteen tools with explicit schemas, not open-ended reasoning, and the
 * whole call has to finish inside Netlify's function timeout. Raise it here
 * if a take shows the model fumbling tool choice; it is one word.
 */
const EFFORT = 'low' as const;

/**
 * Name -> parameter schema, built from the same `TOOLS` catalogue the record
 * origin registers with.
 *
 * THE CHOICE (final review, Blocker 1, first sub-point): the panel sends
 * only `{name, description}`, and a model handed a tool with no parameter
 * schema does not decline to call it. It guesses the arguments. This
 * project's entire subject is that guessing is not good enough, so the
 * schema has to come from somewhere. The two options were to widen what
 * `loop.ts` sends, or to look the schema up here. This looks it up, for
 * three reasons:
 *
 *   1. `loop.ts`'s request contract is the one the review told us not to
 *      touch, and widening it would have meant re-testing the panel side.
 *   2. `getTools()` is not guaranteed to hand back the full JSON Schema in a
 *      form worth round-tripping through a JSON body and back out again;
 *      `webmcp-types@0.1.5` does not promise it. The catalogue does.
 *   3. It keeps ONE definition site. `webmcp/tools.ts` is where the schema
 *      the browser registers is declared, so the schema the model is shown
 *      and the schema the tool actually validates against cannot drift apart
 *      the same argument `ToolRegistry.manifest()` makes about grants.
 *
 * Two tool NAMES appear twice in `TOOLS` (`open_exhibit` in the filing and
 * boardRead lifetimes, `spend_appeal` for each side). Their schemas are
 * identical, so a by-name map is unambiguous, and `anthropic.test.ts`
 * asserts that identity, so a future divergence fails a test instead of
 * silently showing a model whichever copy happened to be declared last.
 */
const SCHEMA_BY_NAME: Record<string, unknown> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t.inputSchema])
);

/**
 * The schema shown for a tool the catalogue does not know about. There is no
 * legitimate path to this: every tool the panel can see was registered by the
 * record origin from `TOOLS`. It exists so an unrecognised name fails LOUDLY
 * and in the right place: the model is told the tool takes no arguments, it
 * calls it with `{}`, the real tool body rejects that, and the panel renders
 * a `REFUSED:` line naming the tool. The alternative (dropping the tool from
 * the request) would have produced a `NOT GRANTED:` line for a tool that IS
 * granted, which is the one lie this project must never tell.
 */
const UNKNOWN_TOOL_SCHEMA = { type: 'object' as const, properties: {} };

export function schemaFor(name: string): Anthropic.Tool['input_schema'] {
  const schema = SCHEMA_BY_NAME[name];
  if (!schema) return UNKNOWN_TOOL_SCHEMA;
  // `ToolSpec.inputSchema` is declared as `object` in webmcp/tools.ts, so a
  // cast is unavoidable here. Every entry in that file is built by the same
  // `obj(props, required)` helper, which produces exactly this shape.
  return schema as Anthropic.Tool['input_schema'];
}

/** True when the catalogue has no schema for this name. Callers log it. */
export function schemaIsUnknown(name: string): boolean {
  return !SCHEMA_BY_NAME[name];
}

export function parsePanelRequest(raw: string | null | undefined): PanelRequest {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('request body is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object');
  }
  return parsed as PanelRequest;
}

/**
 * Panel roles -> Messages API roles.
 *
 * The Messages API has no `tool` role, and it requires user and assistant
 * turns to alternate. `loop.ts` sends the goal as one `user` turn and then
 * appends one `tool` turn per executed call, never re-sending the model's own
 * assistant turn, so there are no `tool_use` blocks and no `tool_use_id`s to
 * pair `tool_result` blocks against, and none can be reconstructed here from
 * a stateless request.
 *
 * So a `tool` turn becomes user text, and consecutive same-role turns are
 * joined. That is LOSSY and worth naming: the model sees the results of the
 * calls made so far but not its own record of having made them. It still
 * knows which tool produced which line, because `loop.ts` formats every one
 * as `<tool name> -> <result>` (and `NOT GRANTED: <name>` / `REFUSED: <msg>`
 * for the two failure shapes), so the transcript reads as a log it can reason
 * about. The alternative, inventing assistant `tool_use` blocks the model
 * never emitted, would be fabricating model output into the record, which
 * this project cannot do.
 */
export function toApiMessages(messages: PanelMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    // The API rejects an empty text block outright, so an empty turn is
    // dropped rather than sent and turned into a 400 mid-demo.
    if (!content) continue;
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role && typeof last.content === 'string') {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role, content });
    }
  }

  // A conversation must open on a user turn. `loop.ts` always starts with
  // the goal, so this only fires if something upstream changed.
  while (out.length > 0 && out[0].role === 'assistant') out.shift();
  if (out.length === 0) throw new Error('request carried no usable messages');

  return out;
}

export function toApiTools(tools: PanelTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: schemaFor(t.name),
  }));
}

export interface AdapterOptions {
  model?: string;
  maxTokens?: number;
}

/** The panel's request, translated into a real Messages API call. */
export function toMessagesRequest(
  request: PanelRequest,
  options: AdapterOptions = {}
): Anthropic.MessageCreateParamsNonStreaming {
  const messages = toApiMessages(request.messages ?? []);
  const tools = toApiTools(request.tools ?? []);

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    output_config: { effort: EFFORT },
    messages,
  };

  if (request.system) params.system = request.system;
  // An empty `tools` array is not the same request as no tools at all, and
  // `runAgentTurn` genuinely reaches here with zero tools when a panel holds
  // no grant in the current phase.
  if (tools.length > 0) params.tools = tools;

  return params;
}

/**
 * A Messages API response, translated back into the `ProxyPlan` shape
 * `loop.ts` already expects. Every branch below is pinned by a recorded
 * response in `anthropic.test.ts`.
 */
export function toProxyPlan(response: Anthropic.Message): ProxyPlan {
  // A safety refusal is HTTP 200 with `stop_reason: "refusal"`, and it does not
  // throw, so it has to be checked before the content is read. Named as a
  // MODEL refusal, deliberately NOT with this project's `REFUSED:` prefix:
  // that prefix means "the boundary refused", and the panel renders it in
  // the loud red treatment reserved for exactly that. A model declining is a
  // different event and must not be filmed as if the browser had enforced
  // something.
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category ?? 'unspecified';
    return { message: `MODEL DECLINED (${category}): no tool was called and no answer was produced.` };
  }

  const texts: string[] = [];
  const calls: { name: string; arguments?: Record<string, unknown> }[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      texts.push(block.text);
    } else if (block.type === 'tool_use') {
      calls.push({
        name: block.name,
        arguments: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    // `thinking` and any other block type is deliberately ignored: it is
    // neither an answer nor a call.
  }

  // Hitting the output cap mid-`tool_use` truncates the arguments the model
  // was still writing, and the SDK hands back whatever it parsed. Executing
  // that would run a real tool with silently incomplete arguments: a call
  // that succeeds and means the wrong thing, which is worse than a failure.
  // Dropped and reported instead.
  if (response.stop_reason === 'max_tokens') {
    return {
      message:
        `the model's turn was cut off at the ${response.usage?.output_tokens ?? '?'}-token output cap` +
        (calls.length > 0 ? `, mid-call to ${calls.map((c) => c.name).join(', ')}; the call was discarded rather than run with truncated arguments` : ''),
    };
  }

  const plan: ProxyPlan = {};
  const text = texts.join('\n').trim();
  if (text) plan.message = text;
  if (calls.length > 0) plan.calls = calls;

  // Never hand back an object with neither field. That is precisely the
  // shape that made the loop break at step zero and the panel render
  // nothing: say what happened instead.
  if (!plan.message && !plan.calls) {
    return { message: `the model returned no text and no tool call (stop_reason: ${response.stop_reason ?? 'unknown'})` };
  }

  return plan;
}
