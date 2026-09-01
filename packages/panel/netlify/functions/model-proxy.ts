import type { Handler } from '@netlify/functions';
import { handleProxy, type ProxyEnv } from '../../src/proxy/handler';

// Holds the provider key server-side so it never ships in client code — the
// repo is public (CLAUDE.md §0 "No secrets in client code"). One deployment
// of this function per panel origin, each with its own MODEL_API_KEY set in
// that Netlify site's environment, never in a file checked into the repo.
// Task 1 adds a second way to supply a key: a caller can bring their own via
// the `x-model-key` header, and it beats this site's own — see handler.ts,
// gate order step 5, for which one wins and why that is safe (checkRoomCode
// still runs regardless, ruling 6: a caller-supplied key changes whose
// account is billed, not whether a public endpoint may be driven by
// strangers). Fix round 1, C1: bringing your own key is also what UNLOCKS
// choosing your own provider or base URL — see step 6 in handler.ts.
//
// This function is defence in depth, not the layer that actually holds. The
// layer that holds is Task 4: `exposedTo` scoping WebMCP tools to an origin,
// enforced by the browser. Keeping the key off the client stops it leaking
// through the bundle; it does not by itself decide what a seat may do.
//
// FINAL REVIEW, BLOCKER 1 (kept from the pre-BYOK version of this file): this
// function used to forward `event.body` upstream verbatim and return the
// upstream body verbatim. It translated nothing in either direction, and the
// panel speaks a shape no provider accepts or returns, so deployed it would
// have failed silently: the panel showing a goal line and then nothing. Both
// translations still happen at the boundary — now in `src/proxy/handler.ts`
// and its per-provider wire adapters (`anthropic.ts`, `openai.ts`,
// `google.ts`), so tests can reach them.
//
// This file itself is now a thin shell (task 1, §1d): read process.env,
// adapt Netlify's event shape to handleProxy's plain ProxyInput/ProxyEnv,
// return what it says. Every gate, every status code and every env var is
// documented in handler.ts, which is where they actually execute now — this
// file should not need to change when a gate's reasoning changes, and
// letting comments drift apart between two files that both claim to explain
// the same gate is exactly the class of defect this project keeps finding
// (see Ruling 4 on the phase rail,
// docs/superpowers/plans/2026-08-31-the-board-finish.md).
//
// Environment (see handler.ts for the full resolution order of each):
//   MODEL_API_KEY   (optional) this site's own provider key. A caller's own
//                   x-model-key header beats it. Absent AND no header -> 503.
//   MODEL_PROVIDER  (optional) defaults to 'anthropic'.
//   MODEL_ID        (optional) defaults to the provider's own default model.
//                   x-model-id is allowed from ANY caller, key or no key.
//   MODEL_BASE_URL  (optional) pins the base URL for THIS SITE'S OWN key
//                   only — outranks the provider's own default when no
//                   caller key is in play. A caller who brings their own key
//                   is never routed through it (fix round 2, item 2, revising
//                   round 1's C1 fix: routing a caller's own key through the
//                   operator's pin sent it to the operator's gateway instead
//                   of the provider's real endpoint). Whoever owns the key
//                   decides where it goes.
//   ROOM_CODE       (REQUIRED) the shared code a caller must present in the
//                   `x-room-code` header. Absent means this function refuses
//                   every request — see gate.ts on failing closed. Required
//                   in every key mode, never bypassed by a caller's own key.
//   RATE_LIMIT      (optional) requests per window per container, default 60.
//
// ⚠️ x-model-provider and x-model-base-url are ONLY honoured from a caller
// who ALSO sends x-model-key (fix round 1, C1 — the headline finding of the
// first review). Without that pairing, a caller could point this SITE'S OWN
// key at an arbitrary host with nothing but the room code — and the demo
// room code is committed to a public repo. A caller who sends a targeting
// header with no key of their own is refused with 400, not silently ignored.
// See handler.ts's gate-order comment (steps 5-8) for the exact resolution.
//
// ⚠️ THE REAL CEILING IS NOT IN THIS FILE. Set a spend limit on the API key
// in the provider's console. A stateless function running in many containers
// cannot count globally; handler.ts's rate limiter bounds one container,
// nothing more, and docs/evidence/deploy.md says so too.
export const handler: Handler = async (event) => {
  const env: ProxyEnv = {
    ROOM_CODE: process.env.ROOM_CODE,
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    MODEL_ID: process.env.MODEL_ID,
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
    MODEL_BASE_URL: process.env.MODEL_BASE_URL,
    RATE_LIMIT: process.env.RATE_LIMIT,
    // Never true here. This is a public, deployed endpoint; a local dev
    // server (Ollama, LM Studio) reachable at a private address is a
    // dev-only convenience — see vite.config.ts's dev middleware, the one
    // place this is allowed to flip.
    allowPrivateHosts: false,
  };

  return handleProxy(
    {
      method: event.httpMethod,
      headers: (event.headers ?? {}) as Record<string, string | undefined>,
      body: event.body ?? null,
    },
    env
  );
};
