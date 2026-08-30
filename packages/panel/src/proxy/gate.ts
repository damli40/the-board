// Who may spend the provider key.
//
// This lives in src/ rather than inside netlify/functions/ for the same
// reason `anthropic.ts` does: vitest only collects from packages/*/src, so
// anything written in the functions folder has no tests. The function is a
// thin wire; every decision that can reject a request is made here, where a
// test can reach it.
//
// WHAT THIS IS NOT. This is not the boundary the project is about. The
// boundary the project is about is `exposedTo`, enforced by the browser,
// deciding what an agent may do once it is in the room. This file answers a
// different and much older question: who may open the room at all. Keeping
// the two apart matters — conflating "allowed in" with "allowed to act" is
// exactly the confusion The Board exists to make visible.
//
// WHY IT EXISTS. `model-proxy` holds MODEL_API_KEY and calls the Messages
// API. Before this file, it accepted any POST from anyone, with the caller
// supplying `system` and `messages`. Deployed with a funded key, that is a
// free Opus endpoint on the owner's account, four times over (one per panel
// site). It read as safe only because the account had no credit, which is a
// property of the billing state, not of the code.
//
// Everything here is DEFENCE IN DEPTH except `checkRoomCode`. The real
// ceiling on spend is set at the provider, not here: see docs/evidence/
// deploy.md. A stateless function cannot count reliably (below).

/** Header the panel sends the room code in. Imported by the browser too, so
 *  nothing in this file may touch node: builtins. */
export const ROOM_CODE_HEADER = 'x-room-code';

export type GateResult = { ok: true } | { ok: false; statusCode: number; body: string };

const OK: GateResult = { ok: true };

/**
 * Length-independent comparison, written by hand rather than with
 * `crypto.timingSafeEqual` because this module is also bundled into the
 * browser (loop.ts imports ROOM_CODE_HEADER) and a `node:crypto` import
 * would break `vite build`.
 *
 * The early length return leaks the code's LENGTH and nothing else, which is
 * the standard trade and is not worth padding around for a demo room code.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The gate that actually holds.
 *
 * FAILS CLOSED when ROOM_CODE is unset. A deploy that forgets the variable
 * refuses every request loudly, rather than quietly reverting to the open
 * endpoint this file was written to close. A broken demo is recoverable in
 * a minute; a drained account is not.
 */
export function checkRoomCode(supplied: string | undefined, expected: string | undefined): GateResult {
  if (!expected || expected.trim() === '') {
    return { ok: false, statusCode: 500, body: 'proxy not configured: ROOM_CODE is unset' };
  }
  if (!supplied) {
    return { ok: false, statusCode: 401, body: 'room code required' };
  }
  return constantTimeEquals(supplied, expected)
    ? OK
    : { ok: false, statusCode: 401, body: 'room code rejected' };
}

/**
 * Origin allowlist. DEFENCE IN DEPTH ONLY — never describe this as security.
 *
 * A missing Origin is ALLOWED on purpose. Browsers send Origin on every POST,
 * including same-origin ones, but non-browser clients send nothing, and a
 * curl with no Origin is exactly the caller this check cannot stop anyway.
 * Rejecting on absence would break legitimate clients while stopping no
 * attacker, since Origin is trivially set by anyone not using a browser.
 * What this does buy: a page on some other site cannot quietly drive this
 * endpoint from a visitor's browser.
 */
export function checkOrigin(origin: string | undefined, allowed: readonly string[]): GateResult {
  if (!origin) return OK;
  return allowed.includes(origin) ? OK : { ok: false, statusCode: 403, body: 'origin not allowed' };
}

export interface RateState {
  windowStart: number;
  count: number;
}

export const EMPTY_RATE_STATE: RateState = { windowStart: 0, count: 0 };

/**
 * A fixed-window counter.
 *
 * ⚠️ READ THIS BEFORE TRUSTING IT. Netlify functions are stateless between
 * invocations and run in many containers at once. Module-level state is
 * per-container, so N containers enforce N × `limit`, not `limit`. This
 * bounds a runaway client and a single-source flood. It is NOT a global
 * ceiling and must never be written up as one.
 *
 * The global ceiling belongs at the provider — a spend limit on the API key
 * itself — because that is the only place with one consistent view of the
 * spend. Doing it properly in-process would need Netlify Blobs, which is an
 * untested dependency this close to the deadline.
 *
 * Pure: takes state, returns the next state, so the test drives the clock.
 */
export function checkRate(
  state: RateState,
  now: number,
  limit: number,
  windowMs: number
): { result: GateResult; state: RateState } {
  // `state.count === 0` is what opens the FIRST window. Without it, an empty
  // state's `windowStart: 0` anchors the window to the epoch: the first call
  // is only "fresh" once `now >= windowMs`. With a real `Date.now()` that is
  // always true, so this looked correct in production and was wrong for any
  // small clock — including every test that drives one.
  const fresh = state.count === 0 || now - state.windowStart >= windowMs;
  const next: RateState = fresh ? { windowStart: now, count: 1 } : { ...state, count: state.count + 1 };

  if (next.count > limit) {
    // Do not advance the count past the limit: a client hammering a closed
    // gate must not push the window's end further away for everyone else.
    return {
      result: { ok: false, statusCode: 429, body: 'rate limit reached for this window' },
      state: { ...next, count: limit + 1 },
    };
  }
  return { result: OK, state: next };
}
