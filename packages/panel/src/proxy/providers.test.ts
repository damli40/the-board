import { describe, it, expect } from 'vitest';
import { PROVIDERS, providerById } from './providers';
import { DEFAULT_MODEL } from './anthropic';

// The exact table from task-1-brief.md §1a — `id` is the wire vocabulary
// the panel's setup UI and handler.ts both key off, so a typo here is a
// silent breakage, not a loud one.
describe('PROVIDERS', () => {
  it('defines exactly the four providers, in the order the brief lists them', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'openai', 'google', 'openai-compatible']);
  });

  it('anthropic: default base url, default model, x-api-key auth plus anthropic-version', () => {
    const p = PROVIDERS.find((p) => p.id === 'anthropic')!;
    expect(p.label).toBe('Anthropic (Claude)');
    expect(p.wire).toBe('anthropic');
    expect(p.defaultBaseUrl).toBe('https://api.anthropic.com');
    expect(p.defaultModel).toBe('claude-opus-5');
    // Not a duplicated literal: the registry's default model IS
    // anthropic.ts's DEFAULT_MODEL, so the two cannot silently diverge.
    expect(p.defaultModel).toBe(DEFAULT_MODEL);
    expect(p.keyHeader).toBe('x-api-key');
    expect(p.keyPrefix).toBeUndefined();
    expect(p.extraHeaders).toEqual({ 'anthropic-version': '2023-06-01' });
    expect(p.hint).toBe('Keys start with sk-ant-. Any Claude model id works.');
  });

  it('openai: bearer auth, gpt-5 default', () => {
    const p = PROVIDERS.find((p) => p.id === 'openai')!;
    expect(p.label).toBe('OpenAI');
    expect(p.wire).toBe('openai');
    expect(p.defaultBaseUrl).toBe('https://api.openai.com');
    expect(p.defaultModel).toBe('gpt-5');
    expect(p.keyHeader).toBe('Authorization');
    expect(p.keyPrefix).toBe('Bearer ');
    // Fix round 1, I8: gpt-5 (this provider's own default model) rejects
    // max_tokens outright; openai.ts must send max_completion_tokens for
    // this provider specifically, never for openai-compatible.
    expect(p.maxTokensParam).toBe('max_completion_tokens');
    expect(p.hint).toBe('Keys start with sk-. Any chat-completions model works.');
  });

  it('google: x-goog-api-key auth, gemini-3-pro default', () => {
    const p = PROVIDERS.find((p) => p.id === 'google')!;
    expect(p.label).toBe('Google (Gemini)');
    expect(p.wire).toBe('google');
    expect(p.defaultBaseUrl).toBe('https://generativelanguage.googleapis.com');
    expect(p.defaultModel).toBe('gemini-3-pro');
    expect(p.keyHeader).toBe('x-goog-api-key');
    expect(p.hint).toBe('An AI Studio key. Any Gemini model id works.');
  });

  it('openai-compatible: no default base url or model, still openai wire', () => {
    const p = PROVIDERS.find((p) => p.id === 'openai-compatible')!;
    expect(p.label).toBe('Any OpenAI-compatible endpoint');
    expect(p.wire).toBe('openai');
    expect(p.defaultBaseUrl).toBeUndefined();
    expect(p.defaultModel).toBeUndefined();
    expect(p.keyHeader).toBe('Authorization');
    expect(p.keyPrefix).toBe('Bearer ');
    // Fix round 1, I8: unset, not 'max_completion_tokens' — targets here are
    // commonly Ollama/LM Studio/older vLLM/OpenRouter, which expect the
    // older max_tokens spelling openai.ts falls back to.
    expect(p.maxTokensParam).toBeUndefined();
    expect(p.hint).toContain('OpenRouter, Groq, Together, Fireworks, DeepSeek, vLLM, Ollama, LM Studio');
    expect(p.hint).toContain('Give the base URL without the /v1.');
  });
});

describe('providerById', () => {
  it('resolves each of the four exact ids', () => {
    for (const id of ['anthropic', 'openai', 'google', 'openai-compatible']) {
      expect(providerById(id)?.id).toBe(id);
    }
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(providerById('not-a-provider')).toBeUndefined();
    expect(providerById('')).toBeUndefined();
  });

  it('is case-sensitive: ids are exact strings, not normalised', () => {
    expect(providerById('OpenAI')).toBeUndefined();
    expect(providerById('Anthropic')).toBeUndefined();
  });
});
