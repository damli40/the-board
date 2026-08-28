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
});
