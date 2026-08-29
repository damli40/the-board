import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExhibitStore } from './exhibits';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

describe('ExhibitStore', () => {
  let store: ExhibitStore;
  beforeEach(() => { store = new ExhibitStore(); });

  it('assigns sequential ids starting at E1', async () => {
    const a = await store.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('one'), filedAt: '2026-08-20T09:00:00Z' });
    const b = await store.add({ side: 'B', kind: 'text', name: 'b.txt', bytes: bytes('two'), filedAt: '2026-08-20T09:01:00Z' });
    expect([a.id, b.id]).toEqual(['E1', 'E2']);
  });

  it('hashes content, so identical bytes hash identically', async () => {
    const a = await store.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('same'), filedAt: '2026-08-20T09:00:00Z' });
    const b = await store.add({ side: 'B', kind: 'text', name: 'b.txt', bytes: bytes('same'), filedAt: '2026-08-20T09:01:00Z' });
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('decodes text exhibits into searchable text', async () => {
    const e = await store.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('line one\nline two'), filedAt: '2026-08-20T09:00:00Z' });
    expect(e.text).toBe('line one\nline two');
  });

  it('leaves image text null, because nothing machine-readable exists', async () => {
    const e = await store.add({ side: 'A', kind: 'image', name: 'shot.png', bytes: bytes('\x89PNG'), filedAt: '2026-08-20T09:00:00Z' });
    expect(e.text).toBeNull();
  });

  it('records how a capture was obtained', async () => {
    const e = await store.add({
      side: 'B', kind: 'capture', name: 'policy page', bytes: bytes('terms'),
      sourceUrl: 'https://example.test/terms', captured: 'proxy-fetch',
      filedAt: '2026-08-20T09:02:00Z'
    });
    expect(e.captured).toBe('proxy-fetch');
    expect(e.sourceUrl).toBe('https://example.test/terms');
  });

  // Fix round 1, Important 3: covers a real IndexedDB failing, which
  // requires stubbing `globalThis.indexedDB` — neither vitest project has
  // a real one (see the `hasIndexedDB` comment in exhibits.ts), so
  // `hasIndexedDB()` reads false and the store just uses its in-memory
  // fallback for every other test in this file. These stubs make it read
  // true, then fail on purpose, to exercise the two paths review flagged.
  describe('IndexedDB failure handling', () => {
    afterEach(() => { delete (globalThis as { indexedDB?: unknown }).indexedDB; });

    it('falls back to the in-memory map when opening IndexedDB fails, instead of bricking storage for the rest of the session', async () => {
      (globalThis as { indexedDB?: unknown }).indexedDB = {
        open: () => {
          const req: { onerror?: () => void; onsuccess?: () => void; error?: Error } = {};
          queueMicrotask(() => { req.error = new Error('could not open database'); req.onerror?.(); });
          return req;
        },
      };

      const failingStore = new ExhibitStore();
      const exhibit = await failingStore.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' });
      expect(exhibit.id).toBe('E1');

      // Not bricked: a SECOND operation after the failed open still works,
      // reading back from the memory fallback rather than re-throwing the
      // same cached rejection forever.
      const back = await failingStore.bytesOf('E1');
      expect(back).toBeDefined();
      expect(new TextDecoder().decode(back!)).toBe('hello');
    });

    it('does not publish an exhibit into all() when storing its bytes fails, even after IndexedDB opened successfully', async () => {
      const fakeDb = {
        transaction: () => {
          const tx: { objectStore: () => { put: () => void }; onerror?: () => void; oncomplete?: () => void; error?: Error } = {
            objectStore: () => ({ put: () => {} }),
          };
          queueMicrotask(() => { tx.error = new Error('quota exceeded'); tx.onerror?.(); });
          return tx;
        },
      };
      (globalThis as { indexedDB?: unknown }).indexedDB = {
        open: () => {
          const req: { onsuccess?: () => void; result?: unknown } = {};
          queueMicrotask(() => { req.result = fakeDb; req.onsuccess?.(); });
          return req;
        },
      };

      const failingStore = new ExhibitStore();
      await expect(
        failingStore.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' })
      ).rejects.toThrow('quota exceeded');

      // The exhibit must not exist in a state where the record claims it
      // was filed but its bytes are nowhere to be found.
      expect(failingStore.all()).toEqual([]);
    });
  });
});
