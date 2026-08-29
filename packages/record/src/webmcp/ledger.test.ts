import { describe, it, expect } from 'vitest';
import { Ledger } from './ledger';
import { ORIGIN } from '../config/origins';

describe('Ledger', () => {
  it('counts calls per origin and tool', async () => {
    const ledger = new Ledger(() => 1000);
    const run = ledger.wrap(ORIGIN.seat2, 'open_exhibit', async () => 'ok');
    await run({});
    await run({});
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ open_exhibit: 2 });
  });

  it('keeps origins separate, which is what the split beat reads from', async () => {
    const ledger = new Ledger(() => 1000);
    await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
    await ledger.wrap(ORIGIN.seat2, 'extract_text', async () => 'ok')({});
    expect(ledger.countsFor(ORIGIN.seat1)).toEqual({ open_exhibit: 1 });
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ extract_text: 1 });
  });

  it('records a refusal too — the refusal is evidence, not an error to swallow', async () => {
    const ledger = new Ledger(() => 1000);
    const run = ledger.wrap(ORIGIN.seat1, 'record_assessment', async () => {
      throw new Error('quote not found in E1 at the given locator');
    });
    await expect(run({})).rejects.toThrow('quote not found');
    expect(ledger.all()).toEqual([{
      origin: ORIGIN.seat1, tool: 'record_assessment', at: 1000,
      ok: false, detail: 'quote not found in E1 at the given locator'
    }]);
  });

  it('returns an empty count for an origin that has done nothing', () => {
    expect(new Ledger(() => 1000).countsFor(ORIGIN.A)).toEqual({});
  });

  // Task 8 fix round 1, Critical: a panel's tool call runs through Chrome's
  // own cross-origin machinery, not through any call the record page's React
  // tree makes — so the record page can only ever learn "a receipt landed"
  // by subscribing to the ledger itself. These tests are the covering test
  // for that fix: they prove the seam exists and fires correctly, which is
  // as much of it as a unit test can reach (App.tsx's actual `refresh()`
  // wiring is UI, out of this task's unit-test scope by its own stated
  // limit).
  describe('subscribe', () => {
    it('notifies a listener when a successful call lands — the seam Docket\'s ledger tape and Manifest\'s call counts both need', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      ledger.subscribe(() => { notified += 1; });
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(notified).toBe(1);
    });

    it('notifies on a refusal too — a refusal landing is exactly as much "a receipt landing" as a success', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      ledger.subscribe(() => { notified += 1; });
      const run = ledger.wrap(ORIGIN.seat2, 'confirm', async () => { throw new Error('not implemented'); });
      await expect(run({})).rejects.toThrow('not implemented');
      expect(notified).toBe(1);
    });

    it('notifies every subscriber, once per entry, in the order entries land', async () => {
      const ledger = new Ledger(() => 1000);
      const seen: number[] = [];
      ledger.subscribe(() => seen.push(1));
      ledger.subscribe(() => seen.push(2));
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(seen).toEqual([1, 2]);
    });

    it('stops notifying once unsubscribed', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      const unsubscribe = ledger.subscribe(() => { notified += 1; });
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      unsubscribe();
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(notified).toBe(1);
    });
  });
});
