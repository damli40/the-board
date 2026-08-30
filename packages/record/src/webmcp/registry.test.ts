import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from './registry';
import { Ledger } from './ledger';
import { FakeModelContext } from './fakeModelContext';
import { NEVER_GRANTED, TOOLS, bareToolName, registeredToolName, type Lifetime } from './tools';

const LIFETIMES: Lifetime[] = ['filing', 'partyObject', 'boardRead', 'verdictDraft', 'appealA', 'appealB'];
import { ORIGIN } from '../config/origins';

describe('ToolRegistry', () => {
  let mc: FakeModelContext;
  let ledger: Ledger;
  let registry: ToolRegistry;

  beforeEach(() => {
    mc = new FakeModelContext();
    ledger = new Ledger(() => 1000);
    registry = new ToolRegistry(mc, ledger, new Proxy({}, { get: () => async () => 'ok' }) as any);
  });

  it('scopes a filing tool to one origin, so the other side never sees it', async () => {
    await registry.open('filing');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toContain('file_fact');
    expect(mc.capabilitiesVisibleTo(ORIGIN.seat1)).not.toContain('file_fact');
  });

  it('withdraws every tool in a lifetime by aborting its signal', async () => {
    await registry.open('filing');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toContain('file_exhibit');
    registry.close('filing');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).not.toContain('file_exhibit');
  });

  it('withdraws from both sides at the same instant — the visible beat', async () => {
    await registry.open('filing');
    registry.close('filing');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).toEqual([]);
    expect(mc.capabilitiesVisibleTo(ORIGIN.B)).toEqual([]);
  });

  it("grants each side its own appeal, so spending one does not spend the other's", async () => {
    await registry.open('appealA');
    await registry.open('appealB');
    registry.close('appealA');
    expect(mc.capabilitiesVisibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.capabilitiesVisibleTo(ORIGIN.B)).toContain('spend_appeal');
  });

  it('marks every tool untrustedContentHint, per spec layer 2', async () => {
    await registry.open('filing');
    expect(mc.tools.every((t) => t.annotations.untrustedContentHint)).toBe(true);
  });

  it('routes every execution through the ledger', async () => {
    await registry.open('boardRead');
    const tool = mc.tools.find((t) => bareToolName(t.name) === 'open_exhibit' && t.exposedTo.includes(ORIGIN.seat2))!;
    await tool.execute({ exhibitId: 'E1' });
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ open_exhibit: 1 });
  });

  it('projects a manifest whose granted half comes from the registry itself', async () => {
    await registry.open('boardRead');
    const m = registry.manifest('seat2');
    expect(m.granted.map((g) => g.tool).sort()).toEqual(['extract_text', 'open_exhibit', 'record_assessment', 'search_exhibits']);
    expect(m.granted.find((g) => g.tool === 'extract_text')!.lends).toBe(true);
  });

  it('shows live call counts in the manifest', async () => {
    await registry.open('boardRead');
    const tool = mc.tools.find((t) => bareToolName(t.name) === 'record_assessment' && t.exposedTo.includes(ORIGIN.seat1))!;
    await tool.execute({});
    expect(registry.manifest('seat1').granted.find((g) => g.tool === 'record_assessment')!.used).toBe(1);
  });

  it('lists what the board was NOT granted, which is the half doing the work', async () => {
    await registry.open('boardRead');
    const m = registry.manifest('seat2');
    expect(m.notGranted).toContain('file_fact');
    expect(m.notGranted).toContain('confirm');
  });

  it('never grants confirm to anyone, in any lifetime', async () => {
    for (const lifetime of ['filing', 'partyObject', 'boardRead', 'verdictDraft', 'appealA', 'appealB'] as const) {
      await registry.open(lifetime);
    }
    for (const origin of [ORIGIN.A, ORIGIN.B, ORIGIN.seat1, ORIGIN.seat2]) {
      for (const forbidden of NEVER_GRANTED) {
        expect(mc.capabilitiesVisibleTo(origin)).not.toContain(forbidden);
      }
    }
  });

  // ---------------------------------------------------------------------
  // FINAL REVIEW, SHOULD-FIX 6: the manifest used to project INTENT, not
  // the browser.
  //
  // `open()` inserted the abort controller before any `registerTool`
  // resolved, and `registered()` rebuilt the grant list from the catalogue
  // and the set of open lifetimes without ever asking what had actually
  // registered. So a rejected registration (`NotAllowedError` from a
  // Permissions-Policy that does not name the origin is the realistic one)
  // threw out of `open()` mid-loop with no caller catching it, while the
  // record page went on drawing a full GRANTED column for tools that were
  // never registered and the panels correctly reported them as not granted.
  //
  // That failure looks exactly like the boundary working, which is the most
  // dangerous shape a bug can take here.
  // ---------------------------------------------------------------------
  describe('a registration the browser refuses', () => {
    /** Rejects one named tool the way Chrome would, and registers the rest. */
    function refuse(tool: string) {
      const real = mc.registerTool.bind(mc);
      vi.spyOn(mc, 'registerTool').mockImplementation(async (def: any, opts: any) => {
        if (bareToolName(def.name) === tool) {
          const err = new Error(`Permissions-Policy 'tools' does not allow ${opts.exposedTo.join(', ')}`);
          err.name = 'NotAllowedError';
          throw err;
        }
        return real(def, opts);
      });
    }

    it('never appears as a live grant', async () => {
      refuse('extract_text');
      await registry.open('boardRead');

      const granted = registry.manifest('seat2').granted.map((g) => g.tool);
      expect(granted).not.toContain('extract_text');
      // The tools registered alongside it are unaffected: one refusal must
      // not silently strip everything declared after it either.
      expect(granted.sort()).toEqual(['open_exhibit', 'record_assessment', 'search_exhibits']);
    });

    it('is reported, not swallowed, so a missing row cannot pass for a withheld capability', async () => {
      refuse('extract_text');
      await registry.open('boardRead');

      const failures = registry.registrationFailures();
      expect(failures).toHaveLength(2); // one per seat
      expect(failures.map((f) => f.tool)).toEqual(['extract_text', 'extract_text']);
      expect(failures.map((f) => f.origin).sort()).toEqual([ORIGIN.seat1, ORIGIN.seat2].sort());
      expect(failures[0].lifetime).toBe('boardRead');
      expect(failures[0].reason).toContain('Permissions-Policy');
    });

    it('does not reject out of open(), so the page still comes up', async () => {
      refuse('extract_text');
      await expect(registry.open('boardRead')).resolves.toBeUndefined();
    });

    it('reports nothing when every registration succeeds', async () => {
      await registry.open('boardRead');
      expect(registry.registrationFailures()).toEqual([]);
    });

    it('clears its failures when the lifetime closes', async () => {
      refuse('extract_text');
      await registry.open('boardRead');
      expect(registry.registrationFailures()).toHaveLength(2);
      registry.close('boardRead');
      expect(registry.registrationFailures()).toEqual([]);
    });
  });

  it('drops every grant when a lifetime closes, so registered() tracks the browser and not the catalogue', async () => {
    await registry.open('boardRead');
    expect(registry.registered().length).toBeGreaterThan(0);
    registry.close('boardRead');
    expect(registry.registered()).toEqual([]);
  });

  /**
   * The regression suite for the collision found on the first real browser run
   * (Chrome 152, 30 Aug 2026). WebMCP tool names are unique per DOCUMENT. Both
   * advocates were declared with the same five names and both seats with the
   * same six, so Chrome accepted the first actor's copy of each and refused the
   * second's with InvalidStateError. Advocate B and Seat 2 held nothing.
   *
   * Every test here failed before `registeredToolName` existed, and the whole
   * class was invisible because the test double did not enforce uniqueness.
   */
  describe('per-actor tool names', () => {
    it('gives BOTH advocates all five filing capabilities, not just the first one registered', async () => {
      await registry.open('filing');
      const expected = ['concede', 'dispute', 'file_exhibit', 'file_fact', 'open_exhibit'];
      expect(mc.capabilitiesVisibleTo(ORIGIN.A).sort()).toEqual(expected);
      expect(mc.capabilitiesVisibleTo(ORIGIN.B).sort()).toEqual(expected);
    });

    it('gives BOTH seats all their reading capabilities', async () => {
      await registry.open('boardRead');
      const expected = ['extract_text', 'open_exhibit', 'record_assessment', 'search_exhibits'];
      expect(mc.capabilitiesVisibleTo(ORIGIN.seat1).sort()).toEqual(expected);
      expect(mc.capabilitiesVisibleTo(ORIGIN.seat2).sort()).toEqual(expected);
    });

    it('refuses nothing across the whole catalogue, in every lifetime', async () => {
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      // The single assertion that would have caught this on day one.
      expect(registry.registrationFailures()).toEqual([]);
    });

    it('registers every tool under a name unique to the document', async () => {
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      const names = mc.tools.map((t) => t.name);
      expect(names.length).toBe(new Set(names).size);
    });

    it("never lets one actor's registered name reach another actor", async () => {
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      const seen = new Map<string, string>();
      for (const t of mc.tools) for (const o of t.exposedTo) {
        // A registered name is exposed to exactly one origin, so B has no name
        // it could pass to reach A's tool.
        expect(seen.get(t.name) ?? o).toBe(o);
        seen.set(t.name, o);
      }
      expect(mc.visibleTo(ORIGIN.A).some((n) => mc.visibleTo(ORIGIN.B).includes(n))).toBe(false);
      expect(mc.visibleTo(ORIGIN.seat1).some((n) => mc.visibleTo(ORIGIN.seat2).includes(n))).toBe(false);
    });

    it('still shows the bare capability in the manifest, so the display is unchanged', async () => {
      await registry.open('filing');
      for (const actor of ['A', 'B'] as const) {
        expect(registry.manifest(actor).granted.map((g) => g.tool).sort())
          .toEqual(['concede', 'dispute', 'file_exhibit', 'file_fact', 'open_exhibit']);
      }
    });
  });

  /**
   * The double must be no more permissive than Chrome, or it hides this class
   * of bug again. Both behaviours below were verified against Chrome 152.
   */
  describe('the test double matches the browser', () => {
    const def = (name: string) => ({ name, description: 'd', inputSchema: {}, annotations: {}, execute: async () => 'ok' });

    it('rejects a duplicate name while the first is live, as Chrome does', async () => {
      const ac = new AbortController();
      await mc.registerTool(def('dup'), { signal: ac.signal, exposedTo: [ORIGIN.A] });
      await expect(mc.registerTool(def('dup'), { signal: new AbortController().signal, exposedTo: [ORIGIN.B] }))
        .rejects.toThrow(/Duplicate tool name/);
    });

    it('frees the name once the signal aborts, as Chrome does', async () => {
      const ac = new AbortController();
      await mc.registerTool(def('reuse'), { signal: ac.signal, exposedTo: [ORIGIN.A] });
      ac.abort();
      await expect(mc.registerTool(def('reuse'), { signal: new AbortController().signal, exposedTo: [ORIGIN.B] }))
        .resolves.toBeUndefined();
    });
  });

  describe('bareToolName', () => {
    it('strips a known actor prefix', () => {
      expect(bareToolName('a__file_exhibit')).toBe('file_exhibit');
      expect(bareToolName('seat1__record_assessment')).toBe('record_assessment');
    });

    it('leaves an unprefixed name alone, so page-owned controls are unaffected', () => {
      expect(bareToolName('confirm')).toBe('confirm');
      expect(bareToolName('record_assessment')).toBe('record_assessment');
    });

    it('does not truncate a name that merely contains __ without a known prefix', () => {
      expect(bareToolName('zz__weird')).toBe('zz__weird');
    });

    it('round-trips every catalogue name for every actor it is declared for', () => {
      for (const spec of TOOLS) for (const actor of spec.actors) {
        expect(bareToolName(registeredToolName(actor, spec.name))).toBe(spec.name);
      }
    });
  });

});
