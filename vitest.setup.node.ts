// Node (22+) ships a built-in `navigator` global as a getter-only accessor
// with no setter. Vitest test files run as strict-mode ESM, where assigning
// to an accessor with no setter throws `TypeError: Cannot set property
// navigator of #<Object> which has only a getter` instead of the silent
// no-op it would be in sloppy mode. Several tests in this project need to
// stub `globalThis.navigator` (see packages/record/src/webmcp/env.test.ts).
// Redefining it as a plain writable data property here, once, before any
// test file runs, makes `globalThis.navigator = ...` behave the way every
// test in this codebase assumes it does.
Object.defineProperty(globalThis, 'navigator', {
  value: globalThis.navigator,
  writable: true,
  configurable: true,
  enumerable: true,
});

// Fix round 1, M9: the identical `localStorage` guard `vitest.setup.ts`
// carries for the jsdom project — see that file's comment for the full
// explanation (Node 22+'s own global `localStorage`, broken without
// `--localstorage-file`, and a MemoryStorage stand-in with no property-style
// access, no `StorageEvent` and no `QuotaExceededError`). Nothing in this
// project's `node`-environment (*.test.ts) tests touches `localStorage`
// today, but a module imported by both projects could start to, and this
// keeps the node project from being the one place that silently regresses.
try {
  if (typeof globalThis.localStorage?.setItem !== 'function') {
    class MemoryStorage implements Storage {
      private store = new Map<string, string>();
      get length() { return this.store.size; }
      clear() { this.store.clear(); }
      getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
      key(index: number) { return [...this.store.keys()][index] ?? null; }
      removeItem(key: string) { this.store.delete(key); }
      setItem(key: string, value: string) { this.store.set(key, String(value)); }
    }
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
  }
} catch {
  // A throwing localStorage getter degrades silently rather than taking
  // every node-project test file down before it can run.
}
