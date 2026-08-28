import { describe, it, expect, beforeEach } from 'vitest';
import { PhaseMachine } from './phases';
import { ToolRegistry } from './registry';
import { Ledger } from './ledger';
import { FakeModelContext } from './fakeModelContext';
import { ORIGIN } from '../config/origins';

describe('PhaseMachine', () => {
  let mc: FakeModelContext;
  let phases: PhaseMachine;

  beforeEach(async () => {
    mc = new FakeModelContext();
    const registry = new ToolRegistry(mc, new Ledger(() => 1000), new Proxy({}, { get: () => async () => 'ok' }) as any);
    phases = new PhaseMachine(registry);
    await phases.enter('FILING');
  });

  it('opens filing tools for both sides and nothing for the board', () => {
    // Parties can also read during filing now — dispute requires it. Same tool,
    // different lifetime, different actors (ruling 2: the brief's four-tool
    // expectation was stale).
    expect(mc.visibleTo(ORIGIN.A)).toEqual(['concede', 'dispute', 'file_exhibit', 'file_fact', 'open_exhibit']);
    expect(mc.visibleTo(ORIGIN.seat1)).toEqual([]);
  });

  it('withdraws filing and opens the board when review begins', async () => {
    await phases.enter('REVIEW');
    expect(mc.visibleTo(ORIGIN.A)).toEqual(['object']);
    expect(mc.visibleTo(ORIGIN.seat1)).toEqual(['extract_text', 'open_exhibit', 'record_assessment', 'search_exhibits']);
  });

  it('keeps the board reading while it drafts — boardRead outlives REVIEW', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    const seen = mc.visibleTo(ORIGIN.seat2);
    expect(seen).toContain('open_exhibit');
    expect(seen).toContain('draft_verdict');
  });

  it('hands each side exactly one appeal at verdict', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    expect(mc.visibleTo(ORIGIN.A)).toContain('spend_appeal');
    expect(phases.appealHeld('A')).toBe(true);
  });

  it('takes the card out of the hand that spent it, and only that hand', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    phases.spendAppeal('A');
    expect(mc.visibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.visibleTo(ORIGIN.B)).toContain('spend_appeal');
    expect(phases.appealHeld('A')).toBe(false);
    expect(phases.appealHeld('B')).toBe(true);
  });

  it('does not hand a spent appeal back when the appeal returns us to VERDICT', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    phases.spendAppeal('A');
    await phases.enter('REVIEW');   // the appeal re-opens review
    await phases.enter('VERDICT');  // and we come back
    expect(mc.visibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.visibleTo(ORIGIN.B)).toContain('spend_appeal');
  });

  it('leaves every agent with nothing once confirmed', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    await phases.enter('CONFIRMED');
    for (const o of [ORIGIN.A, ORIGIN.B, ORIGIN.seat1, ORIGIN.seat2]) {
      expect(mc.visibleTo(o)).toEqual([]);
    }
  });
});
