import { describe, it, expect, beforeEach } from 'vitest';
import { FactStore } from './facts';

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

  it('records a counter-fact as a pointer, not a separate phase', () => {
    const f = facts.file(base);
    const c = facts.file({ side: 'B', text: 'It was returned on the 5th.', points: { exhibitId: 'E2', locator: {} }, counters: f.id });
    expect(c.counters).toBe('F1');
  });

  it('throws on an unknown fact id', () => {
    expect(() => facts.concede('F9', 'B')).toThrow('no such fact: F9');
  });
});
