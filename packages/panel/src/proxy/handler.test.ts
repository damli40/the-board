import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleProxy, type ProxyEnv, type ProxyInput } from './handler';

const ORIGIN = 'https://theboard-a.netlify.app';
const ROOM_CODE = 'test-room-code';
const SUPPLIED_KEY = 'sk-super-secret-caller-key-do-not-leak';
const SITE_KEY = 'sk-super-secret-site-key-do-not-leak';

function baseInput(overrides: Partial<ProxyInput> = {}): ProxyInput {
  return {
    method: 'POST',
    headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE },
    body: JSON.stringify({ system: 's', messages: [{ role: 'user', content: 'go' }], tools: [] }),
    ...overrides,
  };
}

function baseEnv(overrides: Partial<ProxyEnv> = {}): ProxyEnv {
  return { ROOM_CODE, ...overrides };
}

/**
 * A `global.fetch` stub typed with fetch's own parameters, so
 * `mock.calls[n]` comes back as `[string, RequestInit | undefined]` rather
 * than `[]` — `vi.fn(async () => ...)` with no declared parameters infers a
 * zero-argument call signature, which is what the mock function itself is
 * shaped like, not what it was actually CALLED with.
 */
function fetchStub(respond: () => Response | Promise<Response>) {
  return vi.fn(async (_url: string, _init?: RequestInit) => respond());
}

// Every test group below uses a `now` far apart from every other group's, so
// the module-level rate-limit counter (handler.ts's `rateState`, shared for
// the life of this test file, exactly as it would be for the life of one
// deployed function container) never carries an unintended count between
// unrelated tests. Only the "rate limit" describe block below deliberately
// hammers a single window.
let clock = 1_000_000;
function freshNow(): number {
  clock += 10_000_000; // far past RATE_WINDOW_MS (60s)
  return clock;
}

describe('handleProxy: gate order and status codes', () => {
  it('rejects a non-POST method with 405, before touching any gate', () => {
    // Test hygiene (fix round 1): ROOM_CODE is deliberately UNSET here. The
    // previous version of this test used baseEnv()'s valid ROOM_CODE, so it
    // could not actually distinguish "405 fires before any gate" from "405
    // fires after the room-code gate happens to pass" — both would read
    // 405. Only an env that would otherwise 500 proves the ordering claim.
    return handleProxy(baseInput({ method: 'GET' }), baseEnv({ ROOM_CODE: undefined }), freshNow()).then((res) => {
      expect(res.statusCode).toBe(405);
    });
  });

  it('rejects a disallowed origin with 403 (defence in depth)', async () => {
    const res = await handleProxy(baseInput({ headers: { origin: 'https://evil.example', 'x-room-code': ROOM_CODE } }), baseEnv(), freshNow());
    expect(res.statusCode).toBe(403);
  });

  it('allows a missing Origin header (non-browser callers send none)', async () => {
    // Test hygiene (fix round 1): `not.toBe(403)` passed on ANY other
    // status, including a 500 from a misconfigured test — it never proved
    // the request actually got past the origin gate to a LATER, specific
    // outcome. With baseEnv()'s valid room code and no key anywhere, the
    // real next gate to fire is the 503 "no model key" — assert that.
    const res = await handleProxy(baseInput({ headers: { 'x-room-code': ROOM_CODE } }), baseEnv(), freshNow());
    expect(res.statusCode).toBe(503);
  });

  it('FAILS CLOSED with 500 when ROOM_CODE is unset on the deploy, even with a valid origin', async () => {
    const res = await handleProxy(baseInput(), baseEnv({ ROOM_CODE: undefined }), freshNow());
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('ROOM_CODE');
  });

  it('rejects a missing room code with 401', async () => {
    const res = await handleProxy(baseInput({ headers: { origin: ORIGIN } }), baseEnv(), freshNow());
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong room code with 401', async () => {
    const res = await handleProxy(baseInput({ headers: { origin: ORIGIN, 'x-room-code': 'wrong' } }), baseEnv(), freshNow());
    expect(res.statusCode).toBe(401);
  });

  it('requires the room code EVEN when the caller supplies their own model key (ruling 6)', async () => {
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown provider id with 400 naming the ids that exist', async () => {
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-provider': 'not-a-provider', 'x-model-key': SUPPLIED_KEY },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('anthropic');
    expect(res.body).toContain('openai');
    expect(res.body).toContain('google');
    expect(res.body).toContain('openai-compatible');
  });

  it('returns 503 with the exact documented body when no key is available anywhere', async () => {
    const res = await handleProxy(baseInput(), baseEnv(), freshNow());
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("no model key: set one in the panel's setup, or set MODEL_API_KEY on this site");
  });
});

describe('handleProxy: C1 (fix round 1) — key ties to destination, or the request is refused', () => {
  const REFUSAL_BODY = 'a caller-supplied base URL or provider requires a caller-supplied key: send x-model-key';

  it('THE EXPLOIT, reproduced and now blocked: env holds the site key, caller sends only x-model-base-url', async () => {
    // This is the reviewer's exact reproduction (C1): a public caller with
    // only the room code, no Origin, and no key of their own, pointing the
    // deployed site's own funded key at an arbitrary host. Before the fix
    // this returned 200 with the site key in the outbound x-api-key header.
    const fetchMock = fetchStub(() => new Response('should never be reached', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { 'x-room-code': ROOM_CODE, 'x-model-base-url': 'https://attacker.example.com' } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(REFUSAL_BODY);
    // The money assertion: fetch must never have been called at all, so the
    // site's key was never constructed into an outbound header, let alone
    // sent to attacker.example.com.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('refuses a caller-supplied x-model-provider with no caller key, even naming a VALID provider', async () => {
    const fetchMock = fetchStub(() => new Response('should never be reached', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-provider': 'openai' } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(REFUSAL_BODY);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('refuses BOTH a caller-supplied provider and base url together with no caller key, same body', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai',
          'x-model-base-url': 'https://attacker.example.com',
        },
      }),
      baseEnv({ MODEL_API_KEY: SITE_KEY }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(REFUSAL_BODY);
  });

  it('a caller WITH their own key may freely choose provider and base url', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-key': SUPPLIED_KEY,
          'x-model-provider': 'openai-compatible',
          'x-model-base-url': 'https://openrouter.ai/api',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    vi.unstubAllGlobals();
  });

  it('env.MODEL_BASE_URL now outranks the provider default, with no caller key (closes M9)', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY, MODEL_BASE_URL: 'https://pinned-gateway.example.com' }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pinned-gateway.example.com/v1/messages');
    vi.unstubAllGlobals();
  });

  it('env.MODEL_BASE_URL is NOT consulted when a caller key IS present — the BYOK key goes to the provider\'s own host (fix round 2, item 2)', async () => {
    // Revised ruling, fix round 2: round 1 had env.MODEL_BASE_URL outrank
    // the provider default in BOTH key modes. The re-review found the
    // consequence: a caller who brings their OWN OpenAI key on a site that
    // sets MODEL_BASE_URL had that key POSTed to the OPERATOR'S gateway
    // instead of api.openai.com — the operator's pin was redirecting a key
    // it does not own. Whoever owns the key decides where it goes: a
    // caller's own key, with no x-model-base-url header of their own, must
    // reach the PROVIDER'S real endpoint, never the operator's pin.
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv({ MODEL_BASE_URL: 'https://pinned-gateway.example.com' }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(url).not.toContain('pinned-gateway');
    vi.unstubAllGlobals();
  });

  it('a caller with their own key and their own x-model-base-url header still wins over env.MODEL_BASE_URL', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY, 'x-model-base-url': 'https://caller-chosen.example.com' },
      }),
      baseEnv({ MODEL_BASE_URL: 'https://pinned-gateway.example.com' }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://caller-chosen.example.com/v1/messages');
    vi.unstubAllGlobals();
  });
});

describe('handleProxy: gate order and status codes (continued)', () => {
  it('a caller-supplied key beats the env key (does not 503, and is used — see fetch test below)', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(SUPPLIED_KEY);
    expect(headers['x-api-key']).not.toBe(SITE_KEY);
    vi.unstubAllGlobals();
  });

  it('openai-compatible, caller-key branch, no base url anywhere: tells the CALLER to send x-model-base-url, never MODEL_BASE_URL (fix round 3)', async () => {
    // Fix round 3: item 2 (fix round 2) made env.MODEL_BASE_URL unreachable
    // on the caller-key branch, but this message used to name it as a fix
    // regardless of branch — telling a BYOK caller to "set MODEL_BASE_URL"
    // was advice the operator could follow and the request would still 400,
    // because this path never reads that var. MODEL_BASE_URL is set in env
    // here specifically to prove the caller-key branch still ignores it
    // (the 400 itself is the regression check for item 2; the body content
    // is the regression check for this item).
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-provider': 'openai-compatible', 'x-model-key': SUPPLIED_KEY },
      }),
      baseEnv({ MODEL_BASE_URL: 'https://pinned-gateway.example.com/should-not-apply' }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('base url');
    expect(res.body).toContain('x-model-base-url');
    expect(res.body).not.toContain('MODEL_BASE_URL');
  });

  it('openai-compatible, server-key branch, no base url anywhere: tells the OPERATOR to set MODEL_BASE_URL (fix round 3)', async () => {
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY, MODEL_PROVIDER: 'openai-compatible' }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('base url');
    expect(res.body).toContain('MODEL_BASE_URL');
    expect(res.body).not.toContain('x-model-base-url');
  });

  it('an http:// base url is refused with 400 when allowPrivateHosts is false', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai-compatible',
          'x-model-key': SUPPLIED_KEY,
          'x-model-base-url': 'http://localhost:11434',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv({ allowPrivateHosts: false }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
  });

  it('a private-host https base url is also refused with 400 when allowPrivateHosts is false', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai-compatible',
          'x-model-key': SUPPLIED_KEY,
          'x-model-base-url': 'https://192.168.1.5:11434',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv({ allowPrivateHosts: false }),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
  });

  it('an http:// private base url IS allowed when allowPrivateHosts is true (dev middleware)', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai-compatible',
          'x-model-key': SUPPLIED_KEY,
          'x-model-base-url': 'http://localhost:11434',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv({ allowPrivateHosts: true }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    vi.unstubAllGlobals();
  });

  it('a malformed base url is a 400 rather than throwing', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai-compatible',
          'x-model-key': SUPPLIED_KEY,
          'x-model-base-url': 'not a url',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
  });

  it('requires a model id when the provider ships no default (openai-compatible) with 400', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-provider': 'openai-compatible',
          'x-model-key': SUPPLIED_KEY,
          'x-model-base-url': 'https://openrouter.ai/api',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('model id');
  });

  it('defaults the provider to anthropic when neither a header nor MODEL_PROVIDER is set', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.anthropic.com');
    expect(url).toContain('/v1/messages');
    vi.unstubAllGlobals();
  });
});

describe('handleProxy: a successful call, per provider, translated both ways', () => {
  it('anthropic: builds the right url, headers, and translates the response', async () => {
    const fetchMock = fetchStub(() =>
      new Response(
        JSON.stringify({
          content: [{ type: 'tool_use', name: 'open_exhibit', input: { exhibitId: 'E1' } }],
          stop_reason: 'tool_use',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY, 'x-model-provider': 'anthropic' } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(SUPPLIED_KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(res.body)).toEqual({ calls: [{ name: 'open_exhibit', arguments: { exhibitId: 'E1' } }] });
    vi.unstubAllGlobals();
  });

  it('openai: bearer auth header, translated response', async () => {
    const fetchMock = fetchStub(() =>
      new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'final answer' } }] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY, 'x-model-provider': 'openai' } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SUPPLIED_KEY}`);
    expect(JSON.parse(res.body)).toEqual({ message: 'final answer' });
    // I8, fix round 1: the `openai` provider's own default model (gpt-5)
    // rejects `max_tokens` outright — this deployment MUST send
    // max_completion_tokens, never max_tokens.
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody.max_completion_tokens).toBeDefined();
    expect(sentBody.max_tokens).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('openai-compatible sends max_tokens, not max_completion_tokens (I8, fix round 1)', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-key': SUPPLIED_KEY,
          'x-model-provider': 'openai-compatible',
          'x-model-base-url': 'http://localhost:11434',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv({ allowPrivateHosts: true }),
      freshNow()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody.max_tokens).toBeDefined();
    expect(sentBody.max_completion_tokens).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('google: x-goog-api-key header, model in the path, translated response', async () => {
    const fetchMock = fetchStub(() =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'final answer' }] }, finishReason: 'STOP' }] }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY, 'x-model-provider': 'google' },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(SUPPLIED_KEY);
    expect(JSON.parse(res.body)).toEqual({ message: 'final answer' });
    vi.unstubAllGlobals();
  });

  it('joins an openai-compatible base url with a path (no double slash) and honours a caller model id', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-key': SUPPLIED_KEY,
          'x-model-provider': 'openai-compatible',
          'x-model-base-url': 'https://openrouter.ai/api/',
          'x-model-id': 'meta-llama/llama-3',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    vi.unstubAllGlobals();
  });
});

describe('handleProxy: upstream failures are legible, and never leak the key', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a non-2xx upstream response is a 502 naming the provider, the status and the message', async () => {
    vi.stubGlobal(
      'fetch',
      fetchStub(() => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }))
    );
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).toContain('anthropic');
    expect(res.body).toContain('401');
    expect(res.body).toContain('invalid x-api-key');
    expect(res.body).not.toContain(SUPPLIED_KEY);
  });

  it('a thrown network error (e.g. DNS failure) is a 502, not an unhandled rejection', async () => {
    vi.stubGlobal(
      'fetch',
      fetchStub(() => {
        throw new TypeError('fetch failed');
      })
    );
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(SUPPLIED_KEY);
  });

  it('an aborted/timed-out upstream call is a 504, not a 502', async () => {
    vi.stubGlobal(
      'fetch',
      fetchStub(() => {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        throw err;
      })
    );
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(504);
    expect(res.body).not.toContain(SUPPLIED_KEY);
  });

  it('an upstream 500 with a body over 500 characters is never echoed raw', async () => {
    const huge = 'x'.repeat(2000);
    vi.stubGlobal('fetch', fetchStub(() => new Response(huge, { status: 500 })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body.length).toBeLessThan(600);
  });

  it('a 200 upstream response that is not valid JSON is a 502, not a throw', async () => {
    vi.stubGlobal('fetch', fetchStub(() => new Response('not json', { status: 200 })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(SUPPLIED_KEY);
  });

  it('does not follow an upstream redirect: a 3xx is a 502 naming it, never fetched again (I1, fix round 1)', async () => {
    const fetchMock = fetchStub(
      () => new Response(null, { status: 302, headers: { location: 'https://attacker.example.com/steal' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).toContain('redirect');
    expect(res.body).toContain('attacker.example.com');
    // Exactly one call — the redirect target was named in the error, never
    // itself fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacts and caps the redirect Location header, same as its neighbour readUpstreamError (item 3, fix round 2)', async () => {
    const fetchMock = fetchStub(
      () => new Response(null, { status: 302, headers: { location: `https://attacker.example.com/steal?key=${SUPPLIED_KEY}` } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(SUPPLIED_KEY);
    expect(res.body).toContain('[redacted]');
  });

  it('falls back to "an undisclosed location" when the redirect Location header is over the 500-char cap', async () => {
    const hugeLocation = `https://attacker.example.com/${'x'.repeat(600)}`;
    vi.stubGlobal('fetch', fetchStub(() => new Response(null, { status: 302, headers: { location: hugeLocation } })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).toContain('undisclosed location');
    expect(res.body.length).toBeLessThan(700);
    vi.unstubAllGlobals();
  });

  it('a 200 whose JSON lacks the shape the adapter expects is a 502, not an unguarded throw (item 4, fix round 2)', async () => {
    // anthropic.ts's toProxyPlan does `for (const block of response.content)`
    // — a 200 with no `content` array throws "... is not iterable" out of
    // that loop. adapter.toProxyPlan(raw) used to sit OUTSIDE the try that
    // guards upstream.json(), so this was the last unguarded throw in
    // handleProxy (same shape as C2, on the response side).
    vi.stubGlobal('fetch', fetchStub(() => new Response(JSON.stringify({}), { status: 200 })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).toContain('anthropic');
    expect(res.body).not.toContain(SUPPLIED_KEY);
    vi.unstubAllGlobals();
  });

  it('sends redirect: "manual" on every upstream fetch (I1, fix round 1)', async () => {
    const fetchMock = fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
  });

  it('redacts the resolved key out of an upstream error body that echoes it back (I2, fix round 1)', async () => {
    vi.stubGlobal(
      'fetch',
      fetchStub(
        () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${SUPPLIED_KEY}` } }), { status: 401 })
      )
    );
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(SUPPLIED_KEY);
    expect(res.body).toContain('[redacted]');
    expect(res.body).toContain('Incorrect API key provided');
  });

  it('neither key leaks when BOTH a site key and a caller key are present and upstream 500s', async () => {
    // Both `key` (the one actually used and sent upstream) and the OTHER,
    // un-used key must be absent — this is what actually proves the leak
    // surface is "our own code never serializes a key into a response",
    // not just "the one key we happened to test with never showed up".
    vi.stubGlobal('fetch', fetchStub(() => new Response('internal server error', { status: 500 })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv({ MODEL_API_KEY: SITE_KEY }),
      freshNow()
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain(SUPPLIED_KEY);
    expect(res.body).not.toContain(SITE_KEY);
    expect(JSON.stringify(res.headers ?? {})).not.toContain(SUPPLIED_KEY);
    expect(JSON.stringify(res.headers ?? {})).not.toContain(SITE_KEY);
  });
});

describe('handleProxy: rate limiting', () => {
  it('admits up to RATE_LIMIT requests in a window, then 429s, all in one dedicated window', async () => {
    vi.stubGlobal('fetch', fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 })));
    const windowNow = freshNow();
    const env = baseEnv({ RATE_LIMIT: '2' });
    const input = baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await handleProxy(input, env, windowNow);
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
    vi.unstubAllGlobals();
  });

  it('treats RATE_LIMIT="" as UNSET (falls back to the default 60), not as the number 0 (M2, fix round 1)', async () => {
    // Number('') === 0, and 0 is finite — the old
    // `Number(env.RATE_LIMIT ?? DEFAULT)` never fell back to the default,
    // so a blank-but-present env var rate-limited every single request.
    vi.stubGlobal('fetch', fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 })));
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY } }),
      baseEnv({ RATE_LIMIT: '' }),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    vi.unstubAllGlobals();
  });
});

describe('handleProxy: a malformed panel request body is a 400, not a throw', () => {
  it('rejects invalid JSON with 400', async () => {
    const res = await handleProxy(
      baseInput({ headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY }, body: 'not json' }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
  });

  it('a request that parses but produces no usable messages is a 400, never an unhandled throw (C2, fix round 1)', async () => {
    // `parsePanelRequest` used to be the only thing inside the try/catch;
    // `adapter.toRequest` (which calls `toApiMessages`, and THROWS on
    // {"messages":[]}) sat outside it. Deployed, this became an unhandled
    // Netlify 500; in Vite's dev middleware (no try/catch there either) the
    // request just hung forever with no response at all.
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY },
        body: JSON.stringify({ messages: [] }),
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('no usable messages');
  });

  it('a base url carrying a query string is refused with 400 rather than silently mis-joined (M6, fix round 1)', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-key': SUPPLIED_KEY,
          'x-model-provider': 'openai-compatible',
          'x-model-base-url': 'https://gw.example.com/x?k=1',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('query');
  });

  it('a base url carrying a fragment is refused with 400 (M6, fix round 1)', async () => {
    const res = await handleProxy(
      baseInput({
        headers: {
          origin: ORIGIN,
          'x-room-code': ROOM_CODE,
          'x-model-key': SUPPLIED_KEY,
          'x-model-provider': 'openai-compatible',
          'x-model-base-url': 'https://gw.example.com/x#frag',
          'x-model-id': 'llama3',
        },
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('fragment');
  });
});

describe('handleProxy: I7 (fix round 1) — the unknown-tool-schema warning, restored', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('warns, naming the tool, when a panel tool has no catalogue schema — and never names a key', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 })));
    const res = await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'go' }],
          tools: [{ name: 'not_in_the_catalogue', description: 'made up for this test' }],
        }),
      }),
      baseEnv(),
      freshNow()
    );
    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not_in_the_catalogue'));
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(SUPPLIED_KEY);
  });

  it('does not warn for a tool the catalogue actually knows', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchStub(() => new Response(JSON.stringify({ content: [], stop_reason: 'end_turn' }), { status: 200 })));
    await handleProxy(
      baseInput({
        headers: { origin: ORIGIN, 'x-room-code': ROOM_CODE, 'x-model-key': SUPPLIED_KEY },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'go' }],
          tools: [{ name: 'open_exhibit', description: 'Read an exhibit.' }],
        }),
      }),
      baseEnv(),
      freshNow()
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
