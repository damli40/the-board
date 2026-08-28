import { describe, it, expect, beforeEach } from 'vitest';
import { Receipts, AssessmentStore } from './receipts';
import { ExhibitStore } from './exhibits';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

describe('the read-receipt chain', () => {
  let receipts: Receipts;
  let exhibits: ExhibitStore;
  let assessments: AssessmentStore;

  beforeEach(async () => {
    receipts = new Receipts();
    exhibits = new ExhibitStore();
    assessments = new AssessmentStore(exhibits, receipts);
    await exhibits.add({
      side: 'A', kind: 'text', name: 'a.txt',
      bytes: bytes('No objection was raised within the window.'),
      filedAt: '2026-08-20T09:00:00Z'
    });
  });

  const good = {
    seat: 'seat1' as const, factId: 'F1', exhibitId: 'E1', locator: {},
    finding: 'supported' as const,
    quote: 'No objection was raised',
    because: 'The exhibit states it directly.'
  };

  it('refuses an assessment of an exhibit this seat never opened', () => {
    expect(() => assessments.record(good))
      .toThrow('seat1 has not opened E1');
  });

  it('accepts the assessment once the exhibit has been opened', () => {
    receipts.markOpened('seat1', 'E1');
    const a = assessments.record(good);
    expect(a.id).toBe('AS1');
    expect(a.verified).toBe('machine-checked');
  });

  it('refuses an assessment whose quote is not in the exhibit', () => {
    receipts.markOpened('seat1', 'E1');
    expect(() => assessments.record({ ...good, quote: 'An objection was raised' }))
      .toThrow('quote not found in E1 at the given locator');
  });

  it('tracks reads per seat, so one seat opening it does not license the other', () => {
    receipts.markOpened('seat1', 'E1');
    expect(() => assessments.record({ ...good, seat: 'seat2' }))
      .toThrow('seat2 has not opened E1');
  });

  it('reports what a seat opened, for the verdict', () => {
    receipts.markOpened('seat2', 'E1');
    expect(receipts.openedBy('seat2')).toEqual(['E1']);
    expect(receipts.openedBy('seat1')).toEqual([]);
  });

  it('does not double-count a repeated read', () => {
    receipts.markOpened('seat1', 'E1');
    receipts.markOpened('seat1', 'E1');
    expect(receipts.openedBy('seat1')).toEqual(['E1']);
  });

  it('holds no citation licence until an assessment exists', () => {
    expect(assessments.heldFor('seat1', 'F1')).toBe(false);
    receipts.markOpened('seat1', 'E1');
    assessments.record(good);
    expect(assessments.heldFor('seat1', 'F1')).toBe(true);
    expect(assessments.heldFor('seat2', 'F1')).toBe(false);
  });

  it('accepts an image assessment but labels it human-check rather than proven', async () => {
    await exhibits.add({ side: 'A', kind: 'image', name: 's.png', bytes: bytes('PNG'), filedAt: '2026-08-20T09:01:00Z' });
    receipts.markOpened('seat1', 'E2');
    const a = assessments.record({ ...good, exhibitId: 'E2', quote: 'the timestamp reads 21:00' });
    expect(a.verified).toBe('human-check');
  });

  it('throws on an unknown exhibit rather than accepting a citation into nothing', () => {
    receipts.markOpened('seat1', 'E9');
    expect(() => assessments.record({ ...good, exhibitId: 'E9' }))
      .toThrow('no such exhibit: E9');
  });

  it('widens receipts to Actor, so a party (not just a seat) can hold a read too', () => {
    receipts.markOpened('A', 'E1');
    expect(receipts.hasOpened('A', 'E1')).toBe(true);
    expect(receipts.hasOpened('B', 'E1')).toBe(false);
    expect(receipts.openedBy('A')).toEqual(['E1']);
  });
});
