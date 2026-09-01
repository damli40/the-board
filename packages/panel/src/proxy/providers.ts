// The provider registry — what turns "any provider, any key" from a slogan
// into four concrete wire configurations. Every other module in this proxy
// layer (openai.ts, google.ts, anthropic.ts's toRequest/toProxyPlanRaw pair,
// handler.ts) reads a ProviderDef from here rather than hardcoding a base
// URL, a header name or a default model a second time.
//
// `openai-compatible` is what makes the claim "any agent platform" true
// rather than a list of three. It has no `defaultBaseUrl` or `defaultModel`
// because the whole point of the entry is that the caller supplies both —
// OpenRouter, Groq, Together, Fireworks, DeepSeek, a local vLLM, Ollama or
// LM Studio server, or anything else that speaks the chat-completions wire
// format `openai.ts` already implements. Its `wire` is still `'openai'`:
// the endpoint and model differ from a first-party OpenAI account, the
// request/response shape does not.
import { DEFAULT_MODEL } from './anthropic';

export type WireFormat = 'anthropic' | 'openai' | 'google';

export interface ProviderDef {
  id: string;
  label: string;
  wire: WireFormat;
  defaultBaseUrl?: string;
  defaultModel?: string;
  keyHeader: string;
  /** Prepended to the key in the header value, e.g. `'Bearer '` for openai. */
  keyPrefix?: string;
  extraHeaders?: Record<string, string>;
  /**
   * The request field name for the output-length cap, on the `openai` wire
   * only — google.ts's cap is always `generationConfig.maxOutputTokens` and
   * anthropic.ts's is always `max_tokens`, neither configurable per
   * provider. Defaults to `'max_tokens'` when unset (fix round 1, I8):
   * OpenAI's current model family — `gpt-5`, this registry's own default —
   * rejects `max_tokens` outright ("Unsupported parameter... Use
   * 'max_completion_tokens' instead"), so the `openai` provider below
   * overrides it. `openai-compatible` targets are commonly Ollama, LM
   * Studio and older vLLM/OpenRouter builds that only understand the older
   * `max_tokens` spelling, so it keeps the default. Cost if wrong: a
   * gateway that only accepts `max_completion_tokens` needs the `openai`
   * provider selected instead of `openai-compatible`, which is one
   * dropdown.
   */
  maxTokensParam?: string;
  /** One line, shown under the key field in the panel's setup UI (task 2). */
  hint: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    wire: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    // Read from anthropic.ts rather than repeated here, so the model this
    // registry advertises as the default and the model toMessagesRequest
    // actually falls back to cannot drift apart.
    defaultModel: DEFAULT_MODEL,
    keyHeader: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    hint: 'Keys start with sk-ant-. Any Claude model id works.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    wire: 'openai',
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-5',
    keyHeader: 'Authorization',
    keyPrefix: 'Bearer ',
    maxTokensParam: 'max_completion_tokens',
    hint: 'Keys start with sk-. Any chat-completions model works.',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    wire: 'google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-3-pro',
    keyHeader: 'x-goog-api-key',
    hint: 'An AI Studio key. Any Gemini model id works.',
  },
  {
    id: 'openai-compatible',
    label: 'Any OpenAI-compatible endpoint',
    wire: 'openai',
    keyHeader: 'Authorization',
    keyPrefix: 'Bearer ',
    hint:
      'OpenRouter, Groq, Together, Fireworks, DeepSeek, vLLM, Ollama, LM Studio — anything that speaks /v1/chat/completions. Give the base URL without the /v1.',
  },
];

export function providerById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** What handler.ts resolves (headers, then env, then the provider's own
 *  default) before calling a wire adapter's `toRequest`. */
export interface WireOptions {
  model: string;
  maxTokens?: number;
  /** See `ProviderDef.maxTokensParam`. Only `openai.ts` reads this. */
  maxTokensParam?: string;
}
