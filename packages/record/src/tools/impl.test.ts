import { describe, it, expect, beforeEach } from 'vitest';
import { createToolImpl, withTruncation, type ToolImplDeps } from './impl';
import { ExhibitStore } from '../model/exhibits';
import { FactStore } from '../model/facts';
import { Receipts, AssessmentStore } from '../model/receipts';
import { DisputeStore } from '../model/disputes';
import { VerdictStore } from '../model/verdict';
import type { PhaseMachine } from '../webmcp/phases';
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

    it('truncates an oversized result from every single body in the real map', async () => {
      const impl = createToolImpl(ctx.deps);
      const names = Object.keys(impl); // enumerate from the map itself
      const oversized = 'x'.repeat(TOOL_OUTPUT_BUDGET + 500);
      // A synthetic bodies map sharing the REAL map's keys, run through the
      // SAME shared factory production code uses — this proves the seam
      // itself truncates, independent of what any one tool's real business
      // logic happens to return.
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
    it('spends through the phase machine for the calling side, via the lazy thunk', async () => {
      const impl = createToolImpl(ctx.deps);
      await impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.A);
      expect(ctx.spentAppeals).toEqual(['A']);
    });

    // Gap found and fixed while wiring this for real: nothing previously
    // called `enter('REVIEW')` after an appeal was spent, so the phase was
    // left stuck at VERDICT with no button in the shipped UI to leave it.
    it('re-opens REVIEW after spending, per design spec v3 §9', async () => {
      const impl = createToolImpl(ctx.deps);
      await impl.spend_appeal({ reason: 'the summary omits page 3' }, ORIGIN.B);
      expect(ctx.enteredPhases).toEqual(['REVIEW']);
    });
  });
});
