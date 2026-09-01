import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createToolImpl, withTruncation, type ToolImplDeps } from './impl';
import { Refusal } from '../webmcp/ledger';
import { ExhibitStore } from '../model/exhibits';
import { FactStore } from '../model/facts';
import { Receipts, AssessmentStore } from '../model/receipts';
import { DisputeStore } from '../model/disputes';
import { VerdictStore } from '../model/verdict';
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
    exhibits, facts, receipts, assessments, disputes, verdicts,
    getPhaseMachine: () => phaseMachine
  };
  return { deps, exhibits, facts, receipts, assessments, disputes, verdicts, spentAppeals, enteredPhases };
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

        file_fact: (impl) => impl.file_fact({ text: HUGE, exhibitId: 'E1', locator: {} }, ORIGIN.A),

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

        open_exhibit: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'big', bytes: bytes(HUGE), filedAt: iso });
          return impl.open_exhibit({ exhibitId: 'E1' }, ORIGIN.seat1);
        },

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

        // No length-checked factId anywhere in the schema or the stores —
        // recording an assessment directly against the store (bypassing
        // file_fact, which no real caller needs to have used first; see
        // AssessmentStore.record) sets up a real, held assessment under a
        // deliberately huge factId, then `cite` — the real tool body — is
        // what returns it.
        cite: async (impl, c) => {
          await c.exhibits.add({ side: 'A', kind: 'text', name: 'x', bytes: bytes('the sky is blue'), filedAt: iso });
          c.receipts.markOpened('seat1', 'E1');
          c.assessments.record({ seat: 'seat1', factId: HUGE, exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'the sky is blue', because: 'ok' });
          return impl.cite({ factId: HUGE }, ORIGIN.seat1);
        },

        draft_verdict: (impl) => impl.draft_verdict({ outcome: 'UPHELD', reasoning: HUGE }, ORIGIN.seat1),

        spend_appeal: (impl) => impl.spend_appeal({ reason: HUGE }, ORIGIN.A)
      };

      it('covers every key in the real map — a tool added without an entry here fails this, not silently', () => {
        const impl = createToolImpl(buildDeps().deps);
        expect(Object.keys(invocations).sort()).toEqual(Object.keys(impl).sort());
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

  describe('extract_text', () => {
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
