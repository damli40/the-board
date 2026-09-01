import { describe, it, expect, beforeEach } from 'vitest';
import { FactStore } from './facts';
import { Refusal } from '../webmcp/ledger';

describe('FactStore', () => {
  let facts: FactStore;
  beforeEach(() => { facts = new FactStore(); });

  const base = { side: 'A' as const, text: 'The deliverable was accepted on the 4th.', points: { exhibitId: 'E1', locator: { page: 4 } } };

  it('files a fact as unopposed and numbers it F1', () => {
    const f = facts.file(base);
    expect(f.id).toBe('F1');
    expect(f.status).toBe('unopposed');
  });

  it('lets the other side concede', () => {
    const f = facts.file(base);
    expect(facts.concede(f.id, 'B').status).toBe('conceded');
  });

  it('lets the other side dispute', () => {
    const f = facts.file(base);
    expect(facts.dispute(f.id, 'B').status).toBe('disputed');
  });

  it('refuses to let a side concede or dispute its own fact', () => {
    const f = facts.file(base);
    expect(() => facts.concede(f.id, 'A')).toThrow('cannot concede your own fact');
    expect(() => facts.dispute(f.id, 'A')).toThrow('cannot dispute your own fact');
  });

  // Recovery-clause round (finish task): a self-dealing refusal has no
  // retry for the acting side, so the honest next move names who CAN act —
  // never a tool, since there is no "concede on someone else's behalf" tool.
  it('names the other side as the one who can act, not a tool to call again', () => {
    const f = facts.file(base);
    expect(() => facts.concede(f.id, 'A')).toThrow('only B can concede it');
    expect(() => facts.dispute(f.id, 'A')).toThrow('only B can dispute it');

    const g = facts.file({ ...base, side: 'B' });
    expect(() => facts.concede(g.id, 'B')).toThrow('only A can concede it');
    expect(() => facts.dispute(g.id, 'B')).toThrow('only A can dispute it');
  });

  it('records a counter-fact as a pointer, not a separate phase', () => {
    const f = facts.file(base);
    const c = facts.file({ side: 'B', text: 'It was returned on the 5th.', points: { exhibitId: 'E2', locator: {} }, counters: f.id });
    expect(c.counters).toBe('F1');
  });

  it('throws on an unknown fact id', () => {
    expect(() => facts.concede('F9', 'B')).toThrow('no such fact: F9');
  });

  it('says where a real fact id comes from, not a tool to call — file_fact is not held by every actor that can reach this guard', () => {
    expect(() => facts.concede('F9', 'B')).toThrow('use a fact id that was actually filed');
  });

  it('attachDispute links the dispute id and sets status together', () => {
    const f = facts.file(base);
    const linked = facts.attachDispute(f.id, 'D1', 'B');
    expect(linked.status).toBe('disputed');
    expect(linked.disputeId).toBe('D1');
  });

  it('attachDispute refuses when the acting side owns the fact', () => {
    const f = facts.file(base);
    expect(() => facts.attachDispute(f.id, 'D1', 'A')).toThrow('cannot dispute your own fact');
    expect(() => facts.attachDispute(f.id, 'D1', 'A')).toThrow('only B can dispute it');
  });

  it('attachDispute throws on an unknown fact id', () => {
    expect(() => facts.attachDispute('F9', 'D1', 'B')).toThrow('no such fact: F9');
  });

  // -------------------------------------------------------------------
  // Task 5, fix round 2, N1: `facts.ts:34` ("cannot concede your own
  // fact") is one of the finding's own six named sites. The self-dealing
  // guards and the missing-fact guard are the same deliberate-refusal
  // class as impl.ts's own — asserted here as the CLASS, which the message
  // assertions above cannot tell apart from a plain Error with identical
  // text.
  // -------------------------------------------------------------------
  describe('throws Refusal, not a plain Error (fix round 2, N1)', () => {
    it('require: an unknown fact id', () => {
      let err: unknown;
      try { facts.concede('F9', 'B'); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });

    it('concede: your own fact', () => {
      const f = facts.file(base);
      let err: unknown;
      try { facts.concede(f.id, 'A'); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });

    it('dispute: your own fact', () => {
      const f = facts.file(base);
      let err: unknown;
      try { facts.dispute(f.id, 'A'); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });

    it('attachDispute: your own fact', () => {
      const f = facts.file(base);
      let err: unknown;
      try { facts.attachDispute(f.id, 'D1', 'A'); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(Refusal);
    });
  });
});
