import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseMachine } from './phases';
import { ToolRegistry } from './registry';
import { Ledger } from './ledger';
import { FakeModelContext } from './fakeModelContext';
import { ORIGIN } from '../config/origins';
import { bareToolName } from './tools';

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
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toEqual(['concede', 'dispute', 'file_exhibit', 'file_fact', 'open_exhibit']);
    expect(mc.capabilitiesVisibleTo(ORIGIN.seat1)).toEqual([]);
  });

  it('withdraws filing and opens the board when review begins', async () => {
    await phases.enter('REVIEW');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toEqual(['object']);
    expect(mc.capabilitiesVisibleTo(ORIGIN.seat1)).toEqual(['extract_text', 'open_exhibit', 'record_assessment', 'search_exhibits']);
  });

  it('keeps the board reading while it drafts — boardRead outlives REVIEW', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    const seen = mc.capabilitiesVisibleTo(ORIGIN.seat2);
    expect(seen).toContain('open_exhibit');
    expect(seen).toContain('draft_verdict');
  });

  it('hands each side exactly one appeal at verdict', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toContain('spend_appeal');
    expect(phases.appealHeld('A')).toBe(true);
  });

  it('takes the card out of the hand that spent it, and only that hand', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    phases.spendAppeal('A');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.capabilitiesVisibleTo(ORIGIN.B)).toContain('spend_appeal');
    expect(phases.appealHeld('A')).toBe(false);
    expect(phases.appealHeld('B')).toBe(true);
  });

  it('does not hand a spent appeal back when the appeal returns us to VERDICT', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    phases.spendAppeal('A');
    await phases.enter('REVIEW');   // the appeal re-opens review
    await phases.enter('VERDICT');  // and we come back
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.capabilitiesVisibleTo(ORIGIN.B)).toContain('spend_appeal');
  });

  it('leaves every agent with nothing once confirmed', async () => {
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    await phases.enter('CONFIRMED');
    for (const o of [ORIGIN.A, ORIGIN.B, ORIGIN.seat1, ORIGIN.seat2]) {
      expect(mc.capabilitiesVisibleTo(o)).toEqual([]);
    }
  });

  // Final review, Should-fix 6, one surface over from the manifest. The
  // appeal card in the hand is a drawn capability, so it must read what the
  // browser actually granted. `isOpen` cannot answer that: `open()` inserts
  // the abort controller BEFORE any registration resolves, so a lifetime
  // whose every `registerTool` was refused is still "open" and grants
  // nothing. Drawing off `isOpen` would put a face-up `spend_appeal x1` in
  // A's hand for a tool A does not hold.
  it('does not show an appeal the browser refused to register', async () => {
    const refusingMc = new FakeModelContext();
    const real = refusingMc.registerTool.bind(refusingMc);
    vi.spyOn(refusingMc, 'registerTool').mockImplementation(async (def: any, opts: any) => {
      if (bareToolName(def.name) === 'spend_appeal' && opts.exposedTo.includes(ORIGIN.A)) {
        const err = new Error("Permissions-Policy 'tools' does not allow this origin");
        err.name = 'NotAllowedError';
        throw err;
      }
      return real(def, opts);
    });

    const registry = new ToolRegistry(refusingMc, new Ledger(() => 1000), new Proxy({}, { get: () => async () => 'ok' }) as any);
    const machine = new PhaseMachine(registry);
    await machine.enter('VERDICT');

    expect(machine.appealHeld('A')).toBe(false);
    expect(machine.appealSpent('A')).toBe(false); // refused, not spent
    expect(refusingMc.capabilitiesVisibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    // B's appeal registered normally and is unaffected.
    expect(machine.appealHeld('B')).toBe(true);
    // And the refusal is reported rather than left to be inferred.
    expect(registry.registrationFailures().map((f) => f.tool)).toEqual(['spend_appeal']);

    vi.restoreAllMocks();
  });

  it('still shows an appeal that registered normally', async () => {
    await phases.enter('VERDICT');
    expect(phases.appealHeld('A')).toBe(true);
    expect(phases.appealHeld('B')).toBe(true);
    phases.spendAppeal('A');
    expect(phases.appealHeld('A')).toBe(false);
    expect(phases.appealHeld('B')).toBe(true);
  });
});
