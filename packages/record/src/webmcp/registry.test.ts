import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from './registry';
import { PhaseMachine } from './phases';
import { Ledger } from './ledger';
import { FakeModelContext } from './fakeModelContext';
import { NEVER_GRANTED, OBSERVER_LABEL, OBSERVER_ORIGIN, TOOLS, LIFETIME_WINDOW, PHASE_ORDER, bareToolName, registeredToolName, type Lifetime } from './tools';
import type { Phase } from '../model/types';

const LIFETIMES: Lifetime[] = ['filing', 'partyRead', 'partyObject', 'boardRead', 'verdictDraft', 'appealA', 'appealB'];
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
    const tool = mc.tools.find((t) => bareToolName(t.name) === 'open_exhibit' && t.exposedTo?.includes(ORIGIN.seat2))!;
    await tool.execute({ exhibitId: 'E1' });
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ open_exhibit: 1 });
  });

  it('projects a manifest whose granted half comes from the registry itself', async () => {
    await registry.open('boardRead');
    const m = registry.manifest('seat2');
    expect(m.granted.map((g) => g.tool).sort()).toEqual(['extract_text', 'open_exhibit', 'read_board', 'record_assessment', 'search_exhibits']);
    expect(m.granted.find((g) => g.tool === 'extract_text')!.lends).toBe(true);
  });

  it('shows live call counts in the manifest', async () => {
    await registry.open('boardRead');
    const tool = mc.tools.find((t) => bareToolName(t.name) === 'record_assessment' && t.exposedTo?.includes(ORIGIN.seat1))!;
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
    for (const lifetime of LIFETIMES) {
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
      expect(granted.sort()).toEqual(['open_exhibit', 'read_board', 'record_assessment', 'search_exhibits']);
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
      const expected = ['extract_text', 'open_exhibit', 'read_board', 'record_assessment', 'search_exhibits'];
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
      // Uniqueness ALONE is vacuous: the double rejects duplicates, so
      // `mc.tools` can never hold one, and this passed against the very bug it
      // was written for. The count is what makes it real — one registration
      // per (actor, tool) pair declared in the catalogue, none dropped.
      const expected = TOOLS.reduce((n, spec) => n + spec.actors.length, 0);
      expect(names.length).toBe(expected);
      expect(new Set(names).size).toBe(expected);
    });

    it("never lets one actor's registered name reach another actor", async () => {
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      const seen = new Map<string, string>();
      for (const t of mc.tools) for (const o of t.exposedTo ?? []) {
        // A registered name is exposed to exactly one origin, so B has no name
        // it could pass to reach A's tool.
        expect(seen.get(t.name) ?? o).toBe(o);
        seen.set(t.name, o);
      }
      // Disjointness ALONE is vacuous — an actor holding NOTHING shares nothing,
      // which is exactly the bug. Assert both sides are non-empty first.
      for (const o of [ORIGIN.A, ORIGIN.B, ORIGIN.seat1, ORIGIN.seat2]) {
        expect(mc.visibleTo(o).length).toBeGreaterThan(0);
      }
      expect(mc.visibleTo(ORIGIN.A).some((n) => mc.visibleTo(ORIGIN.B).includes(n))).toBe(false);
      expect(mc.visibleTo(ORIGIN.seat1).some((n) => mc.visibleTo(ORIGIN.seat2).includes(n))).toBe(false);
    });

    /**
     * The trap the per-actor name does NOT close. Names are unique per
     * document, and two lifetimes can be open at once: boardRead runs REVIEW
     * through VERDICT, and verdictDraft opens during VERDICT, both for the
     * seats. Today no tool name appears in both, so nothing collides. Nothing
     * in the type system says it has to stay that way, and the failure would
     * look exactly like the bug just fixed: the second registration refused,
     * one actor quietly holding less than the manifest implies.
     */
    it('never declares one capability twice for the same actor in overlapping lifetimes', () => {
      // Every lifetime per key, and every PAIR of them. Keeping only the last
      // one seen compared each declaration against its immediate predecessor
      // only, which let the very collision this test names — boardRead and
      // verdictDraft, both seats, overlapping at VERDICT — slip through
      // whenever a third declaration sat between them in array order.
      const declared = new Map<string, Lifetime[]>();
      for (const spec of TOOLS) for (const actor of spec.actors) {
        const key = `${actor}::${spec.name}`;
        const list = declared.get(key) ?? [];
        if (!list.includes(spec.lifetime)) list.push(spec.lifetime);
        declared.set(key, list);
      }
      const idx = (ph: Phase) => PHASE_ORDER.indexOf(ph);
      for (const [key, lifetimes] of declared) {
        for (let i = 0; i < lifetimes.length; i++) {
          for (let j = i + 1; j < lifetimes.length; j++) {
            const a = LIFETIME_WINDOW[lifetimes[i]], b = LIFETIME_WINDOW[lifetimes[j]];
            const overlaps = idx(a.startsAt) <= idx(b.endsAfter) && idx(b.startsAt) <= idx(a.endsAfter);
            expect(overlaps, `${key} is declared in both ${lifetimes[i]} and ${lifetimes[j]}, whose phase windows overlap — the second registration would be refused as a duplicate name`).toBe(false);
          }
        }
      }
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
    it('rejects registration on an already-aborted signal, as Chrome does', async () => {
      const ac = new AbortController();
      ac.abort();
      await expect(mc.registerTool(def('already-gone'), { signal: ac.signal, exposedTo: [ORIGIN.A] }))
        .rejects.toThrow(/aborted/);
      // And it left nothing behind: a resolve here used to strand a tool live
      // forever, because 'abort' never fires on an already-aborted signal.
      expect(mc.visibleTo(ORIGIN.A)).toEqual([]);
    });
  });

  /**
   * `registerTool` is real browser IPC, so `open()` has a genuine await window
   * per tool and `close()` can land inside it. Nothing serialises phase
   * transitions: App.tsx fires `enter()` without awaiting, and spend_appeal
   * fires `enter('REVIEW')` from a detached timeout. The realistic collision is
   * an agent spending its appeal as the human confirms.
   */
  describe('a lifetime closed while its registrations are in flight', () => {
    it('writes no grants, so the manifest never shows what the browser dropped', async () => {
      let reachedGate!: () => void;
      const reached = new Promise<void>((r) => { reachedGate = r; });
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });

      const real = mc.registerTool.bind(mc);
      let n = 0;
      vi.spyOn(mc, 'registerTool').mockImplementation(async (d: any, o: any) => {
        if (n++ === 1) { reachedGate(); await gate; }
        return real(d, o);
      });

      const opening = registry.open('filing');
      await reached;            // we are now inside the await window
      registry.close('filing'); // ... and the phase moves under us
      release();
      await opening;

      expect(registry.isOpen('filing')).toBe(false);
      expect(registry.registered()).toEqual([]);
      expect(registry.manifest('A').granted).toEqual([]);
      expect(registry.manifest('B').granted).toEqual([]);
      // Nothing would ever clear a stale entry either: close() only runs when
      // isOpen is true, so a lie written here outlives every later phase.
      expect(registry.registrationFailures()).toEqual([]);
      vi.restoreAllMocks();
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

  /**
   * Task 4: `read_board` now exists TWICE — once as the observer's unscoped
   * registration, once as a party-scoped spec under the `partyRead` lifetime.
   * They are separate registrations under separate names, and this is what
   * proves it: the party's is withdrawn when the case closes, the observer's
   * is not. `mc.tools` keeps a row for every registration ever made and only
   * flips `live` when the signal aborts, so every assertion here reads the
   * LIVE set — the withdrawn row is still in the array.
   */
  it('partyRead hands read_board to A and B from FILING through VERDICT and withdraws it at CONFIRMED', async () => {
    const phases = new PhaseMachine(registry);
    await registry.openObserver(() => ({}));
    const live = () => mc.tools.filter((t) => t.live).map((t) => t.name);

    await phases.enter('FILING');
    expect(live()).toContain('a__read_board');
    expect(live()).toContain('b__read_board');
    await phases.enter('REVIEW');
    await phases.enter('VERDICT');
    expect(live()).toContain('a__read_board');
    await phases.enter('CONFIRMED');
    expect(live()).not.toContain('a__read_board');
    expect(live()).not.toContain('b__read_board');
    expect(live()).toContain('read_board'); // the observer keeps its own
  });

  /**
   * The seats' own read, under `boardRead` — which is the seats' reading
   * window, REVIEW through VERDICT, and not a phase longer. They are the
   * readers asked to assess the parties' facts, and `record_assessment`
   * takes a `factId` that nothing else in a seat's hand returns; without
   * this a seat has to infer the fact ids from the exhibits and hope. They
   * still do not read during FILING: the parties are mid-filing, and the
   * seats' whole hand arrives at REVIEW together.
   */
  it('boardRead hands read_board to both seats in REVIEW and VERDICT, and never in FILING', async () => {
    const phases = new PhaseMachine(registry);
    await registry.openObserver(() => ({}));
    const live = () => mc.tools.filter((t) => t.live).map((t) => t.name);
    const SEAT_READS = ['seat1__read_board', 'seat2__read_board'];

    await phases.enter('FILING');
    for (const n of SEAT_READS) expect(live(), `${n} was live during FILING`).not.toContain(n);
    // The parties' read is live in FILING, so an empty seat read here is the
    // lifetime doing its job and not the registration having failed.
    expect(live()).toContain('a__read_board');
    expect(live()).toContain('b__read_board');
    expect(live()).toContain('read_board');

    await phases.enter('REVIEW');
    for (const n of SEAT_READS) expect(live()).toContain(n);
    expect(live()).toContain('read_board');

    await phases.enter('VERDICT');
    for (const n of SEAT_READS) expect(live()).toContain(n);
    expect(live()).toContain('read_board');

    await phases.enter('CONFIRMED');
    for (const n of SEAT_READS) expect(live()).not.toContain(n);
    // The observer's unprefixed registration outlives all four phases; it is
    // the one read that never depended on a lifetime.
    expect(live()).toContain('read_board');
  });

  describe('the visiting agent', () => {
    // An agent driving this page from outside — Chrome's built-in one, or me —
    // is not one of the four panel origins, so `exposedTo` hands it nothing.
    // OBSERVER_TOOLS is the deliberate exception, and these are the rules that
    // keep the exception safe.

    it('holds nothing at all until the observer set is opened', async () => {
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      expect(mc.visibleToBuiltInAgent()).toEqual([]);
    });

    it('can read the board once the observer set is opened', async () => {
      await registry.openObserver(() => ({ phase: 'FILING' }));
      expect(mc.visibleToBuiltInAgent()).toEqual(['read_board']);
    });

    it('🚨 NEVER registers anything that can change the record', async () => {
      // The load-bearing test. A missing `exposedTo` is the WIDEST registration
      // this codebase makes, and read-only is the only thing making it safe. If
      // someone ever adds a mutating tool to OBSERVER_TOOLS, or drops
      // `exposedTo` from a phase tool, this fails.
      await registry.openObserver(() => ({}));
      for (const lifetime of LIFETIMES) await registry.open(lifetime);

      const unscoped = mc.tools.filter((t) => t.exposedTo === undefined);
      expect(unscoped.length).toBeGreaterThan(0);
      for (const t of unscoped) {
        expect(t.annotations.readOnlyHint, `${t.name} is reachable by any visiting agent`).toBe(true);
      }
    });

    it('🚨 every phase tool is still scoped to exactly one origin', async () => {
      // The other half: the observer set must not have loosened anything that
      // was already scoped.
      await registry.openObserver(() => ({}));
      for (const lifetime of LIFETIMES) await registry.open(lifetime);

      const phaseTools = mc.tools.filter((t) => t.name !== 'read_board');
      expect(phaseTools.length).toBeGreaterThan(0);
      for (const t of phaseTools) {
        expect(t.exposedTo, `${t.name} lost its origin scope`).toBeDefined();
        expect(t.exposedTo).toHaveLength(1);
      }
    });

    it('is invisible to all four panels, which is what keeps the partition true', async () => {
      await registry.openObserver(() => ({}));
      for (const lifetime of LIFETIMES) await registry.open(lifetime);
      // Task 4 put a SECOND `read_board` in the catalogue, scoped to A and B,
      // so the bare capability name is no longer the right thing to look for
      // — A legitimately holds a read of its own. What must stay unreachable
      // is the OBSERVER'S registration, and that one is identified by its
      // REGISTERED name: it is the only tool on the page registered without
      // an actor prefix, because it is the only one registered without an
      // origin scope. `visibleTo` returns registered names; `read_board`
      // appearing there for a panel would mean the unscoped grant leaked.
      for (const actor of ['A', 'B', 'seat1', 'seat2'] as const) {
        expect(mc.visibleTo(ORIGIN[actor])).not.toContain('read_board');
      }
      // CHANGED: the seats used to hold no read of any kind, and this
      // asserted the BARE capability name was absent for them. They hold a
      // scoped read now, so that assertion would only re-state the loop
      // above. What must stay true is stronger and is asserted instead: each
      // seat reaches its OWN registration and nobody else's — never the
      // observer's unprefixed one, never the other seat's, never a party's.
      for (const seat of ['seat1', 'seat2'] as const) {
        expect(mc.capabilitiesVisibleTo(ORIGIN[seat])).toContain('read_board');
        expect(mc.visibleTo(ORIGIN[seat]).filter((n) => bareToolName(n) === 'read_board'))
          .toEqual([`${seat}__read_board`]);
      }
    });

    it('reads CURRENT state, never a snapshot captured at boot', async () => {
      // `read` is called at call time. Capturing it at registration would make
      // the agent describe a board that stopped existing four phases ago — a
      // confident, plausible, wrong answer, which is the failure mode this
      // project cares most about.
      //
      // Finish task: `tool.execute` now resolves with `Ledger.wrap`'s own
      // envelope (a JSON string), never the raw object `read` returned —
      // see ledger.ts's own comment on why. Parsed here the same way
      // loop.ts would, then asserted against the UNWRAPPED `result`.
      let phase = 'FILING';
      await registry.openObserver(() => ({ phase }));
      const tool = mc.tools.find((t) => t.name === 'read_board')!;
      expect(JSON.parse(await tool.execute({}) as string)).toMatchObject({ ok: true, result: { phase: 'FILING' } });
      phase = 'VERDICT';
      expect(JSON.parse(await tool.execute({}) as string)).toMatchObject({ ok: true, result: { phase: 'VERDICT' } });
    });

    it('publishes its own grant, so the capability is never unmanifested', async () => {
      await registry.openObserver(() => ({}));
      const m = registry.observerManifest();
      expect(m.granted.map((g) => g.tool)).toEqual(['read_board']);
      expect(m.notGranted).toContain('confirm');
      expect(m.notGranted).toContain('file_exhibit');
      expect(m.notGranted).toContain('record_assessment');
    });

    it('counts its own reads in the ledger', async () => {
      await registry.openObserver(() => ({}));
      const tool = mc.tools.find((t) => t.name === 'read_board')!;
      await tool.execute({});
      await tool.execute({});
      expect(registry.observerManifest().granted[0].used).toBe(2);
    });

    // Fix round 2, Minor: the label used to be a literal string, imported
    // separately from OBSERVER_ORIGIN — nothing here caught a rename of the
    // constant drifting out of sync with the literal. Asserts they are the
    // same value, not just the same text today.
    it('labels its manifest with the real OBSERVER_LABEL constant, not a hardcoded copy', async () => {
      await registry.openObserver(() => ({}));
      expect(registry.observerManifest().label).toBe(OBSERVER_LABEL);
    });

    // Fix round 2, C1: `observerFailures` was written and read nowhere. A
    // browser refusal of the no-`exposedTo` registration must be readable —
    // this is the state that used to render as "the design," not a failure.
    describe('when the browser refuses the registration', () => {
      function refuseReadBoard() {
        vi.spyOn(mc, 'registerTool').mockImplementation(async () => {
          const err = new Error("Permissions-Policy 'tools' does not allow this document");
          err.name = 'NotAllowedError';
          throw err;
        });
      }

      it('is reported by observerRegistrationFailures, not swallowed', async () => {
        refuseReadBoard();
        await registry.openObserver(() => ({}));
        const failures = registry.observerRegistrationFailures();
        expect(failures).toHaveLength(1);
        expect(failures[0].tool).toBe('read_board');
        expect(failures[0].origin).toBe(OBSERVER_ORIGIN);
        expect(failures[0].reason).toContain('Permissions-Policy');
      });

      it('grants nothing, so the manifest is genuinely empty rather than claiming a refused tool', async () => {
        refuseReadBoard();
        await registry.openObserver(() => ({}));
        expect(registry.observerManifest().granted).toEqual([]);
      });

      it('does not reject openObserver itself, so the page still comes up', async () => {
        refuseReadBoard();
        await expect(registry.openObserver(() => ({}))).resolves.toBeUndefined();
      });
    });

    it('reports nothing when the registration succeeds — the normal case', async () => {
      await registry.openObserver(() => ({}));
      expect(registry.observerRegistrationFailures()).toEqual([]);
    });
  });
});
