import { describe, it, expect, beforeEach } from 'vitest';
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
});
