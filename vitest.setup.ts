import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Node 22+ ships its own global `localStorage`, gated behind
 * `--localstorage-file <path>` to actually persist anything. Without that
 * flag (which nothing in this repo's scripts passes), Node still defines the
 * global — `typeof globalThis.localStorage === 'object'` — but every method
 * on it throws "is not a function". jsdom (the actual DOM implementation
 * this project's jsdom test project runs against) has its own, fully working
 * per-window Storage instance, but Node's own global property is defined
 * directly on the shared global object jsdom/vitest populates INTO, and it
 * wins: `window.localStorage === globalThis.localStorage` is Node's broken
 * one, not jsdom's. `sessionStorage` has no such flag requirement and is
 * unaffected — this is `localStorage`-only.
 *
 * `Masthead.tsx`'s theme toggle (Task 3) is the first thing in this repo to
 * touch `localStorage`, which is what surfaces this — nothing before it ever
 * called a method on the broken global. Repaired here, once, for the whole
 * jsdom project, rather than worked around per test file: this is a defect
 * in the test environment, not in the component under test, and the fix
 * belongs where the rest of this project's environment setup already lives.
 *
 * `MemoryStorage` is a MINIMAL stand-in, not a full Storage polyfill (fix
 * round 1, M9) — a test that depends on any of the following would pass
 * here and could still fail in a real browser: property-style access
 * (`localStorage.foo = 'bar'`, which real `Storage` intercepts via a Proxy
 * and this class does not), a `StorageEvent` firing on other same-origin
 * tabs/windows when a value changes (never dispatched here), or a
 * `QuotaExceededError` once storage fills up (this class has no cap and
 * never throws one). None of that is exercised by anything in this repo
 * today; noted so a future test that needs one of these doesn't assume it
 * works.
 *
 * The whole block is wrapped in try/catch: a stricter host than this
 * repo's own dev machines could define `localStorage` as a THROWING getter
 * (a locked-down embed, for instance) rather than a broken-but-readable
 * object, in which case even `typeof globalThis.localStorage?.setItem`
 * would throw before the check below ever finishes. Degrading silently here
 * — rather than crashing every test file at setup, before any test gets to
 * run at all — means the failure mode for that host is "the tests that
 * actually touch localStorage fail on their own assertion", which is a far
 * clearer signal than a setup-time exception with no test name attached to
 * it. The identical guard is applied in `vitest.setup.node.ts`.
 */
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
  // See the comment above: a throwing localStorage getter degrades silently
  // rather than taking every test file down before it can run.
}

// This project's test files import `describe`/`it`/`expect` explicitly from
// 'vitest' rather than relying on `test.globals` (see vitest.config.ts — no
// `globals: true` is set for either project). @testing-library/react's
// auto-cleanup detects a test framework by looking for a GLOBAL `afterEach`,
// so without this it silently never runs: every `render()` in a file stays
// mounted into the same jsdom `document` for the rest of that file, and the
// next test's query matches every previous test's leftover markup too
// (`getByTestId` throws "found multiple elements", `getAllByTestId` returns
// duplicates). Task 8 is the first task to add a `.test.tsx` file, which is
// why this was unnoticed until now — registering cleanup explicitly here
// makes every test file get an isolated DOM per test, present and future,
// without each file having to remember to import it.
afterEach(() => cleanup());
