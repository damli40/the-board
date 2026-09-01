import { describe, it, expect, beforeEach } from 'vitest';
import { Receipts } from './receipts';
import { DisputeStore } from './disputes';
import { ExhibitStore } from './exhibits';
import type { DisputeInput } from './disputes';
import { Refusal } from '../webmcp/ledger';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const TEXT = 'The rules page as published contains no clause about editing after the deadline.';

describe('DisputeStore', () => {
  let receipts: Receipts;
  let exhibits: ExhibitStore;
  let disputes: DisputeStore;
  let good: DisputeInput;

  beforeEach(async () => {
    receipts = new Receipts();
    exhibits = new ExhibitStore();
    await exhibits.add({
      side: 'A', kind: 'rule', name: 'rules.txt',
      bytes: bytes(TEXT), filedAt: '2026-08-20T09:00:00Z'
    });
    disputes = new DisputeStore(exhibits, receipts);
    good = {
      factId: 'F1', by: 'B', exhibitId: 'E1',
      locator: {}, quote: 'no clause about editing after the deadline',
      because: 'The clause it relies on is not in the published page.'
    };
  });

  it('refuses a dispute from a party that never opened the exhibit', () => {
    expect(() => disputes.record(good)).toThrow('B has not opened E1');
  });

  // Recovery-clause round (finish task): open_exhibit is held by ['A','B']
  // in this same lifetime (filing), so it is safe to name as the next move.
  it('tells the refused party the next move: call open_exhibit first', () => {
    expect(() => disputes.record(good)).toThrow('call open_exhibit first');
  });

  it('refuses a dispute whose quote is not in the exhibit', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, quote: 'a clause about editing' }))
      .toThrow('quote not found in E1 at the given locator; check the exact wording and the locator');
  });

  it('accepts a dispute backed by a read and a real quote', () => {
    receipts.markOpened('B', 'E1');
    const d = disputes.record(good);
    expect(d.id).toBe('D1');
    expect(d.verified).toBe('machine-checked');
    expect(d.by).toBe('B');
  });

  it('tracks reads per actor, so A opening it does not license B', () => {
    receipts.markOpened('A', 'E1');
    expect(() => disputes.record(good)).toThrow('B has not opened E1');
  });

  it('reports the dispute held against a fact', () => {
    receipts.markOpened('B', 'E1');
    const d = disputes.record(good);
    expect(disputes.forFact('F1')?.id).toBe(d.id);
    expect(disputes.forFact('F9')).toBeUndefined();
  });

  it('throws on an unknown exhibit using the same string AssessmentStore uses', () => {
    receipts.markOpened('B', 'E9');
    expect(() => disputes.record({ ...good, exhibitId: 'E9' }))
      .toThrow('no such exhibit: E9; use an exhibit id that was actually filed');
  });

  it('reports what the locator actually got wrong, not a generic quote-not-found', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, locator: { page: 9 } }))
      .toThrow('E1 has no page 9; check the locator against the exhibit');
  });

  it('reports the empty-quote reason, not a generic quote-not-found', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, quote: '   ' }))
      .toThrow('an empty quote proves nothing; quote the exact passage relied on');
  });

  it('accepts a dispute against an image exhibit but labels it human-check rather than proven', async () => {
    await exhibits.add({ side: 'A', kind: 'image', name: 's.png', bytes: bytes('PNG'), filedAt: '2026-08-20T09:01:00Z' });
    receipts.markOpened('B', 'E2');
    const d = disputes.record({ ...good, exhibitId: 'E2', quote: 'the timestamp reads 21:00' });
    expect(d.verified).toBe('human-check');
  });

  // -------------------------------------------------------------------
  // Task 5, fix round 2, N1: this store's guards fire on the demo's
  // central beat ("the seat tried to dispute a document it never read,
  // and the record refused") — they must throw `Refusal`, not a plain
  // `Error`, or they render as a machinery failure with a retry button
  // that only fails again. Same three guards the tests above already
  // exercise by message; this asserts the CLASS, which a message-substring
  // check alone cannot tell apart from a plain Error with the same text.
  // -------------------------------------------------------------------
  describe('throws Refusal, not a plain Error (fix round 2, N1)', () => {
    it('the read-receipt gate', () => {
      let err: unknown;
      try { disputes.record(good); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });

    it('the unknown-exhibit guard', () => {
      receipts.markOpened('B', 'E9');
      let err: unknown;
      try { disputes.record({ ...good, exhibitId: 'E9' }); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });

    it('the quote-verification guard', () => {
      receipts.markOpened('B', 'E1');
      let err: unknown;
      try { disputes.record({ ...good, quote: 'a clause about editing' }); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });
  });
});
