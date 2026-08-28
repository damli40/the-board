import { describe, it, expect, beforeEach } from 'vitest';
import { Receipts } from './receipts';
import { DisputeStore } from './disputes';
import { ExhibitStore } from './exhibits';
import type { DisputeInput } from './disputes';

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

  it('refuses a dispute whose quote is not in the exhibit', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, quote: 'a clause about editing' }))
      .toThrow('quote not found in E1 at the given locator');
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
      .toThrow('no such exhibit: E9');
  });

  it('reports what the locator actually got wrong, not a generic quote-not-found', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, locator: { page: 9 } }))
      .toThrow('E1 has no page 9');
  });

  it('reports the empty-quote reason, not a generic quote-not-found', () => {
    receipts.markOpened('B', 'E1');
    expect(() => disputes.record({ ...good, quote: '   ' }))
      .toThrow('an empty quote proves nothing');
  });

  it('accepts a dispute against an image exhibit but labels it human-check rather than proven', async () => {
    await exhibits.add({ side: 'A', kind: 'image', name: 's.png', bytes: bytes('PNG'), filedAt: '2026-08-20T09:01:00Z' });
    receipts.markOpened('B', 'E2');
    const d = disputes.record({ ...good, exhibitId: 'E2', quote: 'the timestamp reads 21:00' });
    expect(d.verified).toBe('human-check');
  });
});
