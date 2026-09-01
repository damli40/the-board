// Task 2a — the setup form's data model: what a per-actor model config looks
// like, where it lives (sessionStorage, never anything else), and how the
// four per-frame delivery messages are built.
//
// This file has exactly one job that the rest of the form exists to serve:
// make it STRUCTURALLY impossible to hand a provider or base URL to a frame
// without a key riding alongside it. `handler.ts` (the model proxy) 400s a
// caller that sends `x-model-provider` or `x-model-base-url` without
// `x-model-key` — that refusal is what stops a stranger routing this site's
// own funded key at a host of their choosing. A `<select>` always has a
// value, so a naive form always has a provider to send even when the key
// field is empty. `buildActorConfig` below is the one place that decides
// whether an actor's config exists at all: an empty key means no entry, not
// an entry with an empty key.
import type { Actor } from './types';

export interface AgentModelConfig {
  provider: string;
  model: string;
  key: string;
  baseUrl?: string;
}

/** What an actor is absent from means "no key configured for this actor" —
 *  never "a key of length zero." See `buildActorConfig`. */
export type AgentConfigs = Partial<Record<Actor, AgentModelConfig>>;

export const CONFIG_STORAGE_KEY = 'board:agentConfig';

/**
 * loop.ts's `roomCodeHeader()` already reads and writes this literal string
 * on the PANEL's own origin — sessionStorage is per-origin, so this constant
 * does not share a physical store between the record and a panel; it shares
 * a NAME, so the same concept is never spelled two different ways across the
 * two packages that both touch it. Reuse it here (the record's own copy of
 * the room-code field persists across a reload of the record page itself);
 * do not rename it.
 */
export const ROOM_CODE_STORAGE_KEY = 'board:roomCode';

/**
 * Fix round 1, I10: `loadConfigs` used to check only `typeof parsed ===
 * 'object'` on the WHOLE parsed value, then cast straight to `AgentConfigs`
 * with no per-actor validation at all. A stored `{"A":{}}` — a shape drift
 * between this task and the one that reads this same key next, a partial
 * write, a hand-edited value — passed that one check and came back out
 * as-is; `Setup.tsx`'s `statusText` then called `redactKey(undefined)`,
 * which throws on `key.length`, with no error boundary anywhere above it —
 * one malformed sessionStorage value white-screened the entire record page,
 * not just the setup form. Every field this type promises is checked here;
 * an actor whose stored shape does not match is dropped rather than passed
 * through, the same "fail toward absent, never toward crashing" shape
 * `buildActorConfig` already uses for the no-key case.
 */
function isValidConfig(value: unknown): value is AgentModelConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.provider !== 'string' || typeof v.model !== 'string' || typeof v.key !== 'string') return false;
  if (v.baseUrl !== undefined && typeof v.baseUrl !== 'string') return false;
  return true;
}

/**
 * Reads whatever `saveConfigs` last wrote, from `sessionStorage` by default.
 * `store` is injectable for tests and so the exact same function can be
 * pointed at a different origin's `sessionStorage` (a panel, in the task
 * that consumes this).
 *
 * Merely touching `sessionStorage` throws a `SecurityError` in a browser
 * with site data blocked entirely (a locked-down embed, some privacy
 * modes) — not just a failing read. `loop.ts`'s `roomCodeHeader()` sets the
 * precedent this follows: wrap the whole access, degrade to the empty
 * config rather than letting the exception propagate into whatever called
 * this expecting a plain object back.
 */
export function loadConfigs(store?: Storage): AgentConfigs {
  try {
    const s = store ?? globalThis.sessionStorage;
    const raw = s?.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: AgentConfigs = {};
    for (const [actor, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidConfig(value)) result[actor as Actor] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Writes to `sessionStorage` only — never `localStorage`, which survives a
 * closed tab and is the one thing every non-negotiable in this file exists
 * to keep a key out of. Best-effort: a store that throws on write (the same
 * `SecurityError` case `loadConfigs` guards) leaves the in-memory React
 * state as the only copy for the rest of this page load, which is a strictly
 * smaller failure than crashing the setup form.
 */
export function saveConfigs(configs: AgentConfigs, store?: Storage): void {
  try {
    const s = store ?? globalThis.sessionStorage;
    s?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // See loadConfigs's comment: degrade silently, never throw out of a save.
  }
}

/** Raw form-field values for one actor's row, before the key gate below decides
 *  whether they become a real `AgentModelConfig` at all. */
export interface AgentConfigFields {
  provider: string;
  model: string;
  key: string;
  baseUrl: string;
}

/**
 * The one choke point every path that can produce an `AgentModelConfig`
 * must go through. Returns `undefined` — not an object with `key: ''` —
 * whenever the key field is blank, so a caller that only ever assigns the
 * return value into an `AgentConfigs` record (never assigns unconditionally)
 * cannot end up with an actor entry that carries a provider or base URL and
 * no key. That is the exact shape `handler.ts`'s gate 6 exists to refuse,
 * and this is what keeps the setup form from ever being able to construct
 * it in the first place, rather than relying on the network layer to catch
 * it after the fact.
 */
export function buildActorConfig(fields: AgentConfigFields): AgentModelConfig | undefined {
  const key = fields.key.trim();
  if (!key) return undefined;
  const config: AgentModelConfig = { provider: fields.provider, model: fields.model.trim(), key };
  const baseUrl = fields.baseUrl.trim();
  if (baseUrl) config.baseUrl = baseUrl;
  return config;
}

/**
 * `redactKey('sk-ant-api03-Xyz...9f2a')` reads `sk-ant-...9f2a` — at most the
 * first 7 and last 4 characters, joined by a fixed `...`, never the key
 * itself. Anything shorter than 16 characters (and non-empty) returns the
 * fixed string `'(set)'` instead of a slice: a short "key" is more likely a
 * placeholder or a typo than a real secret, and slicing a 10-character
 * string down to "first 7 + last 4" would reveal all but one character of
 * it, which is not what "redacted" is supposed to mean.
 *
 * Fix round 1, M1: an EMPTY key used to also read `'(set)'` — the UI
 * claiming a key exists when it does not. `buildActorConfig` never lets an
 * empty key reach here through Save (it returns `undefined` for the whole
 * config instead), so this was unreachable through the form; it became
 * reachable once `loadConfigs` (I10) started validating field TYPES rather
 * than rejecting the whole entry, since `key: ''` is a valid string and
 * would otherwise pass through and land here. `'(none)'` says plainly that
 * the field the stored config carries is blank, rather than implying a key
 * that is not there.
 */
export function redactKey(key: string): string {
  if (!key) return '(none)';
  if (key.length < 16) return '(set)';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/**
 * Task 2a, part 3 (delivery): the exact message one frame receives. Called
 * once per actor, in a loop in `App.tsx` that also supplies that actor's own
 * `ORIGIN[actor]` as `targetOrigin` — never `'*'`, and this function is the
 * reason the payload can never leak: `configs[actor]` reads only that one
 * actor's entry out of the whole record, so a message built for `B` cannot
 * physically contain `A`'s key, `A`'s provider or anything else that came
 * from another actor's row. `roomCode` is the one field every frame is
 * meant to receive identically — it is a shared demo password already
 * public in this repo (`DEMO_ROOM_CODE`, config/origins.ts), not a secret
 * scoped to one actor.
 */
export interface ModelConfigMessage {
  type: 'board:model-config';
  config?: AgentModelConfig;
  roomCode: string;
}

export function modelConfigMessageFor(actor: Actor, configs: AgentConfigs, roomCode: string): ModelConfigMessage {
  return { type: 'board:model-config', config: configs[actor], roomCode };
}

/**
 * Fix round 1, I11: nothing anywhere asserted that the per-frame delivery
 * loop posts to `ORIGIN[actor]` rather than `'*'`, or that it produces four
 * SEPARATE messages rather than one shared broadcast — `modelConfigMessageFor`
 * above was well tested, but that function has no say over `targetOrigin`;
 * only the loop that calls `postMessage` does, and that loop lived inline in
 * `App.tsx` where nothing could reach it without mocking a real
 * `HTMLIFrameElement`'s `contentWindow`.
 *
 * Pulled out here as a pure, DOM-free function so the security-critical
 * property — one message per actor, each one's own real origin, never a
 * wildcard — can be asserted directly, with no DOM or mock in the way.
 * `App.tsx`'s `broadcastModelConfig` now just iterates this function's
 * return value and calls `postMessage`; it no longer decides `targetOrigin`
 * itself, so a future edit that changes it to `'*'` breaks a test here, not
 * only in a browser nobody happened to check.
 */
export interface FrameDelivery {
  actor: Actor;
  targetOrigin: string;
  message: ModelConfigMessage;
}

export function modelConfigDeliveries(
  actors: Actor[],
  configs: AgentConfigs,
  roomCode: string,
  origins: Record<Actor, string>
): FrameDelivery[] {
  return actors.map((actor) => ({
    actor,
    targetOrigin: origins[actor],
    message: modelConfigMessageFor(actor, configs, roomCode),
  }));
}
