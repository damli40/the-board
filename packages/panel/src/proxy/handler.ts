// The single request handler behind /.netlify/functions/model-proxy, usable
// from two hosts: the deployed Netlify function (model-proxy.ts, a thin
// shell around this) and Vite's own dev server (vite.config.ts's dev
// middleware — task 1, §1e). Neither `@netlify/functions` nor any `node:`
// built-in is imported here, on purpose: this file has to run inside Vite's
// dev middleware too, a different runtime context from a deployed function
// even though both happen to be Node underneath.
//
// GATE ORDER, AND IT MUST STAY THIS ORDER: nothing is parsed and no key is
// read until every check above it has passed, so a rejected caller costs
// this function as little as possible and never reaches a code path that
// could touch a provider or its key.
//   1. method                    -> 405
//   2. checkOrigin                -> 403  (defence in depth only, see gate.ts)
//   3. checkRoomCode               -> 401 / 500 (the gate that actually holds —
//      ALWAYS required, in both key modes: a caller-supplied key changes
//      whose account is billed, not whether a public endpoint may be driven
//      by strangers)
//   4. checkRate                   -> 429  (per-container, see gate.ts)
//   5. resolve the key              -> 503 if neither a header nor the site has one
//   6. caller-key-dependent guard    -> 400 if the caller sent a provider or
//      base-url header WITHOUT also sending their own key (fix round 1, C1 —
//      see the long comment at that check for why)
//   7. resolve the provider          -> 400 if the id is unknown
//   8. resolve the base url           -> 400 if openai-compatible has neither
//   9. base-url safety check           -> 400 (no query/fragment, https-only
//      unless allowPrivateHosts, no private/loopback host unless
//      allowPrivateHosts — see vite.config.ts's dev-only default)
//  10. resolve the model                -> 400 if none
//  11. parse the panel request AND translate it for the wire -> 400 on either
//      failure (fix round 1, C2: translation used to sit outside the parse's
//      try/catch)
//  12. fetch upstream with `redirect: 'manual'` (fix round 1, I1) and a
//      25-second timeout; a 3xx is a 502 naming the redirect, not followed;
//      translate the response back
//
// Ported from packages/panel/netlify/functions/model-proxy.ts, which used to
// hold every one of these gates directly (pre-BYOK, single-provider). Every
// WHY comment that lived there for a gate's position survives here, next to
// the gate itself now that the gate executes here.
import {
  checkOrigin,
  checkRate,
  checkRoomCode,
  EMPTY_RATE_STATE,
  ROOM_CODE_HEADER,
  type RateState,
} from './gate';
import { PROVIDERS, providerById, type WireFormat, type WireOptions } from './providers';
import {
  DEFAULT_MAX_TOKENS,
  parsePanelRequest,
  schemaIsUnknown,
  toProxyPlanRaw,
  toRequest as toAnthropicRequest,
  type PanelRequest,
  type ProxyPlan,
} from './anthropic';
import { toRequest as toOpenAiRequest, toProxyPlan as toOpenAiProxyPlan } from './openai';
import { toRequest as toGoogleRequest, toProxyPlan as toGoogleProxyPlan } from './google';
import { isPrivateHost } from '../../../record/src/shared/privateHost';
// Task 2b fix round 1, C1: `redactKey` used to be defined right here and
// nowhere else, so the SERVER scrubbed keys out of error text while the
// BROWSER did not scrub them out of its own. Lifted to proxy/redact.ts so
// loop.ts can apply the identical scrub; the behaviour here is unchanged.
import { redactKey } from './redact';

export interface ProxyEnv {
  ROOM_CODE?: string;
  MODEL_API_KEY?: string;
  MODEL_ID?: string;
  MODEL_PROVIDER?: string;
  MODEL_BASE_URL?: string;
  RATE_LIMIT?: string;
  /**
   * Dev-only. The deployed Netlify function (model-proxy.ts) never sets
   * this — it is a public endpoint, and allowing it to fetch a
   * private/loopback host would reopen exactly what capture.ts's identical
   * check exists to close. Vite's dev middleware sets it true so a locally
   * running Ollama or LM Studio server (an http://localhost base url) works
   * — see vite.config.ts's own comment on why that asymmetry is safe there
   * and nowhere else.
   */
  allowPrivateHosts?: boolean;
}

export interface ProxyInput {
  method: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface ProxyResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// The five origins this function accepts a browser Origin header from.
// Written out rather than imported from record/src/config/origins.ts because
// that module reads `import.meta.env` to choose dev or prod, and this file
// runs in plain Node (a deployed function) or Vite's config/middleware
// context (dev) — neither resolves that the way the app's own browser
// bundle does. A deployed function must accept the deployed origins whatever
// the build thought. Defence in depth only (see checkOrigin's own comment).
const ALLOWED_ORIGINS = [
  'https://theboard-record.netlify.app',
  'https://theboard-a.netlify.app',
  'https://theboard-b.netlify.app',
  'https://theboard-seat1.netlify.app',
  'https://theboard-seat2.netlify.app',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
];

const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 60;
const UPSTREAM_TIMEOUT_MS = 25_000;
const MAX_ERROR_BODY_CHARS = 500;

// Per-container, and only per-container. Netlify functions are stateless
// between invocations and run in many containers at once, so N containers
// enforce N × limit, not limit. This bounds a runaway client and a
// single-source flood; it is NOT a global ceiling and must never be written
// up as one.
//
// ⚠️ THE REAL CEILING IS NOT IN THIS FILE. Set a spend limit on the API key
// in the provider's console — that is the only place with one consistent
// view of the spend (see docs/evidence/deploy.md, and gate.ts's own comment
// on checkRate).
let rateState: RateState = EMPTY_RATE_STATE;

const HEADER_PROVIDER = 'x-model-provider';
const HEADER_KEY = 'x-model-key';
const HEADER_BASE_URL = 'x-model-base-url';
const HEADER_MODEL = 'x-model-id';

interface WireAdapter {
  toRequest(request: PanelRequest, opts: WireOptions): { path: string; body: unknown };
  toProxyPlan(raw: unknown): ProxyPlan;
}

const ADAPTERS: Record<WireFormat, WireAdapter> = {
  anthropic: { toRequest: toAnthropicRequest, toProxyPlan: toProxyPlanRaw },
  openai: { toRequest: toOpenAiRequest, toProxyPlan: toOpenAiProxyPlan },
  google: { toRequest: toGoogleRequest, toProxyPlan: toGoogleProxyPlan },
};

/** Case-insensitive header lookup; treats a blank value as absent. */
function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined && value.trim() !== '') return value;
  }
  return undefined;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Non-2xx upstream is legible, not swallowed: names the provider, the
 * status, and the upstream error message if the body carried one. Providers
 * really do answer things like `{"error":{"message":"Incorrect API key
 * provided: sk-ant-abc123..."}}` — this used to relay that verbatim (I2,
 * fix round 1). Redacted before the 500-char cap is applied, and before the
 * JSON.parse that pulls a `.error.message` out, so a key sitting inside a
 * quoted JSON string is redacted in place rather than only when the whole
 * body happens to fall back to raw text.
 */
async function readUpstreamError(providerId: string, status: number, res: Response, key: string): Promise<string> {
  let raw = '';
  try {
    raw = await res.text();
  } catch {
    // Body unreadable; fall through with an empty string.
  }
  const redacted = redactKey(raw, key);

  let message: string | undefined;
  if (redacted) {
    try {
      const parsed = JSON.parse(redacted) as { error?: { message?: string }; message?: string };
      const candidate = parsed.error?.message ?? parsed.message;
      if (typeof candidate === 'string') message = candidate;
    } catch {
      // Not JSON; fall back to the bounded raw text below.
    }
  }
  const detail = message ?? (redacted.length > 0 && redacted.length <= MAX_ERROR_BODY_CHARS ? redacted : undefined);
  return `model provider (${providerId}) error ${status}${detail ? `: ${detail}` : ''}`;
}

export async function handleProxy(input: ProxyInput, env: ProxyEnv, now?: number): Promise<ProxyResult> {
  // 1. method
  if (input.method !== 'POST') return { statusCode: 405, body: 'POST only' };

  // 2. origin — gate BEFORE any parsing, and long before the key is read: a
  // rejected caller should cost this function as little as possible, and
  // must never reach a code path that could touch the provider.
  const origin = checkOrigin(header(input.headers, 'origin'), ALLOWED_ORIGINS);
  if (!origin.ok) return { statusCode: origin.statusCode, body: origin.body };

  // 3. room code. See checkRoomCode's own comment for FAILS CLOSED when
  // ROOM_CODE is unset — a deploy that forgets the variable must refuse
  // every request loudly, never quietly reopen. Ruling 6 (task 1): this runs
  // whether or not the caller went on to supply their own provider key.
  const room = checkRoomCode(header(input.headers, ROOM_CODE_HEADER), env.ROOM_CODE);
  if (!room.ok) return { statusCode: room.statusCode, body: room.body };

  // 4. rate limit. `RATE_LIMIT=""` (an unset-but-present env var on some
  // hosts) must read as UNSET, not as the number 0 — `Number('')` is `0`,
  // which is finite, so the old `Number(env.RATE_LIMIT ?? DEFAULT)` silently
  // rate-limited every request to death (M2, fix round 1).
  const rateLimitEnv = env.RATE_LIMIT?.trim();
  const parsedLimit = rateLimitEnv ? Number(rateLimitEnv) : NaN;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_RATE_LIMIT;
  const rate = checkRate(rateState, now ?? Date.now(), limit, RATE_WINDOW_MS);
  rateState = rate.state;
  if (!rate.result.ok) return { statusCode: rate.result.statusCode, body: rate.result.body };

  // 5. key. A caller-supplied key beats the site's own — the header this
  // panel's setup form sends (task 2) is what lets someone run the demo
  // against their own account rather than the operator's funded key.
  const headerKey = header(input.headers, HEADER_KEY);
  const key = headerKey ?? env.MODEL_API_KEY;
  if (!key) {
    return {
      statusCode: 503,
      body: "no model key: set one in the panel's setup, or set MODEL_API_KEY on this site",
    };
  }
  const hasCallerKey = headerKey !== undefined;

  // 6. THE FIX FOR C1 (fix round 1, the headline finding). Before this,
  // provider and base-url resolution were independent of WHOSE key ended up
  // being used: a caller who sent no x-model-key but DID send
  // x-model-base-url got the SITE'S OWN funded key (env.MODEL_API_KEY)
  // POSTed to whatever host they named, with `x-api-key` (or
  // `x-goog-api-key`) attached. `checkOrigin` waves a missing Origin
  // through on purpose (see its own comment), so a bare curl reached this
  // freely with nothing but the room code — and a public repo's committed
  // DEMO_ROOM_CODE turns "needs the shared secret" into "needs nothing".
  //
  // The fix ties targeting to authorization: a caller may only choose WHERE
  // this function sends a request (provider, base url) if they also supply
  // the KEY that request will carry. Refused, not silently ignored — a
  // silent ignore would mean the caller believes they reached one endpoint
  // while the server reached another, which is its own kind of lie.
  const headerProvider = header(input.headers, HEADER_PROVIDER);
  const headerBaseUrl = header(input.headers, HEADER_BASE_URL);
  if (!hasCallerKey && (headerProvider !== undefined || headerBaseUrl !== undefined)) {
    return {
      statusCode: 400,
      body: 'a caller-supplied base URL or provider requires a caller-supplied key: send x-model-key',
    };
  }

  // 7. provider. `x-model-provider` only reaches here at all when a caller
  // key was also supplied (the guard above); otherwise this falls straight
  // to the site's own MODEL_PROVIDER.
  const providerId = hasCallerKey ? (headerProvider ?? env.MODEL_PROVIDER ?? 'anthropic') : (env.MODEL_PROVIDER ?? 'anthropic');
  const provider = providerById(providerId);
  if (!provider) {
    return {
      statusCode: 400,
      body: `unknown model provider "${providerId}": expected one of ${PROVIDERS.map((p) => p.id).join(', ')}`,
    };
  }

  // 8. base url. REVISED (fix round 2, item 2 — the round-1 ruling on
  // MODEL_BASE_URL was too broad and the coordinator withdrew it). Round 1
  // had `env.MODEL_BASE_URL` outrank the provider default in BOTH key
  // modes. The consequence the re-review found: on a site that sets
  // MODEL_BASE_URL, a caller who brings their OWN OpenAI key and selects
  // OpenAI had that key POSTed to the OPERATOR'S gateway instead of to
  // api.openai.com — the operator's env var was redirecting a key it does
  // not own. Before that diff the provider default won and this could not
  // happen.
  //
  // The rule now: whoever owns the key decides where it goes.
  //   - Caller key present: `x-model-base-url` -> `provider.defaultBaseUrl`.
  //     `env.MODEL_BASE_URL` is NOT consulted at all — the operator's pin
  //     governs the operator's own key, never a caller's.
  //   - No caller key (the site's own key is in use): `env.MODEL_BASE_URL`
  //     -> `provider.defaultBaseUrl`, unchanged from round 1 — the operator
  //     pinning where THEIR OWN key goes is exactly what that env var is for.
  const baseUrlString = hasCallerKey ? (headerBaseUrl ?? provider.defaultBaseUrl) : (env.MODEL_BASE_URL ?? provider.defaultBaseUrl);
  if (!baseUrlString) {
    // Fix round 3: this used to name BOTH x-model-base-url and MODEL_BASE_URL
    // regardless of which branch fired. Since item 2 (fix round 2) made
    // env.MODEL_BASE_URL unreachable on the caller-key branch, a BYOK caller
    // hitting openai-compatible with no header was told to "set
    // MODEL_BASE_URL" — advice the operator could follow and the request
    // would still 400, because this path never reads that var. Match the
    // message to the branch that actually fired.
    return {
      statusCode: 400,
      body: hasCallerKey
        ? `the "${provider.id}" provider needs a base url: send x-model-base-url alongside your key`
        : `the "${provider.id}" provider needs a base url: set MODEL_BASE_URL on this site`,
    };
  }

  // 9. base-url safety.
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlString);
  } catch {
    return { statusCode: 400, body: 'base url is not a valid url' };
  }
  // A query string or fragment survives string concatenation with the
  // wire's own path (`joinUrl`) in a way that changes where the request
  // actually lands — `https://gw/x?k=1` + `/v1/chat/completions` becomes
  // `https://gw/x?k=1/v1/chat/completions`, silently the wrong endpoint
  // (M6, fix round 1). Refused before it can happen rather than produced.
  if (baseUrl.search || baseUrl.hash) {
    return { statusCode: 400, body: 'base url must not contain a query string or fragment' };
  }
  const allowPrivate = env.allowPrivateHosts === true;
  if (!allowPrivate && baseUrl.protocol !== 'https:') {
    return { statusCode: 400, body: 'base url must be https (allowPrivateHosts is only set for a local dev server)' };
  }
  // Reuses the identical predicate capture.ts uses for the same reason
  // (packages/record/src/shared/privateHost.ts): a hostname that merely
  // RESOLVES to a private address still gets through — it matches on the
  // literal only, exactly as that file documents. The other half of that
  // guard — refusing to follow a redirect to somewhere else entirely — is
  // at the fetch call below (I1, fix round 1).
  if (!allowPrivate && isPrivateHost(baseUrl.hostname)) {
    return { statusCode: 400, body: 'base url is not allowed' };
  }

  // 10. model. `x-model-id` stays allowed in BOTH key modes (task 1 brief):
  // naming a model on an already-authorized site key is not the same
  // capability as redirecting where the key is sent.
  const model = header(input.headers, HEADER_MODEL) ?? env.MODEL_ID ?? provider.defaultModel;
  if (!model) {
    return {
      statusCode: 400,
      body: `model id required: set x-model-id or MODEL_ID for the "${provider.id}" provider`,
    };
  }

  // 11. parse AND translate, both inside the same try/catch (fix round 1,
  // C2). `adapter.toRequest` used to sit OUTSIDE this try: every adapter
  // calls `toApiMessages`, which THROWS on `{"messages":[]}`, a
  // whitespace-only goal, or a transcript whose only turn is `assistant`.
  // Deployed, that rejection became an unhandled Netlify 500 reading as
  // "proxy not configured". In dev, vite.config.ts's middleware had no
  // try/catch either, so `res.end()` was never reached and the browser
  // request hung forever — exactly the failure this proxy layer exists to
  // prevent.
  const adapter = ADAPTERS[provider.wire];
  let path: string;
  let body: unknown;
  try {
    const panelRequest: PanelRequest = parsePanelRequest(input.body);

    // Restored (I7, fix round 1): the old model-proxy.ts warned when the
    // panel sent a tool this adapter's catalogue doesn't recognise — a
    // silent gap between what the model is shown and what schemaFor.ts
    // knows. Names the TOOL, never the key; see schemaFor's own comment for
    // why the call is still forwarded rather than dropped.
    for (const tool of panelRequest.tools ?? []) {
      if (schemaIsUnknown(tool.name)) {
        console.warn(`model-proxy: no input schema in the tool catalogue for "${tool.name}"`);
      }
    }

    const wireOptions: WireOptions = { model, maxTokens: DEFAULT_MAX_TOKENS, maxTokensParam: provider.maxTokensParam };
    ({ path, body } = adapter.toRequest(panelRequest, wireOptions));
  } catch (err) {
    // A malformed request is the caller's fault and is worth saying so, in a
    // status the panel's own `res.ok` check turns into a visible TRANSPORT
    // ERROR line rather than a hang.
    return { statusCode: 400, body: err instanceof Error ? err.message : 'bad request' };
  }

  const upstreamHeaders: Record<string, string> = { 'content-type': 'application/json' };
  upstreamHeaders[provider.keyHeader] = `${provider.keyPrefix ?? ''}${key}`;
  if (provider.extraHeaders) Object.assign(upstreamHeaders, provider.extraHeaders);

  let upstream: Response;
  try {
    upstream = await fetch(joinUrl(baseUrl.toString(), path), {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
      // `redirect: 'manual'` (I1, fix round 1): without it, `fetch` follows
      // a 3xx automatically. Node strips `Authorization` across a
      // cross-origin redirect hop by spec, but `x-api-key` and
      // `x-goog-api-key` are ordinary custom headers and ARE forwarded — a
      // base url that 302s hands the key straight to whatever it redirects
      // to. capture.ts refuses the same way for the same reason.
      redirect: 'manual',
      // Bounded deliberately: a Netlify synchronous function is killed at 10
      // seconds on the default plan, but this file also runs behind Vite's
      // dev server, which has no such ceiling — 25s gives a slower local
      // model (an Ollama server on CPU, say) room without hanging a deployed
      // call indefinitely.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // Never the key in this message. `err` here is a fetch-level failure —
    // DNS, TLS, a refused connection, or the AbortSignal above firing — and
    // never carries the request we sent, only what the network did with it.
    // Redacted anyway (defence in depth, I2): nothing here is expected to
    // contain the key, but nothing here is guaranteed not to either.
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      statusCode: timedOut ? 504 : 502,
      body: timedOut
        ? `model provider (${provider.id}) timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`
        : redactKey(`model call failed: ${err instanceof Error ? err.message : String(err)}`, key),
    };
  }

  // A 3xx is refused, not followed (I1, fix round 1) — see the `redirect:
  // 'manual'` comment above for why. `Response.ok` alone wouldn't catch
  // this (a redirect status also fails `.ok`), but naming it explicitly
  // means the panel's TRANSPORT ERROR line says "redirected", not just
  // "error 302", which is the whole point of readUpstreamError existing.
  //
  // The `location` header is upstream-controlled text, same as any other
  // upstream response — redacted and capped exactly like readUpstreamError's
  // body, its neighbour, for the same reason (fix round 2, item 3: this used
  // to interpolate `location` verbatim, unredacted and uncapped).
  if (upstream.status >= 300 && upstream.status < 400) {
    const rawLocation = upstream.headers.get('location');
    const redactedLocation = rawLocation ? redactKey(rawLocation, key) : undefined;
    const location = redactedLocation && redactedLocation.length <= MAX_ERROR_BODY_CHARS ? redactedLocation : undefined;
    return {
      statusCode: 502,
      body: `model provider (${provider.id}) redirected (${upstream.status}) to ${location ?? 'an undisclosed location'}; not followed`,
    };
  }

  if (!upstream.ok) {
    return { statusCode: 502, body: await readUpstreamError(provider.id, upstream.status, upstream, key) };
  }

  // `adapter.toProxyPlan(raw)` guarded in the SAME try as `upstream.json()`
  // (fix round 2, item 4 — the last unguarded throw in this function, same
  // shape as C2 on the request side). A 200 whose JSON lacks the shape an
  // adapter expects — no `content` array, say — throws out of anthropic.ts
  // ("content is not iterable"), which deployed is an opaque Netlify 500.
  let planBody: string;
  try {
    const raw: unknown = await upstream.json();
    planBody = JSON.stringify(adapter.toProxyPlan(raw));
  } catch (err) {
    return {
      statusCode: 502,
      body: redactKey(
        `model provider (${provider.id}) returned a response that could not be read: ${err instanceof Error ? err.message : 'malformed response'}`,
        key
      ),
    };
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: planBody,
  };
}
