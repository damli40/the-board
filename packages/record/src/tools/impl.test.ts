import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createToolImpl, withTruncation, type ToolImplDeps } from './impl';
import { Refusal } from '../webmcp/ledger';
import { ExhibitStore } from '../model/exhibits';
import { FactStore } from '../model/facts';
import { Receipts, AssessmentStore } from '../model/receipts';
import { DisputeStore } from '../model/disputes';
import { VerdictStore } from '../model/verdict';
import { ObjectionStore } from '../model/objections';
import { PhaseMachine } from '../webmcp/phases';
import { ToolRegistry } from '../webmcp/registry';
import { Ledger } from '../webmcp/ledger';
import { FakeModelContext } from '../webmcp/fakeModelContext';
import type { Phase, Side } from '../model/types';
import { ORIGIN } from '../config/origins';
import { TOOL_OUTPUT_BUDGET } from '../shared/truncate';
import { ALL_TOOL_NAMES, NEVER_GRANTED } from '../webmcp/tools';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

function buildDeps() {
  const exhibits = new ExhibitStore();
  const facts = new FactStore();
  const receipts = new Receipts();
  const assessments = new AssessmentStore(exhibits, receipts);
  const disputes = new DisputeStore(exhibits, receipts);
  const verdicts = new VerdictStore(assessments, receipts, facts, exhibits);
  const objections = new ObjectionStore();
  const spentAppeals: Side[] = [];
  const enteredPhases: Phase[] = [];
  // A hand-built spy satisfying PhaseMachine's public shape — spend_appeal
  // is the only body that touches it, calling `.spendAppeal(side)` then
  // `.enter('REVIEW')` (the fix that makes an appeal actually re-open
  // review — see spend_appeal's own comment in impl.ts).
  const phaseMachine = {
    spendAppeal: (side: Side) => spentAppeals.push(side),
    enter: async (next: Phase) => { enteredPhases.push(next); }
  } as unknown as PhaseMachine;
  const deps: ToolImplDeps = {
    exhibits, facts, receipts, assessments, disputes, verdicts, objections,
    getPhaseMachine: () => phaseMachine,
    // The page as `App.tsx` would report it: the phase, who holds what, and
    // the ledger. A fixed literal rather than a real registry, because the
    // `read_board` body only ever READS this — what it must not do is hand
    // one actor the grants recorded under another.
    //
    // seat1's hand is deliberately a DIFFERENT list from A's. `youHold` has
    // to be the CALLING actor's own hand, and a fixture where every actor
    // held the same tools could not tell a correct per-actor lookup from a
    // hardcoded party one.
    readBoard: () => ({
      phase: 'FILING',
      agents: [
        { actor: 'A', granted: [{ tool: 'file_fact' }, { tool: 'read_board' }] },
        { actor: 'B', granted: [] },
        { actor: 'seat1', granted: [{ tool: 'open_exhibit' }, { tool: 'record_assessment' }, { tool: 'read_board' }] }
      ],
      ledger: [{ origin: ORIGIN.A, tool: 'file_fact', at: '09:00:01', ok: true }]
    })
  };
  return { deps, exhibits, facts, receipts, assessments, disputes, verdicts, objections, spentAppeals, enteredPhases };
}

describe('createToolImpl', () => {
  let ctx: ReturnType<typeof buildDeps>;
  beforeEach(() => { ctx = buildDeps(); });

  // -------------------------------------------------------------------
  // RULING 1 (controller): the map is built through ONE factory, so a
  // tool cannot be added without its output passing through
  // truncateForTool. Enumerated from the REAL map's own keys, not a
  // hand-written list of names.
  // -------------------------------------------------------------------
  describe('ruling 1: every tool body is truncated, with no exceptions', () => {
    it('the real impl map has an entry for every registrable tool name (derived, not hand-written)', () => {
      const impl = createToolImpl(ctx.deps);
      const expected = ALL_TOOL_NAMES.filter((n) => !NEVER_GRANTED.includes(n));
      expect(Object.keys(impl).sort()).toEqual([...new Set(expected)].sort());
    });

    // Proves the FACTORY (`withTruncation`) truncates correctly in
    // isolation, for any shape of body. It does NOT prove the shipped map
    // was actually built by passing every real body through that factory
    // — see the fix-round-1 block below for the test that closes that gap.
    it('withTruncation itself truncates an oversized result, for any body shape (the factory in isolation)', async () => {
      const impl = createToolImpl(ctx.deps);
      const names = Object.keys(impl); // enumerate from the map itself
      const oversized = 'x'.repeat(TOOL_OUTPUT_BUDGET + 500);
      const oversizedBodies = Object.fromEntries(names.map((n) => [n, async () => oversized]));
      const wrapped = withTruncation(oversizedBodies);

      for (const name of names) {
        const out = (await wrapped[name]({}, ORIGIN.A)) as string;
        expect(out.length, `${name} did not truncate`).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
        expect(out, `${name} truncated silently`).toContain('truncated');
      }
    });

    it('leaves an under-budget result untouched', async () => {
      const wrapped = withTruncation({ open_exhibit: async () => 'short' });
      expect(await wrapped.open_exhibit({}, ORIGIN.seat1)).toBe('short');
    });

    it('does not swallow a thrown refusal — truncation wraps success, never catches an error', async () => {
      const wrapped = withTruncation({ cite: async () => { throw new Error('seat1 holds no assessment for F1'); } });
      await expect(wrapped.cite({}, ORIGIN.seat1)).rejects.toThrow('seat1 holds no assessment for F1');
    });

    // ---------------------------------------------------------------
    // Fix round 1 (adversarial review), IMPORTANT 2: the test above proves
    // the factory works; it manufactures its OWN wrapped body for every
    // key, so it would stay green even if a future change did
    // `return { ...withTruncation(bodies), list_facts: rawBody }` — a real,
    // unwrapped body added under a new tool name, never touched by
    // `withTruncation` at all. The ruling asked for a tool to be UNADDABLE
    // without passing through the factory; this closes that gap by driving
    // every REAL body, with real dependencies and real arguments, to a
    // genuinely oversized REAL result and asserting the notice — for every
    // single key `createToolImpl` actually exports.
    //
    // Each invocation exploits a real, legitimate way that tool could
    // return >1500 characters: a free-text argument the schema never caps
    // (`name`, `text`, `because`, `reasoning`, `reason`), a page/line whose
    // real content is long, or — for `cite`, whose return is otherwise a
    // short list of ids — a factId that is itself long (nothing in
    // `AssessmentStore`/`VerdictStore` bounds a factId's length; CLAUDE.md
    // §2's own rule is "validate strictly in code, loosely in schema").
    // ---------------------------------------------------------------
    describe('fix round 1: every real body, driven with real arguments, truncates a real oversized result', () => {
      const HUGE = 'x'.repeat(2000);
      const iso = '2026-08-20T09:00:00Z';

      type Invoke = (impl: Record<string, (args: any, origin: string) => Promise<unknown>>, c: ReturnType<typeof buildDeps>) => Promise<unknown>;

      const invocations: Record<string, Invoke> = {
        file_exhibit: (impl) => impl.file_exhibit({ name: HUGE, kind: 'text', content: 'hello there' }, ORIGIN.A),

        // Task 5: `file_fact` now refuses an exhibit id nobody filed, so the
        // exhibit has to exist before the oversized `text` can reach the
        // store. The oversized field is unchanged.
        file_fact: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'x', bytes: bytes('hello'), filedAt: iso });
          return impl.file_fact({ text: HUGE, exhibitId: 'E1', locator: {} }, ORIGIN.A);
        },

        concede: (impl, c) => {
          c.facts.file({ side: 'A', text: HUGE, points: { exhibitId: 'E1', locator: {} } });
          return impl.concede({ factId: 'F1' }, ORIGIN.B);
        },

        dispute: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'x', bytes: bytes('the sky is blue'), filedAt: iso });
          c.facts.file({ side: 'A', text: 'sky colour', points: { exhibitId: 'E1', locator: {} } });
          await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.B);
          return impl.dispute({ factId: 'F1', exhibitId: 'E1', quote: 'the sky is blue', because: HUGE }, ORIGIN.B);
        },

        object: (impl) => impl.object({ text: HUGE }, ORIGIN.A),

        extract_text: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: iso, pages: [HUGE] });
          await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat2);
          return impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat2);
        },

        search_exhibits: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'big', bytes: bytes(`${HUGE} needle`), filedAt: iso });
          return impl.search_exhibits({ query: 'needle' }, ORIGIN.seat1);
        },

        record_assessment: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'x', bytes: bytes('the sky is blue'), filedAt: iso });
          c.facts.file({ side: 'A', text: 'sky colour', points: { exhibitId: 'E1', locator: {} } });
          await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
          return impl.record_assessment(
            { factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'the sky is blue', because: HUGE },
            ORIGIN.seat1
          );
        },

        // No length-checked factId anywhere in the STORES — `AssessmentStore`
        // and `VerdictStore` both take any string. Task 5 closed the TOOL's
        // door on a factId that was never filed, so the huge id can no longer
        // arrive as `cite`'s own argument; it goes in through the store, the
        // way it always could, and `cite` — the real tool body, called with a
        // real fact id — is what hands the whole citation list back.
        cite: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'x', bytes: bytes('the sky is blue'), filedAt: iso });
          c.receipts.markOpened('seat1', 'E1');
          const assess = (factId: string) => c.assessments.record({ seat: 'seat1', factId, exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'the sky is blue', because: 'ok' });
          assess(HUGE);
          c.verdicts.cite('seat1', HUGE);
          c.facts.file({ side: 'A', text: 'sky colour', points: { exhibitId: 'E1', locator: {} } });
          assess('F1');
          return impl.cite({ factId: 'F1' }, ORIGIN.seat1);
        },

        draft_verdict: (impl) => impl.draft_verdict({ outcome: 'UPHELD', reasoning: HUGE }, ORIGIN.seat1),

        spend_appeal: (impl) => impl.spend_appeal({ reason: HUGE }, ORIGIN.A)
      };

      // Fix round 1: two bodies cannot be driven to an oversized result at
      // all any more, and that is the point of them. `read_board` bounds
      // every section by row count and `open_exhibit` bounds every field it
      // returns, so neither can produce >1500 characters no matter what is
      // in the stores. Asserting "it truncates" on either would mean
      // asserting a failure they were fixed to make impossible. They are
      // covered by STRONGER tests instead — the bounded-by-construction
      // block in this file's `read_board` describe, and the `open_exhibit`
      // test below it — which assert the payload fits AND parses, where a
      // truncated one does not. Named here, not deleted, so this assertion
      // still fails for a tool added with no coverage of either kind.
      const BOUNDED_BY_CONSTRUCTION = ['read_board', 'open_exhibit'];

      it('covers every key in the real map — a tool added without an entry here fails this, not silently', () => {
        const impl = createToolImpl(buildDeps().deps);
        expect([...Object.keys(invocations), ...BOUNDED_BY_CONSTRUCTION].sort()).toEqual(Object.keys(impl).sort());
      });

      for (const [name, invoke] of Object.entries(invocations)) {
        it(`${name}: real dependencies, real arguments, real oversized result — still truncates`, async () => {
          const fresh = buildDeps();
          const impl = createToolImpl(fresh.deps);
          const out = (await invoke(impl, fresh)) as string;
          expect(typeof out, `${name} did not return a string (was truncation skipped entirely?)`).toBe('string');
          expect(out.length, `${name}'s real output was not actually oversized, or did not truncate`).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
          expect(out, `${name} truncated silently — no notice`).toContain('truncated');
        });
      }
    });
  });

  // -------------------------------------------------------------------
  // RULING 2 (controller): open_exhibit refuses a phantom id BEFORE
  // writing a read receipt.
  // -------------------------------------------------------------------
  describe('ruling 2: open_exhibit validates the exhibit id before markOpened', () => {
    it('refuses an unknown exhibit id', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.open_exhibit({ exhibitId: 'E404' }, ORIGIN.seat1)).rejects.toThrow('no such exhibit: E404');
    });

    it('never writes a receipt for the phantom id it just refused', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.open_exhibit({ exhibitId: 'E404' }, ORIGIN.seat1)).rejects.toThrow();
      expect(ctx.receipts.hasOpened('seat1', 'E404')).toBe(false);
      expect(ctx.receipts.openedBy('seat1')).toEqual([]);
    });

    it('trims the exhibit id, so a padded " E1 " opens E1 like every sibling body', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' });
      const impl = createToolImpl(ctx.deps);
      const result = JSON.parse((await impl.open_exhibit({ exhibitId: ' E1 ' }, ORIGIN.seat1)) as string);
      expect(result.id).toBe('E1');
      // The receipt has to land under the trimmed id too, or the read-receipt
      // chain would refuse a seat that demonstrably did open the document.
      expect(ctx.receipts.hasOpened('seat1', 'E1')).toBe(true);
    });

    it('accepts a real exhibit id and writes the receipt under the calling actor', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' });
      const impl = createToolImpl(ctx.deps);
      const result = JSON.parse((await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat2)) as string);
      expect(result.id).toBe('E1');
      expect(ctx.receipts.hasOpened('seat2', 'E1')).toBe(true);
      expect(ctx.receipts.hasOpened('seat1', 'E1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Task 5, fix round 1, C1/C2: every deliberate guard in this file throws
  // `Refusal`, never a plain `Error` — that is what lets `Ledger.wrap` mark
  // it before it crosses to the panel, and what lets the panel tell "the
  // record refused this on purpose" apart from a genuine crash. This is not
  // provable by message-substring assertions alone (a `Refusal`'s message
  // reads identically to a plain `Error`'s) — it has to check the actual
  // class of what was thrown.
  // -------------------------------------------------------------------
  describe('every deliberate guard throws Refusal, not a plain Error (fix round 1, C1/C2)', () => {
    async function caught(fn: () => Promise<unknown>): Promise<unknown> {
      try {
        await fn();
        throw new Error('expected a throw, got none');
      } catch (err) {
        return err;
      }
    }

    it('actorFor: an unrecognised origin', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.file_exhibit({ name: 'x', kind: 'text', content: 'y' }, 'https://not-a-real-origin.example'));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('requireSide: a seat calling a party-only tool', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.file_exhibit({ name: 'x', kind: 'text', content: 'y' }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('requireSeat: a party calling a seat-only tool', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.record_assessment({}, ORIGIN.A));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('dispute: the self-dealing guard', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('x'), filedAt: '2026-08-20T09:00:00Z' });
      ctx.facts.file({ side: 'A', text: 'x', points: { exhibitId: 'E1', locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.A);
      const err = await caught(() => impl.dispute({ factId: 'F1', exhibitId: 'E1', quote: 'x', because: 'y' }, ORIGIN.A));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('object: an empty objection', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.object({ text: '' }, ORIGIN.A));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('open_exhibit: a phantom exhibit id', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.open_exhibit({ exhibitId: 'E404' }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('extract_text: the read-receipt gate', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one'] });
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('extract_text: a non-pdf exhibit', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 't.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      const err = await caught(() => impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });

    // -------------------------------------------------------------------
    // Fix round 2, N8: the round-1 describe block above asserted
    // `instanceof Refusal` on 8 of impl.ts's 11 converted throw sites; the
    // report claimed all 11 without these three. Closing that gap for
    // real, not just correcting the number in prose.
    // -------------------------------------------------------------------
    it('dispute: no such fact', async () => {
      const impl = createToolImpl(ctx.deps);
      const err = await caught(() => impl.dispute({ factId: 'F999', exhibitId: 'E1', quote: 'x', because: 'y' }, ORIGIN.A));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('extract_text: the 1-based page guard', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one', 'two'] });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      const err = await caught(() => impl.extract_text({ exhibitId: 'E1', page: 0 }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });

    it('extract_text: has no page N', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one'] });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      const err = await caught(() => impl.extract_text({ exhibitId: 'E1', page: 5 }, ORIGIN.seat1));
      expect(err).toBeInstanceOf(Refusal);
    });
  });

  // -------------------------------------------------------------------
  // Recovery-clause round (finish task, scope extension): the brief's own
  // trap is "never name a tool the refused actor does not hold in that
  // phase" — pinning the exact clause text here, not just the class, is
  // what actually proves that. Also proves the byte-identical requirement
  // between this file's own guards and their model/ counterparts.
  // -------------------------------------------------------------------
  describe('recovery clauses (finish task, scope extension)', () => {
    it('open_exhibit: no such exhibit — names no tool, matches model/disputes.ts and model/receipts.ts', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.open_exhibit({ exhibitId: 'E404' }, ORIGIN.seat1))
        .rejects.toThrow('no such exhibit: E404; use an exhibit id that was actually filed');
    });

    it('extract_text: has not opened — names open_exhibit, held by seat1/seat2 in boardRead', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one'] });
      const impl = createToolImpl(ctx.deps);
      await expect(impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat1))
        .rejects.toThrow('seat1 has not opened E1; call open_exhibit first');
    });

    it('extract_text: no such exhibit — same canonical string as open_exhibit', async () => {
      const impl = createToolImpl(ctx.deps);
      // Bypasses the has-not-opened guard directly (Receipts.markOpened
      // performs no existence check of its own — see its own doc comment)
      // to reach extract_text's OWN "no such exhibit" guard specifically.
      ctx.receipts.markOpened('seat1', 'E404');
      await expect(impl.extract_text({ exhibitId: 'E404', page: 1 }, ORIGIN.seat1))
        .rejects.toThrow('no such exhibit: E404; use an exhibit id that was actually filed');
    });

    it('extract_text: has no page N — worded for its own bare `page` argument, not quote.ts locator language', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one'] });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      await expect(impl.extract_text({ exhibitId: 'E1', page: 5 }, ORIGIN.seat1))
        .rejects.toThrow('E1 has no page 5; check the page number against the exhibit');
    });

    it('requireSide: names who CAN act (A or B), not a tool the wrong-kind actor cannot hold', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.file_exhibit({ name: 'x', kind: 'text', content: 'y' }, ORIGIN.seat1))
        .rejects.toThrow('seat1 is not a party and cannot do this; only A or B can');
    });

    it('requireSeat: names who CAN act (seat1 or seat2)', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.record_assessment({}, ORIGIN.A))
        .rejects.toThrow('A is not a seat and cannot do this; only seat1 or seat2 can');
    });

    it('dispute: no such fact — byte-identical to model/facts.ts own guard', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.dispute({ factId: 'F999', exhibitId: 'E1', quote: 'x', because: 'y' }, ORIGIN.A))
        .rejects.toThrow('no such fact: F999; use a fact id that was actually filed');
    });

    it('dispute: the self-dealing pre-check names the other side, byte-identical to model/facts.ts', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('x'), filedAt: '2026-08-20T09:00:00Z' });
      ctx.facts.file({ side: 'A', text: 'x', points: { exhibitId: 'E1', locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.A);
      await expect(impl.dispute({ factId: 'F1', exhibitId: 'E1', quote: 'x', because: 'y' }, ORIGIN.A))
        .rejects.toThrow('cannot dispute your own fact; only B can dispute it');
    });

    // Direct proof of the consistency requirement itself: this file's own
    // "no such fact" and "cannot dispute your own fact" guards produce the
    // EXACT SAME string FactStore's do for the same inputs — not just two
    // strings that happen to look alike today. A reader cannot tell which
    // layer refused a call, so nothing may depend on which one it was.
    it('the dispute pre-check messages are byte-identical to FactStore, not just similar', () => {
      const fresh = new FactStore();
      const f = fresh.file({ side: 'A' as const, text: 'x', points: { exhibitId: 'E1', locator: {} } });

      let storeNoSuchFact = '';
      try { fresh.concede('F9', 'B'); } catch (e) { storeNoSuchFact = (e as Error).message; }
      let storeSelfDeal = '';
      try { fresh.dispute(f.id, 'A'); } catch (e) { storeSelfDeal = (e as Error).message; }

      expect(storeNoSuchFact).toBe('no such fact: F9; use a fact id that was actually filed');
      expect(storeSelfDeal).toBe('cannot dispute your own fact; only B can dispute it');
    });
  });

  // -------------------------------------------------------------------
  // Wiring: actor identity comes from origin, never from args — this is
  // what makes the tool bodies safe to expose to a model that could put
  // anything in its own call arguments.
  // -------------------------------------------------------------------
  describe('actor identity is derived from origin, not args', () => {
    it('file_exhibit assigns the filing side from the calling origin', async () => {
      const impl = createToolImpl(ctx.deps);
      await impl.file_exhibit({ name: 'x', kind: 'text', content: 'hello there' }, ORIGIN.B);
      expect(ctx.exhibits.get('E1')!.side).toBe('B');
    });

    it('ignores a side/seat named in args and uses the real caller instead', async () => {
      const impl = createToolImpl(ctx.deps);
      // An adversarial (or merely confused) model claims to be A while
      // actually calling from B's origin. The filed exhibit must record B.
      await impl.file_exhibit({ name: 'x', kind: 'text', content: 'hi', side: 'A' }, ORIGIN.B);
      expect(ctx.exhibits.get('E1')!.side).toBe('B');
    });

    it('record_assessment, cite and draft_verdict all key off the seat implied by origin', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('No objection was raised.'), filedAt: '2026-08-20T09:00:00Z' });
      ctx.facts.file({ side: 'A', text: 'No objection was raised.', points: { exhibitId: 'E1', locator: {} } });
      const impl = createToolImpl(ctx.deps);

      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      await impl.record_assessment(
        { factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'No objection was raised', because: 'stated directly' },
        ORIGIN.seat1
      );
      await impl.cite({ factId: 'F1' }, ORIGIN.seat1);
      const raw = await impl.draft_verdict({ outcome: 'UPHELD', reasoning: 'because' }, ORIGIN.seat1);
      const verdict = JSON.parse(raw as string);
      expect(verdict.seat).toBe('seat1');
      expect(verdict.cited).toEqual(['F1']);

      // seat2 never opened or assessed anything, so it must be refused —
      // the read-receipt chain still runs underneath this wiring.
      await expect(impl.cite({ factId: 'F1' }, ORIGIN.seat2)).rejects.toThrow('seat2 holds no assessment for F1');
    });

    it('a party origin cannot invoke a seat-only body, and vice versa', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.record_assessment({}, ORIGIN.A)).rejects.toThrow('A is not a seat');
      await expect(impl.file_exhibit({ name: 'x', kind: 'text', content: 'y' }, ORIGIN.seat1)).rejects.toThrow('seat1 is not a party');
    });
  });

  describe('dispute: the layer-1 guard', () => {
    it('refuses disputing your own fact before ever recording a Dispute row', async () => {
      await ctx.exhibits.add({ side: 'B', kind: 'text', name: 'b.txt', bytes: bytes('An objection was raised.'), filedAt: '2026-08-20T09:00:00Z' });
      ctx.facts.file({ side: 'A', text: 'No objection was raised.', points: { exhibitId: 'E1', locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.A);
      await expect(
        impl.dispute({ factId: 'F1', exhibitId: 'E1', quote: 'An objection was raised', because: 'contradicts it' }, ORIGIN.A)
      ).rejects.toThrow('cannot dispute your own fact');
      expect(ctx.disputes.all()).toEqual([]);
    });

    it('records a machine-checked dispute and links it to the fact once the read-receipt chain is satisfied', async () => {
      await ctx.exhibits.add({ side: 'B', kind: 'text', name: 'b.txt', bytes: bytes('An objection was raised.'), filedAt: '2026-08-20T09:00:00Z' });
      ctx.facts.file({ side: 'A', text: 'No objection was raised.', points: { exhibitId: 'E1', locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.B);
      await impl.dispute({ factId: 'F1', exhibitId: 'E1', quote: 'An objection was raised', because: 'contradicts it' }, ORIGIN.B);
      expect(ctx.facts.get('F1')!.status).toBe('disputed');
      expect(ctx.disputes.forFact('F1')!.verified).toBe('machine-checked');
    });
  });

  // -------------------------------------------------------------------
  // Fable F5: "recorded, not adjudicated" used to mean the ledger counted
  // the call and the words themselves went nowhere. An objection nobody can
  // read back is not on the record; it is a tally mark.
  // -------------------------------------------------------------------
  describe('object', () => {
    it('object stores the text, so the record can show it (F5)', async () => {
      const impl = createToolImpl(ctx.deps);
      const out = JSON.parse(await impl.object({ text: 'seat 1 never opened E3' }, ORIGIN.A) as string);
      expect(out).toEqual({ recorded: true, id: 'O1', text: 'seat 1 never opened E3' });
      expect(ctx.objections.all()[0]).toMatchObject({ by: 'A', text: 'seat 1 never opened E3' });
    });
  });

  // -------------------------------------------------------------------
  // Task 4: the masthead promises the record is "written down here where
  // the other side can read it". Until now that was true only of a human
  // looking at the page — a party's agent held no way to read anything back.
  // Sectioned because every tool result is capped at 1,500 characters
  // (shared/truncate.ts): one undivided board would come back cut in half,
  // and a party reading half a record is worse than one reading none.
  // -------------------------------------------------------------------
  describe('read_board for a party: sectioned, sized to the output budget', () => {
    const SECTIONS = ['summary', 'facts', 'exhibits', 'disputes', 'objections', 'assessments', 'verdicts', 'ledger'];

    it('summary names the phase and only the caller\'s own held tools', async () => {
      const impl = createToolImpl(ctx.deps);
      const out = JSON.parse(await impl.read_board({}, ORIGIN.A) as string);
      expect(out.phase).toBe('FILING');
      expect(out.youHold).toEqual(['file_fact', 'read_board']);
      expect(out.latest).toHaveLength(1);
    });

    it('facts section fits TOOL_OUTPUT_BUDGET with seven long facts', async () => {
      const e = await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'note', bytes: bytes('hello'), filedAt: 't' });
      for (let i = 0; i < 7; i += 1) {
        ctx.facts.file({ side: i % 2 ? 'A' : 'B', text: 'x'.repeat(120), points: { exhibitId: e.id, locator: {} } });
      }
      const impl = createToolImpl(ctx.deps);
      const text = await impl.read_board({ section: 'facts' }, ORIGIN.A) as string;
      expect(text.length).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
      // Fix round 1: sections are `{ rows, more }` now, not a bare array —
      // a party has to be able to tell a complete answer from a partial one.
      // Seven is exactly the page size, so nothing is hidden here.
      expect(JSON.parse(text).rows).toHaveLength(7);
      expect(JSON.parse(text).more).toBe(0);
    });

    it('refuses an unknown section and names the real ones', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.read_board({ section: 'secrets' }, ORIGIN.A)).rejects.toThrow(/no such section: secrets; use summary, facts, exhibits, disputes, objections, assessments, verdicts or ledger/);
    });

    // CHANGED, deliberately: this used to assert a seat was REFUSED. The
    // seats are the readers who assess the parties' facts, and
    // `record_assessment` takes a `factId` that nothing else in a seat's hand
    // returns — so a seat had to GUESS which facts existed. In the live
    // rehearsal both seats inferred F1-F3 from the exhibits, happened to be
    // right, and one of them flagged the guess in its own report. A reader
    // asked to assess facts must be able to read the facts.
    it("reads the board for a seat too, and the summary names the seat's own hand", async () => {
      const impl = createToolImpl(ctx.deps);
      const out = JSON.parse(await impl.read_board({}, ORIGIN.seat1) as string);
      expect(out.phase).toBe('FILING');
      // seat1's list, never A's — the fixture hands them different tools on
      // purpose, so a hardcoded party lookup would fail here.
      expect(out.youHold).toEqual(['open_exhibit', 'record_assessment', 'read_board']);
    });

    // The boundary that did NOT move: four origins can read, and nothing
    // else can. `actorFor` is the only gate now, and it is still a gate.
    it('is still refused to an origin that is not one of the four', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.read_board({}, 'https://not-a-panel.example')).rejects.toThrow(/unrecognised origin/);
    });

    it('matches a section name whatever case the model wrote it in', async () => {
      const impl = createToolImpl(ctx.deps);
      const out = JSON.parse(await impl.read_board({ section: 'Facts' }, ORIGIN.A) as string);
      expect(out).toEqual({ rows: [], more: 0 });
    });

    // -----------------------------------------------------------------
    // Fix round 1. Clipping each FIELD left every section proportional to
    // how much had been filed: ten full-length facts ran past the 1,500
    // budget, `withTruncation` cut the JSON mid-string, and a party asking
    // to read the record got back something that would not parse at all.
    // The demo seeds seven facts — the tenth would have broken it on
    // camera. These drive TWENTY maximum-length rows into every store at
    // once, which no clip length alone survives.
    // -----------------------------------------------------------------
    describe('every section is bounded by row count, not only by field length', () => {
      /** 20 rows filed, minus each section's page size. */
      const EXPECTED_MORE: Record<string, number> = {
        facts: 13, exhibits: 8, disputes: 10, objections: 12, assessments: 13, ledger: 5,
        // A verdict is stored per seat, so twenty cannot exist — two is the
        // whole population, and the page size is two. Paged anyway, for one
        // shape across every section rather than one special case.
        verdicts: 0
      };

      /** Every store at twenty rows, every clipped field over its clip length. */
      async function fileTwentyOfEverything() {
        const long = 'x'.repeat(400);
        // E1 carries the text every dispute and assessment quotes against;
        // the other nineteen exist so the exhibits section has twenty rows.
        await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'n'.repeat(200), bytes: bytes('the sky is blue'), filedAt: 't' });
        for (let i = 0; i < 19; i += 1) {
          await ctx.exhibits.add({ side: 'B', kind: 'text', name: 'n'.repeat(200), bytes: bytes(`filler ${i}`), filedAt: 't' });
        }
        for (const actor of ['B', 'seat1'] as const) ctx.receipts.markOpened(actor, 'E1');
        for (let i = 0; i < 20; i += 1) {
          ctx.facts.file({ side: 'A', text: long, points: { exhibitId: 'E1', locator: {} } });
          ctx.disputes.record({ factId: `F${i + 1}`, by: 'B', exhibitId: 'E1', locator: {}, quote: 'the sky is blue', because: long });
          ctx.objections.record({ by: 'A', text: long, at: '2026-08-20T09:00:00Z' });
          ctx.assessments.record({ seat: 'seat1', factId: `F${i + 1}`, exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'the sky is blue', because: long });
        }
        for (const seat of ['seat1', 'seat2'] as const) ctx.verdicts.draft(seat, 'UPHELD', long, ['E1']);
      }

      /** Twenty ledger lines at Chrome's own 30-character tool-name cap. */
      function implWithTwentyLedgerLines() {
        return createToolImpl({
          ...ctx.deps,
          readBoard: () => ({
            phase: 'FILING',
            agents: [{ actor: 'A', granted: [{ tool: 'read_board' }] }],
            ledger: Array.from({ length: 20 }, (_, i) => ({ origin: ORIGIN.A, tool: 'r'.repeat(30), at: `09:00:0${i % 10}Z`, ok: false }))
          })
        });
      }

      it('fits the budget, parses, and says how many rows it left out — every section', async () => {
        await fileTwentyOfEverything();
        const impl = implWithTwentyLedgerLines();
        for (const section of SECTIONS) {
          const text = await impl.read_board({ section }, ORIGIN.A) as string;
          expect(text.length, `${section} ran past the output budget`).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
          // The failure this closes was not a big payload, it was an
          // UNPARSEABLE one — `withTruncation` cutting JSON mid-string.
          expect(text, `${section} was cut by withTruncation`).not.toContain('truncated');
          const out = JSON.parse(text);
          if (section === 'summary') continue;
          expect(Array.isArray(out.rows), `${section} is not a paged section`).toBe(true);
          expect(out.more, `${section} did not report the rows it hid`).toBe(EXPECTED_MORE[section]);
        }
      });

      it('keeps the NEWEST rows, so a party reads the latest state and not the oldest', async () => {
        await fileTwentyOfEverything();
        const impl = createToolImpl(ctx.deps);
        const out = JSON.parse(await impl.read_board({ section: 'facts' }, ORIGIN.A) as string);
        expect(out.rows.map((r: { id: string }) => r.id)).toEqual(['F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20']);
      });
    });

    // -----------------------------------------------------------------
    // Fix round 1: the F4 decision — a party read never returns exhibit
    // text or pages — was a comment and a shape, with nothing asserting it.
    // The `disputes` section was in fact returning `quote`, which IS
    // verbatim exhibit text, machine-checked against the document: the
    // receipt-free read this rule exists to refuse, for the exact passage
    // somebody thought was worth fighting over.
    // -----------------------------------------------------------------
    it('never returns exhibit text or pages, in any section (F4)', async () => {
      // A word that appears in the document and nowhere else on the board,
      // so a hit anywhere in any payload can only have come from the file.
      const body = 'ZEBRA'.repeat(600);
      const e = await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'the document', bytes: bytes(body), filedAt: 't' });
      const f = ctx.facts.file({ side: 'A', text: 'the document says the delivery was late', points: { exhibitId: e.id, locator: {} } });
      for (const actor of ['B', 'seat1'] as const) ctx.receipts.markOpened(actor, e.id);
      ctx.disputes.record({ factId: f.id, by: 'B', exhibitId: e.id, locator: {}, quote: 'ZEBRAZEBRA', because: 'it says no such thing' });
      ctx.assessments.record({ seat: 'seat1', factId: f.id, exhibitId: e.id, locator: {}, finding: 'supported', quote: 'ZEBRAZEBRA', because: 'stated directly' });
      ctx.objections.record({ by: 'A', text: 'the seat quoted selectively', at: 't' });
      ctx.verdicts.draft('seat1', 'UPHELD', 'the record supports it', [e.id]);

      const impl = createToolImpl(ctx.deps);
      // Every actor that can call this, not just A. The seats hold the read
      // now, and a receipt-free read of exhibit text would be worse in their
      // hands than in a party's: `open_exhibit` writing a receipt is the one
      // thing making `record_assessment`'s quote check mean anything.
      for (const actor of ['A', 'B', 'seat1', 'seat2'] as const) {
        for (const section of SECTIONS) {
          const text = await impl.read_board({ section }, ORIGIN[actor]) as string;
          expect(text, `${actor}'s ${section} handed back the exhibit's own text`).not.toContain('ZEBRA');
          expect(text, `${actor}'s ${section} handed back the exhibit's pages`).not.toContain('"pages"');
        }
      }
    });

    // -----------------------------------------------------------------
    // The product's claim is TWO INDEPENDENT READERS. The seats hold this
    // read through DRAFT VERDICT, so an unfiltered `verdicts` section let
    // one seat read the other seat's draft — outcome and grounds — before
    // writing its own, which is exactly the influence the two seats exist
    // to rule out. A seat sees only its own draft; the parties, who are
    // being judged rather than judging, still see both, and so does the
    // summary's count.
    // -----------------------------------------------------------------
    it('shows a seat only its own draft verdict, while a party still sees both', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'the delivery note', bytes: bytes('the sky is blue'), filedAt: 't' });
      ctx.verdicts.draft('seat1', 'UPHELD', 'seat one grounds', ['E1']);
      ctx.verdicts.draft('seat2', 'OVERTURNED', 'seat two grounds', ['E1']);
      const impl = createToolImpl(ctx.deps);

      for (const seat of ['seat1', 'seat2'] as const) {
        const out = JSON.parse(await impl.read_board({ section: 'verdicts' }, ORIGIN[seat]) as string);
        expect(out.rows, `${seat} was handed more than its own draft`).toHaveLength(1);
        expect(out.rows[0].seat).toBe(seat);
      }

      const asParty = JSON.parse(await impl.read_board({ section: 'verdicts' }, ORIGIN.A) as string);
      expect(asParty.rows).toHaveLength(2);
      expect(asParty.rows.map((r: { seat: string }) => r.seat)).toEqual(['seat1', 'seat2']);

      // The count is a count, not a draft: a seat learning that two drafts
      // exist is the phase working; learning what the other one SAYS is not.
      const summary = JSON.parse(await impl.read_board({ section: 'summary' }, ORIGIN.seat1) as string);
      expect(summary.counts.verdicts).toBe(2);
    });

    // -----------------------------------------------------------------
    // The same leak one phase earlier, and it was live while the verdicts
    // one was already closed. An assessment is the working step a draft
    // verdict is built from, so an unfiltered `assessments` section let a
    // seat read the other seat's finding and grounds BEFORE writing its
    // own — the independence the two-seat panel exists to produce, gone at
    // the step where it is cheapest to lose.
    // -----------------------------------------------------------------
    it('shows a seat only its own assessments, while a party still sees both seats', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'the delivery note', bytes: bytes('the sky is blue'), filedAt: 't' });
      ctx.facts.file({ side: 'A', text: 'the note says the sky is blue', points: { exhibitId: 'E1', locator: {} } });
      for (const seat of ['seat1', 'seat2'] as const) ctx.receipts.markOpened(seat, 'E1');
      ctx.assessments.record({ seat: 'seat1', factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'the sky is blue', because: 'seat one grounds' });
      ctx.assessments.record({ seat: 'seat2', factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'contradicted', quote: 'the sky is blue', because: 'seat two grounds' });
      const impl = createToolImpl(ctx.deps);

      for (const seat of ['seat1', 'seat2'] as const) {
        const out = JSON.parse(await impl.read_board({ section: 'assessments' }, ORIGIN[seat]) as string);
        expect(out.rows, `${seat} was handed more than its own assessment`).toHaveLength(1);
        expect(out.rows[0].seat).toBe(seat);
      }

      const asParty = JSON.parse(await impl.read_board({ section: 'assessments' }, ORIGIN.A) as string);
      expect(asParty.rows).toHaveLength(2);
      expect(asParty.rows.map((r: { seat: string }) => r.seat)).toEqual(['seat1', 'seat2']);

      // Same split as the verdicts case: the COUNT stays whole for a seat.
      const summary = JSON.parse(await impl.read_board({ section: 'summary' }, ORIGIN.seat1) as string);
      expect(summary.counts.assessments).toBe(2);
    });
  });

  describe('extract_text', () => {
    // The two guards used to sit the other way round, so a call with no
    // exhibit id at all was diagnosed as an unpaid read: `seat1 has not
    // opened ; call open_exhibit first`. That sentence is confidently wrong
    // twice over — it names a prerequisite that is not the problem, and the
    // recovery it prescribes (call open_exhibit) fails the same way, because
    // the id is still missing.
    it('names the missing exhibit id, not an unpaid read, when no exhibitId was passed', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one'] });
      const impl = createToolImpl(ctx.deps);
      await expect(impl.extract_text({ page: 1 }, ORIGIN.seat1))
        .rejects.toThrow('no such exhibit: (none); use an exhibit id that was actually filed');
    });

    it('names the missing exhibit before the receipt even when the seat opened nothing', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.extract_text({ exhibitId: 'E404', page: 1 }, ORIGIN.seat1))
        .rejects.toThrow('no such exhibit: E404; use an exhibit id that was actually filed');
    });

    it('refuses an exhibit this seat has not opened', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one', 'two'] });
      const impl = createToolImpl(ctx.deps);
      await expect(impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat1)).rejects.toThrow('seat1 has not opened E1');
    });

    it('refuses a non-pdf exhibit', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 't.txt', bytes: bytes('hello'), filedAt: '2026-08-20T09:00:00Z' });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
      await expect(impl.extract_text({ exhibitId: 'E1', page: 1 }, ORIGIN.seat1)).rejects.toThrow('is not a pdf');
    });

    it('returns the right page once opened', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'pdf', name: 'p.pdf', bytes: bytes(''), filedAt: '2026-08-20T09:00:00Z', pages: ['one', 'two', 'three'] });
      const impl = createToolImpl(ctx.deps);
      await impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat2);
      expect(await impl.extract_text({ exhibitId: 'E1', page: 2 }, ORIGIN.seat2)).toBe('two');
    });
  });

  describe('search_exhibits', () => {
    it('finds a hit across filed exhibits with no read-receipt gate', async () => {
      await ctx.exhibits.add({ side: 'A', kind: 'text', name: 't.txt', bytes: bytes('the delivery was completed on time'), filedAt: '2026-08-20T09:00:00Z' });
      const impl = createToolImpl(ctx.deps);
      const hits = JSON.parse((await impl.search_exhibits({ query: 'completed on time' }, ORIGIN.seat1)) as string);
      expect(hits).toHaveLength(1);
      expect(hits[0].exhibitId).toBe('E1');
    });
  });

  describe('spend_appeal', () => {
    // Fix round 1, MINOR 4 (adversarial review): the mutation is deferred
    // past a macrotask boundary (see spend_appeal's own comment in
    // impl.ts), so every test in this block runs under fake timers and
    // advances them explicitly — a plain `await` on the call is no longer
    // enough to observe the state change.
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('spends through the phase machine for the calling side, via the lazy thunk, once the deferred work runs', async () => {
      const impl = createToolImpl(ctx.deps);
      await impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);
      await vi.runAllTimersAsync();
      expect(ctx.spentAppeals).toEqual(['A']);
    });

    // Gap found and fixed while wiring this for real: nothing previously
    // called `enter('REVIEW')` after an appeal was spent, so the phase was
    // left stuck at VERDICT with no button in the shipped UI to leave it.
    it('re-opens REVIEW after spending, per design spec v3 §9, once the deferred work runs', async () => {
      const impl = createToolImpl(ctx.deps);
      await impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.B);
      await vi.runAllTimersAsync();
      expect(ctx.enteredPhases).toEqual(['REVIEW']);
    });

    // Fix round 1, MINOR 4: the actual defect being fixed. Proves the call
    // has already resolved with its result BEFORE the appeal is spent or
    // REVIEW is re-entered — i.e. the abort cannot land while THIS
    // execution is still "in flight" under its own signal, regardless of
    // which Chrome version's abort-cancellation behaviour is filming.
    it('resolves with its result before spending the appeal or touching the phase — the fix itself', async () => {
      const impl = createToolImpl(ctx.deps);
      const raw = await impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);
      // The call already resolved successfully...
      expect(JSON.parse(raw as string)).toMatchObject({ spent: true, side: 'A' });
      // ...and yet nothing has actually happened to the phase machine yet.
      expect(ctx.spentAppeals).toEqual([]);
      expect(ctx.enteredPhases).toEqual([]);

      await vi.runAllTimersAsync();

      expect(ctx.spentAppeals).toEqual(['A']);
      expect(ctx.enteredPhases).toEqual(['REVIEW']);
    });
  });

  // -------------------------------------------------------------------
  // Task 5 (F6, F7, F8, F14): `inputSchema` is a HINT to the model, not a
  // gate in the browser — Chrome hands the arguments through as the model
  // wrote them, `required` included. So every argument a body reads has to
  // be checked here or not at all. Until now a missing `text` filed an
  // empty fact, an `exhibitId` nobody filed attached a claim to nothing,
  // and a missing `quote` crashed the quote checker instead of refusing.
  // -------------------------------------------------------------------
  describe('input validation: Chrome does not check the schema, so the tool must', () => {
    const A = ORIGIN.A;
    async function textExhibit() {
      return ctx.exhibits.add({ side: 'A', kind: 'text', name: 'note', bytes: bytes('hello world'), filedAt: 't' });
    }
    it('file_fact refuses empty text and files nothing', async () => {
      const e = await textExhibit();
      const impl = createToolImpl(ctx.deps);
      await expect(impl.file_fact({ exhibitId: e.id }, A)).rejects.toThrow(/a fact needs text; state the claim in one sentence/);
      expect(ctx.facts.all()).toHaveLength(0);
    });
    it('file_fact refuses an exhibit id that was never filed', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.file_fact({ text: 'claim', exhibitId: 'E9' }, A)).rejects.toThrow(/no such exhibit: E9; use an exhibit id that was actually filed/);
    });
    it('file_exhibit refuses an unknown kind, a missing name and empty content', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.file_exhibit({ kind: 'video', name: 'x', content: 'y' }, A)).rejects.toThrow(/unknown exhibit kind: video; use text, pdf, image, capture or rule/);
      await expect(impl.file_exhibit({ kind: 'text', name: '  ', content: 'y' }, A)).rejects.toThrow(/an exhibit needs a name/);
      await expect(impl.file_exhibit({ kind: 'text', name: 'x', content: '' }, A)).rejects.toThrow(/an exhibit needs content/);
      expect(ctx.exhibits.all()).toHaveLength(0);
    });
    it('concede and dispute refuse a missing factId before touching the stores', async () => {
      const impl = createToolImpl(ctx.deps);
      await expect(impl.concede({}, A)).rejects.toThrow(/concede needs a factId; use a fact id that was actually filed/);
      await expect(impl.dispute({ exhibitId: 'E1', quote: 'q', because: 'b' }, A)).rejects.toThrow(/dispute needs a factId; use a fact id that was actually filed/);
    });
    it('dispute refuses an empty because', async () => {
      const e = await textExhibit();
      const f = ctx.facts.file({ side: 'B', text: 'their claim', points: { exhibitId: e.id, locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await expect(impl.dispute({ factId: f.id, exhibitId: e.id, quote: 'hello', because: ' ' }, A)).rejects.toThrow(/a dispute needs a because; say in one sentence why the quote contradicts the fact/);
    });
    it('record_assessment refuses an unknown finding; spend_appeal refuses an empty reason', async () => {
      const e = await textExhibit();
      const f = ctx.facts.file({ side: 'B', text: 'their claim', points: { exhibitId: e.id, locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await expect(impl.record_assessment({ factId: f.id, exhibitId: e.id, finding: 'maybe', quote: 'q', because: 'b' }, ORIGIN.seat1)).rejects.toThrow(/unknown finding: maybe; use supported, contradicted, not-addressed or cannot-tell/);
      await expect(impl.spend_appeal({ reason: '' }, A)).rejects.toThrow(/spending an appeal needs a reason; say in one or two sentences why/);
    });
    it('a missing quote is a refusal, not a crash (F6)', async () => {
      const e = await textExhibit();
      const f = ctx.facts.file({ side: 'B', text: 'their claim', points: { exhibitId: e.id, locator: {} } });
      ctx.receipts.markOpened('A', e.id);
      const impl = createToolImpl(ctx.deps);
      await expect(impl.dispute({ factId: f.id, exhibitId: e.id, because: 'b' }, A)).rejects.toThrow(Refusal);
      ctx.receipts.markOpened('seat1', e.id);
      await expect(impl.record_assessment({ factId: f.id, exhibitId: e.id, finding: 'supported', because: 'b' }, ORIGIN.seat1)).rejects.toThrow(Refusal);
    });
    it('phantom ids are refused where they enter: record_assessment and cite factId, file_fact counters (F8)', async () => {
      const e = await textExhibit();
      ctx.receipts.markOpened('seat1', e.id);
      const impl = createToolImpl(ctx.deps);
      await expect(impl.record_assessment({ factId: 'F99', exhibitId: e.id, finding: 'supported', quote: 'hello', because: 'b' }, ORIGIN.seat1)).rejects.toThrow(/no such fact: F99; use a fact id that was actually filed/);
      await expect(impl.cite({ factId: 'F99' }, ORIGIN.seat1)).rejects.toThrow(/no such fact: F99/);
      await expect(impl.file_fact({ text: 'claim', exhibitId: e.id, counters: 'F99' }, A)).rejects.toThrow(/no such fact: F99/);
    });
    it('draft_verdict needs an outcome and reasoning; a locator must be an object (F8)', async () => {
      const e = await textExhibit();
      const impl = createToolImpl(ctx.deps);
      await expect(impl.draft_verdict({}, ORIGIN.seat1)).rejects.toThrow(/a verdict needs an outcome; use UPHELD or OVERTURNED/);
      await expect(impl.draft_verdict({ outcome: 'UPHELD', reasoning: ' ' }, ORIGIN.seat1)).rejects.toThrow(/a verdict needs reasoning; say in a few sentences why/);
      await expect(impl.file_fact({ text: 'claim', exhibitId: e.id, locator: 'page 4' }, A)).rejects.toThrow(/locator must be an object/);
    });
    // Self-review: the guard trims before it looks the id up, so the value it
    // PROVED exists and the value it files have to be the same string — or a
    // rebuttal passes every check here and still points at nothing.
    it('files the counters id it actually checked, not the raw argument (F8)', async () => {
      const e = await textExhibit();
      const first = ctx.facts.file({ side: 'B', text: 'their claim', points: { exhibitId: e.id, locator: {} } });
      const impl = createToolImpl(ctx.deps);
      await impl.file_fact({ text: 'answer', exhibitId: e.id, counters: ` ${first.id} ` }, A);
      expect(ctx.facts.all()[1].counters).toBe(first.id);
    });
    it('file_exhibit lower-cases kind, so "Text" is text, not an unchecked document (F7)', async () => {
      const impl = createToolImpl(ctx.deps);
      const out = JSON.parse(await impl.file_exhibit({ kind: 'Text', name: 'n', content: 'hello' }, A) as string);
      expect(out.kind).toBe('text');
    });
    it('open_exhibit returns metadata plus a bounded text preview that always parses (F14)', async () => {
      const e = await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'long', bytes: bytes('y'.repeat(5000)), filedAt: 't' });
      const impl = createToolImpl(ctx.deps);
      const text = await impl.open_exhibit({ exhibitId: e.id }, A) as string;
      expect(text.length).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
      const out = JSON.parse(text);
      expect(out.id).toBe(e.id);
      expect(out.textPreview.endsWith('…')).toBe(true);
    });

    // Fix round 1: the previous round bounded `textPreview` and left `name`
    // free text, so "parses every time" was nearly true — a 2,000-character
    // exhibit label still pushed the JSON past the budget and got it cut
    // mid-string. Every field is bounded now, and this asserts the parse
    // rather than a truncation notice.
    it('open_exhibit still parses when the exhibit NAME is what is oversized (F14)', async () => {
      const e = await ctx.exhibits.add({ side: 'A', kind: 'text', name: 'q'.repeat(2000), bytes: bytes('hello'), filedAt: 't' });
      const impl = createToolImpl(ctx.deps);
      const text = await impl.open_exhibit({ exhibitId: e.id }, A) as string;
      expect(text.length).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
      expect(text, 'the name pushed the payload past the budget and it was cut').not.toContain('truncated');
      const out = JSON.parse(text);
      expect(out.id).toBe(e.id);
      expect(out.name.length).toBeLessThanOrEqual(40);
    });

    // Fix round 1: with no exhibitId at all, the STORE's read-receipt guard
    // fired first and said `A has not opened ; call open_exhibit first` — a
    // confident sentence about a problem the caller does not have, aimed at
    // a party who may have opened every document on the record. Both bodies
    // now diagnose the argument that is actually missing.
    it('dispute and record_assessment name the missing exhibitId, not a read receipt', async () => {
      const e = await textExhibit();
      const f = ctx.facts.file({ side: 'B', text: 'their claim', points: { exhibitId: e.id, locator: {} } });
      ctx.receipts.markOpened('A', e.id);
      ctx.receipts.markOpened('seat1', e.id);
      const impl = createToolImpl(ctx.deps);
      await expect(impl.dispute({ factId: f.id, quote: 'hello', because: 'b' }, A))
        .rejects.toThrow('no such exhibit: (none); use an exhibit id that was actually filed');
      await expect(impl.record_assessment({ factId: f.id, finding: 'supported', quote: 'hello', because: 'b' }, ORIGIN.seat1))
        .rejects.toThrow('no such exhibit: (none); use an exhibit id that was actually filed');
    });

    // Fix round 1: `query` is `required` in the schema, and the schema is a
    // hint the browser does not enforce. An empty one returned `[]`, which
    // reads as "searched everything, found nothing" — indistinguishable
    // from a real miss, and enough for a seat to conclude a document says
    // nothing about a subject it was never asked about.
    it('search_exhibits refuses an empty query instead of returning no hits', async () => {
      await textExhibit();
      const impl = createToolImpl(ctx.deps);
      await expect(impl.search_exhibits({}, ORIGIN.seat1)).rejects.toThrow(/search_exhibits needs a query; say what text to look for/);
      await expect(impl.search_exhibits({ query: '  ' }, ORIGIN.seat1)).rejects.toThrow(Refusal);
    });

    // Fix round 1: `atob` throws a raw DOMException, which is not a
    // `Refusal`, so `Ledger.wrap` left it unmarked and the panel drew "the
    // machinery broke" for what is really a party sending a bad data URL.
    it('file_exhibit refuses malformed base64 rather than crashing out of atob', async () => {
      const impl = createToolImpl(ctx.deps);
      const call = () => impl.file_exhibit({ kind: 'pdf', name: 'broken', content: 'data:application/pdf;base64,@@@' }, A);
      await expect(call()).rejects.toThrow(/the content is not valid base64 for a pdf exhibit; pass a data URL, or plain text for a text exhibit/);
      await expect(call()).rejects.toThrow(Refusal);
      expect(ctx.exhibits.all()).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// FINAL REVIEW, BLOCKER 3: spending an appeal mutates state AFTER the last
// render.
//
// `spend_appeal` defers `spendAppeal` + `enter('REVIEW')` into a zero-delay
// timeout, on purpose: without the deferral it aborts the very registration
// it is executing under, and on Chrome 152 and earlier that cancels the
// in-flight execution. The cost is that the only thing which re-renders on a
// panel-driven mutation is the ledger subscription, and that fires in a
// MICROTASK, before the timer. React schedules its render ahead of a clamped
// zero timeout, so the hand, the manifest and the phase ribbon all paint
// while the appeal is still held and the phase is still VERDICT, and the
// abort then lands with nobody listening. At VERDICT there is no next-phase
// button to force another render, so the screen stays wrong.
//
// The fix keeps the deferral and makes the deferred work observable, via
// `ToolImplDeps.onStateChange`. These tests use the REAL PhaseMachine, the
// REAL ToolRegistry and the fake model context, so "the phase" and "the hand"
// below are the real ones, not a spy's record of intent.
// ---------------------------------------------------------------------------
describe('spend_appeal: the deferred work is observable (final review, Blocker 3)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function buildRealWiring() {
    const mc = new FakeModelContext();
    const ledger = new Ledger(() => 1000);
    const exhibits = new ExhibitStore();
    const facts = new FactStore();
    const receipts = new Receipts();
    const assessments = new AssessmentStore(exhibits, receipts);
    const disputes = new DisputeStore(exhibits, receipts);
    const verdicts = new VerdictStore(assessments, receipts, facts, exhibits);

    let phaseMachine: PhaseMachine | undefined;
    /** What the page could see each time it was told to look again. */
    const seenOnStateChange: { phase: Phase; heldA: boolean; handA: string[] }[] = [];

    const impl = createToolImpl({
      exhibits, facts, receipts, assessments, disputes, verdicts,
      objections: new ObjectionStore(),
      readBoard: () => ({ phase: phaseMachine!.phase, agents: [], ledger: [] }),
      getPhaseMachine: () => phaseMachine!,
      onStateChange: () => {
        seenOnStateChange.push({
          phase: phaseMachine!.phase,
          heldA: phaseMachine!.appealHeld('A'),
          handA: registry.manifest('A').granted.map((g) => g.tool).sort(),
        });
      }
    });

    const registry = new ToolRegistry(mc, ledger, impl);
    phaseMachine = new PhaseMachine(registry);
    return { mc, ledger, registry, phaseMachine, impl, seenOnStateChange };
  }

  it('moves the phase back to REVIEW and takes the appeal out of the hand once the timer runs', async () => {
    const w = buildRealWiring();
    await w.phaseMachine.enter('VERDICT');

    expect(w.phaseMachine.phase).toBe('VERDICT');
    expect(w.phaseMachine.appealHeld('A')).toBe(true);
    expect(w.registry.manifest('A').granted.map((g) => g.tool)).toContain('spend_appeal');

    await w.impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);

    // Everything the ledger subscription would have rendered still says the
    // old thing at this point. This is exactly the stale frame the fix is
    // about, and it is correct that it is still stale here.
    expect(w.phaseMachine.phase).toBe('VERDICT');
    expect(w.phaseMachine.appealHeld('A')).toBe(true);

    await vi.runAllTimersAsync();

    expect(w.phaseMachine.phase).toBe('REVIEW');
    expect(w.phaseMachine.appealSpent('A')).toBe(true);
    expect(w.phaseMachine.appealHeld('A')).toBe(false);
    expect(w.registry.manifest('A').granted.map((g) => g.tool)).not.toContain('spend_appeal');
  });

  it('tells the page to look again, and only after the state it has to render is already true', async () => {
    const w = buildRealWiring();
    await w.phaseMachine.enter('VERDICT');
    await w.impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);

    // Nothing yet: the deferral has not run, so there is nothing new to show.
    expect(w.seenOnStateChange).toHaveLength(0);

    await vi.runAllTimersAsync();

    expect(w.seenOnStateChange).toHaveLength(1);
    // The callback must fire AFTER the mutation, or the render it triggers
    // paints the same stale frame the ledger subscription already painted.
    expect(w.seenOnStateChange[0].phase).toBe('REVIEW');
    expect(w.seenOnStateChange[0].heldA).toBe(false);
    expect(w.seenOnStateChange[0].handA).not.toContain('spend_appeal');
  });

  it("leaves the other side's appeal alone", async () => {
    const w = buildRealWiring();
    await w.phaseMachine.enter('VERDICT');
    await w.impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);
    await vi.runAllTimersAsync();

    expect(w.phaseMachine.appealSpent('B')).toBe(false);
    // B's appeal is not held right now only because the phase went back to
    // REVIEW, where no appeal lifetime is open at all, not because it was
    // spent. Re-entering VERDICT gives it back, unspent.
    await w.phaseMachine.enter('VERDICT');
    expect(w.phaseMachine.appealHeld('B')).toBe(true);
    expect(w.phaseMachine.appealHeld('A')).toBe(false);
  });

  it('still tells the page to look again when the deferred transition throws', async () => {
    const w = buildRealWiring();
    await w.phaseMachine.enter('VERDICT');
    // `spendAppeal` has already mutated the machine by the time `enter` can
    // fail, so a failed transition still leaves the screen showing something
    // that is no longer true. A render is the right answer either way.
    vi.spyOn(w.phaseMachine, 'enter').mockRejectedValueOnce(new Error('registerTool refused'));

    await w.impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);
    await vi.runAllTimersAsync();

    expect(w.seenOnStateChange).toHaveLength(1);
    expect(w.phaseMachine.appealSpent('A')).toBe(true);
  });
});
