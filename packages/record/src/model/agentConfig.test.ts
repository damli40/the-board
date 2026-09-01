import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadConfigs,
  saveConfigs,
  redactKey,
  buildActorConfig,
  modelConfigMessageFor,
  modelConfigDeliveries,
  CONFIG_STORAGE_KEY,
  ROOM_CODE_STORAGE_KEY,
  type AgentConfigs,
} from './agentConfig';
import type { Actor } from './types';

/** A minimal, throwing-on-demand Storage double — used to prove `loadConfigs`
 *  and `saveConfigs` survive the `SecurityError` a browser with site data
 *  blocked throws on the mere ACCESS to sessionStorage, not just a failing
 *  read/write (loop.ts's `roomCodeHeader()` is the precedent this follows). */
class ThrowingStorage implements Storage {
  get length(): number { throw new DOMException('blocked', 'SecurityError'); }
  clear(): void { throw new DOMException('blocked', 'SecurityError'); }
  getItem(): string | null { throw new DOMException('blocked', 'SecurityError'); }
  key(): string | null { throw new DOMException('blocked', 'SecurityError'); }
  removeItem(): void { throw new DOMException('blocked', 'SecurityError'); }
  setItem(): void { throw new DOMException('blocked', 'SecurityError'); }
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

describe('CONFIG_STORAGE_KEY / ROOM_CODE_STORAGE_KEY', () => {
  it('are the literal strings loop.ts already reads and writes', () => {
    // ROOM_CODE_STORAGE_KEY must match the literal 'board:roomCode' loop.ts
    // hardcodes in roomCodeHeader() — this constant does not rename it.
    expect(ROOM_CODE_STORAGE_KEY).toBe('board:roomCode');
    expect(CONFIG_STORAGE_KEY).toBe('board:agentConfig');
  });
});

describe('redactKey', () => {
  // Fix round 1, M1: an empty key used to also read '(set)' — the UI
  // claiming a key exists when it does not. Unreachable through Save
  // (buildActorConfig omits the whole config for an empty key), reachable
  // through a stale/malformed sessionStorage value once I10's loadConfigs
  // validation lets a `key: ''` string through as a structurally valid
  // (if empty) config.
  it('returns (none) for an empty key, never (set)', () => {
    expect(redactKey('')).toBe('(none)');
  });

  it('returns (set) for a non-empty key shorter than 16 characters', () => {
    expect(redactKey('short')).toBe('(set)');
    expect(redactKey('123456789012345')).toBe('(set)'); // 15 chars
  });

  it('shows at most the first 7 and last 4 characters for a 16+ char key', () => {
    // 'sk-ant-' is 7 chars, '9f2a' is 4 — exactly the brief's own example.
    expect(redactKey('sk-ant-api03-abcdefg9f2a')).toBe('sk-ant-...9f2a');
  });

  it('never returns the full key, however long it is', () => {
    const key = 'sk-ant-api03-' + 'x'.repeat(80) + '-END';
    const redacted = redactKey(key);
    expect(redacted).not.toContain(key);
    expect(redacted.length).toBeLessThan(key.length);
    // Only the declared first-7 / last-4 slices may appear, joined by '...'.
    expect(redacted).toBe(`${key.slice(0, 7)}...${key.slice(-4)}`);
  });

  it('reveals nothing from the middle of the key', () => {
    const key = 'sk-ant-MIDDLE-SECRET-SEGMENT-abcd';
    const redacted = redactKey(key);
    expect(redacted).not.toContain('MIDDLE-SECRET-SEGMENT');
  });
});

describe('buildActorConfig — the hazard gate', () => {
  it('is undefined when the key is empty, even with a provider and base URL set', () => {
    const config = buildActorConfig({ provider: 'openai-compatible', model: 'llama-3', key: '', baseUrl: 'http://a-strangers-host.example' });
    expect(config).toBeUndefined();
  });

  it('is undefined when the key is whitespace only', () => {
    const config = buildActorConfig({ provider: 'anthropic', model: '', key: '   ', baseUrl: '' });
    expect(config).toBeUndefined();
  });

  it('builds a real config, trimmed, once a key is present', () => {
    const config = buildActorConfig({ provider: 'anthropic', model: '  claude-opus-5  ', key: '  sk-ant-real-key  ', baseUrl: '' });
    expect(config).toEqual({ provider: 'anthropic', model: 'claude-opus-5', key: 'sk-ant-real-key' });
  });

  it('omits baseUrl entirely (not as an empty string) when it is blank', () => {
    const config = buildActorConfig({ provider: 'anthropic', model: '', key: 'sk-ant-real-key', baseUrl: '   ' });
    expect(config).toBeDefined();
    expect('baseUrl' in (config as object)).toBe(false);
  });

  it('carries baseUrl through, trimmed, only when the key is also present', () => {
    const config = buildActorConfig({
      provider: 'openai-compatible',
      model: 'llama-3',
      key: 'a-real-key',
      baseUrl: '  http://localhost:11434  ',
    });
    expect(config).toEqual({ provider: 'openai-compatible', model: 'llama-3', key: 'a-real-key', baseUrl: 'http://localhost:11434' });
  });
});

describe('loadConfigs / saveConfigs', () => {
  let store: MemoryStorage;
  beforeEach(() => { store = new MemoryStorage(); });

  it('round-trips through the given store under CONFIG_STORAGE_KEY', () => {
    const configs: AgentConfigs = { A: { provider: 'anthropic', model: 'claude-opus-5', key: 'sk-ant-real-key' } };
    saveConfigs(configs, store);
    expect(JSON.parse(store.getItem(CONFIG_STORAGE_KEY)!)).toEqual(configs);
    expect(loadConfigs(store)).toEqual(configs);
  });

  it('returns {} from an empty store', () => {
    expect(loadConfigs(store)).toEqual({});
  });

  it('returns {} for corrupted (non-object) JSON rather than throwing', () => {
    store.setItem(CONFIG_STORAGE_KEY, '"just a string"');
    expect(loadConfigs(store)).toEqual({});
    store.setItem(CONFIG_STORAGE_KEY, 'not even json{{{');
    expect(loadConfigs(store)).toEqual({});
  });

  // Fix round 1, I10: the whole-value check (`typeof parsed === 'object'`)
  // let a shape-drifted per-actor entry straight through with no field
  // validation at all. `Setup.tsx`'s `statusText` then calls
  // `redactKey(config.key)` on whatever came back — `redactKey(undefined)`
  // throws on `.length`, with no error boundary anywhere above it, so a
  // single malformed entry white-screened the whole record page, not just
  // the setup form. These pin the fix: a bad entry is dropped, not passed
  // through, and it does not take good entries down with it.
  it('drops a per-actor entry that is a shape drift (an empty object) instead of crashing on it later', () => {
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ A: {} }));
    expect(loadConfigs(store)).toEqual({});
    // The actual failure mode this closes: redactKey on whatever a naive
    // cast would have handed back throws on `undefined.length`. Proving the
    // loaded value never gets there is the real assertion.
    const loaded = loadConfigs(store);
    expect(() => redactKey((loaded.A as { key?: string } | undefined)?.key ?? '')).not.toThrow();
  });

  it('drops an entry with the wrong field types (a shape a hand-edit or format change could produce)', () => {
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ A: { provider: 123, model: null, key: 'k' } }));
    expect(loadConfigs(store)).toEqual({});
  });

  it('drops an entry that is not an object at all', () => {
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ A: 'not an object' }));
    expect(loadConfigs(store)).toEqual({});
  });

  it('drops only the bad entry, keeping every well-formed sibling', () => {
    store.setItem(
      CONFIG_STORAGE_KEY,
      JSON.stringify({
        A: {},
        B: { provider: 'openai', model: 'gpt-5', key: 'sk-a-real-key-value-here' },
      })
    );
    expect(loadConfigs(store)).toEqual({ B: { provider: 'openai', model: 'gpt-5', key: 'sk-a-real-key-value-here' } });
  });

  it('rejects a baseUrl of the wrong type but otherwise-valid fields', () => {
    store.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ A: { provider: 'anthropic', model: '', key: 'k', baseUrl: 42 } }));
    expect(loadConfigs(store)).toEqual({});
  });

  it('loadConfigs survives a SecurityError from a store that throws on access, returning {}', () => {
    expect(() => loadConfigs(new ThrowingStorage())).not.toThrow();
    expect(loadConfigs(new ThrowingStorage())).toEqual({});
  });

  it('saveConfigs survives a SecurityError from a store that throws on write, without throwing', () => {
    expect(() => saveConfigs({ A: { provider: 'anthropic', model: '', key: 'k' } }, new ThrowingStorage())).not.toThrow();
  });

  it('never touches localStorage', () => {
    const setSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const getSpy = vi.spyOn(globalThis.localStorage, 'getItem');
    const configs: AgentConfigs = { A: { provider: 'anthropic', model: '', key: 'sk-ant-a-real-secret-key' } };
    saveConfigs(configs, store);
    loadConfigs(store);
    expect(setSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('defaults to sessionStorage (not localStorage) when no store is given', () => {
    globalThis.sessionStorage.removeItem(CONFIG_STORAGE_KEY);
    const setSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const configs: AgentConfigs = { B: { provider: 'openai', model: 'gpt-5', key: 'sk-a-real-secret-key' } };
    saveConfigs(configs);
    expect(setSpy).not.toHaveBeenCalled();
    expect(JSON.parse(globalThis.sessionStorage.getItem(CONFIG_STORAGE_KEY)!)).toEqual(configs);
    expect(loadConfigs()).toEqual(configs);
    setSpy.mockRestore();
    globalThis.sessionStorage.removeItem(CONFIG_STORAGE_KEY);
  });
});

describe('modelConfigMessageFor — per-frame delivery, no cross-actor leakage', () => {
  const configs: AgentConfigs = {
    A: { provider: 'anthropic', model: 'claude-opus-5', key: 'sk-ant-AAAA-secret-for-A' },
    B: { provider: 'openai', model: 'gpt-5', key: 'sk-BBBB-secret-for-B' },
  };

  it("gives A's message A's own config only", () => {
    const message = modelConfigMessageFor('A', configs, 'board-demo-2026');
    expect(message).toEqual({ type: 'board:model-config', config: configs.A, roomCode: 'board-demo-2026' });
    expect(JSON.stringify(message)).not.toContain('sk-BBBB-secret-for-B');
  });

  it("gives B's message B's own config only, not A's", () => {
    const message = modelConfigMessageFor('B', configs, 'board-demo-2026');
    expect(message).toEqual({ type: 'board:model-config', config: configs.B, roomCode: 'board-demo-2026' });
    expect(JSON.stringify(message)).not.toContain('sk-ant-AAAA-secret-for-A');
  });

  it('gives an actor with no saved config an explicit absence, not a borrowed one', () => {
    const message = modelConfigMessageFor('seat1', configs, 'board-demo-2026');
    expect(message.config).toBeUndefined();
    expect(JSON.stringify(message)).not.toContain('secret-for-A');
    expect(JSON.stringify(message)).not.toContain('secret-for-B');
  });

  it('carries the same room code to every actor (it is a shared, non-secret value)', () => {
    for (const actor of ['A', 'B', 'seat1', 'seat2'] as const) {
      expect(modelConfigMessageFor(actor, configs, 'board-demo-2026').roomCode).toBe('board-demo-2026');
    }
  });

  it('always names its own type literal', () => {
    expect(modelConfigMessageFor('A', configs, 'x').type).toBe('board:model-config');
  });
});

// Fix round 1, I11: nothing anywhere asserted the security-critical property
// of the delivery loop — one message PER ACTOR, each to THAT actor's own
// real origin, never a wildcard. `modelConfigMessageFor` (above) cannot fail
// this on its own; it has no say over `targetOrigin`. This block is what
// would have caught a regression that changed the loop to `postMessage(msg,
// '*')` or that broadcast one shared message to every frame.
describe('modelConfigDeliveries — I11: the security-critical targetOrigin, tested directly (no DOM, no mock)', () => {
  const actors: Actor[] = ['A', 'B', 'seat1', 'seat2'];
  const origins: Record<Actor, string> = {
    A: 'http://localhost:8081',
    B: 'http://localhost:8082',
    seat1: 'http://localhost:8083',
    seat2: 'http://localhost:8084',
  };
  const configs: AgentConfigs = {
    A: { provider: 'anthropic', model: 'claude-opus-5', key: 'sk-ant-a-real-key-value-9f2a' },
  };

  it('builds exactly one delivery per actor, in the given order', () => {
    const deliveries = modelConfigDeliveries(actors, configs, 'board-demo-2026', origins);
    expect(deliveries).toHaveLength(4);
    expect(deliveries.map((d) => d.actor)).toEqual(actors);
  });

  it("targets each actor's own real origin, never a wildcard", () => {
    const deliveries = modelConfigDeliveries(actors, configs, 'board-demo-2026', origins);
    for (const d of deliveries) {
      expect(d.targetOrigin).toBe(origins[d.actor]);
      expect(d.targetOrigin).not.toBe('*');
    }
  });

  it('every delivery targets a distinct origin — four separate frames, never one shared broadcast', () => {
    const deliveries = modelConfigDeliveries(actors, configs, 'board-demo-2026', origins);
    const targets = new Set(deliveries.map((d) => d.targetOrigin));
    expect(targets.size).toBe(4);
  });

  it("each delivery's message carries only that actor's own config", () => {
    const deliveries = modelConfigDeliveries(actors, configs, 'board-demo-2026', origins);
    const forA = deliveries.find((d) => d.actor === 'A')!;
    const forB = deliveries.find((d) => d.actor === 'B')!;
    expect(forA.message.config).toEqual(configs.A);
    expect(forB.message.config).toBeUndefined();
    expect(JSON.stringify(forB.message)).not.toContain('sk-ant-a-real-key-value-9f2a');
  });
});
