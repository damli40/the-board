import { describe, it, expect, beforeEach } from 'vitest';
import { VerdictStore, computeSplit } from './verdict';
import { Receipts, AssessmentStore } from './receipts';
import { ExhibitStore } from './exhibits';
import { FactStore } from './facts';
import { Ledger } from '../webmcp/ledger';
import { ORIGIN, type Verdict } from './types';

const bytes = (s: string) => new TextEncoder().encode(s).buffer;

// Ruling 1 (controller, task 6): VerdictStore takes FOUR constructor
// arguments — assessments, receipts, facts, exhibits — not the two the
// brief's own test literally wrote. It needs FactStore and ExhibitStore to
// resolve a basis by walking fact -> exhibit -> kind.
describe('VerdictStore', () => {
  let receipts: Receipts, exhibits: ExhibitStore, assessments: AssessmentStore,
      facts: FactStore, verdicts: VerdictStore;

  beforeEach(async () => {
    receipts = new Receipts();
    exhibits = new ExhibitStore();
    assessments = new AssessmentStore(exhibits, receipts);
    facts = new FactStore();
    verdicts = new VerdictStore(assessments, receipts, facts, exhibits);
    await exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('No objection was raised.'), filedAt: '2026-08-20T09:00:00Z' });
    await exhibits.add({ side: 'B', kind: 'text', name: 'b.txt', bytes: bytes('An objection was raised.'), filedAt: '2026-08-20T09:01:00Z' });
  });

  const assessE1 = (seat: 'seat1' | 'seat2') => {
    receipts.markOpened(seat, 'E1');
    assessments.record({ seat, factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'No objection was raised', because: 'stated directly' });
  };

  it('refuses a citation from a seat holding no assessment for that fact', () => {
    expect(() => verdicts.cite('seat1', 'F1')).toThrow('seat1 holds no assessment for F1');
  });

  it('accepts the citation once an assessment exists', () => {
    assessE1('seat1');
    expect(verdicts.cite('seat1', 'F1')).toEqual(['F1']);
  });

  it('does not double-count a repeated citation', () => {
    assessE1('seat1');
    verdicts.cite('seat1', 'F1');
    expect(verdicts.cite('seat1', 'F1')).toEqual(['F1']);
  });

  it('carries cited, opened and never-opened into the draft', () => {
    assessE1('seat1');
    verdicts.cite('seat1', 'F1');
    const v = verdicts.draft('seat1', 'UPHELD', 'The exhibit is unopposed.', ['E1', 'E2']);
    expect(v.cited).toEqual(['F1']);
    expect(v.opened).toEqual(['E1']);
    expect(v.neverOpened).toEqual(['E2']);
  });
});

// Ruling 2 (controller, task 6): the five basis tests the brief embedded as a
// comment ("Tests Task 6 must carry for the basis") are REQUIRED, written as
// real tests here — not left as a comment. Fixed along the way: the brief's
// versions used lowercase 'upheld', but Outcome is 'UPHELD' | 'OVERTURNED'.
describe('VerdictStore basis', () => {
  let receipts: Receipts, exhibits: ExhibitStore, assessments: AssessmentStore,
      facts: FactStore, verdicts: VerdictStore;

  beforeEach(async () => {
    receipts = new Receipts();
    exhibits = new ExhibitStore();
    assessments = new AssessmentStore(exhibits, receipts);
    facts = new FactStore();
    verdicts = new VerdictStore(assessments, receipts, facts, exhibits);

    // E1: an ordinary filed document, not a rule.
    await exhibits.add({ side: 'A', kind: 'text', name: 'a.txt', bytes: bytes('No objection was raised.'), filedAt: '2026-08-20T09:00:00Z' });
    // E2: a published rule exhibit — the only kind a basis can rest on.
    await exhibits.add({ side: 'A', kind: 'rule', name: 'policy.txt', bytes: bytes('Objections must be raised within fourteen days.'), filedAt: '2026-08-20T09:02:00Z' });

    facts.file({ side: 'A', text: 'No objection was raised.', points: { exhibitId: 'E1', locator: {} } });           // F1 -> E1, not a rule
    facts.file({ side: 'A', text: 'Objections must be raised within fourteen days.', points: { exhibitId: 'E2', locator: {} } }); // F2 -> E2, a rule

    receipts.markOpened('seat1', 'E1');
    assessments.record({ seat: 'seat1', factId: 'F1', exhibitId: 'E1', locator: {}, finding: 'supported', quote: 'No objection was raised', because: 'stated directly' });

    receipts.markOpened('seat1', 'E2');
    assessments.record({ seat: 'seat1', factId: 'F2', exhibitId: 'E2', locator: {}, finding: 'supported', quote: 'Objections must be raised within fourteen days', because: 'names the rule' });
  });

  it('records no basis when the seat named no rule', () => {
    const v = verdicts.draft('seat1', 'UPHELD', '...', ['E1']);
    expect(v.basis).toEqual({ cited: false, reason: 'no rule exhibit cited' });
  });

  it('records no basis when the named fact was never cited', () => {
    const v = verdicts.draft('seat1', 'UPHELD', '...', ['E1'], 'F9');
    expect(v.basis.cited).toBe(false);
  });

  it('records no basis when the fact points at a document that is not a rule', () => {
    verdicts.cite('seat1', 'F1');
    const v = verdicts.draft('seat1', 'UPHELD', '...', ['E1'], 'F1');
    expect(v.basis.cited).toBe(false);
  });

  it('records the basis when a cited fact points at a rule exhibit', () => {
    verdicts.cite('seat1', 'F2');
    const v = verdicts.draft('seat1', 'UPHELD', '...', ['E1', 'E2'], 'F2');
    expect(v.basis).toEqual({ cited: true, factId: 'F2', exhibitId: 'E2' });
  });

  // The single most deliberate decision in this file: draft_verdict never
  // refuses a missing rule. Refusing here would produce only silence.
  it('does not throw when no rule was filed — that is the whole point', () => {
    expect(() => verdicts.draft('seat1', 'UPHELD', '...', ['E1'])).not.toThrow();
  });
});

// Ruling 3 (controller, task 6): every Verdict literal below carries the
// required `basis` field — the brief's versions omitted it and would not
// type-check against the Verdict interface in ./types.
// Ruling 4 (controller, task 6): no origin URL literals — ORIGIN.seat1 /
// ORIGIN.seat2 from '../config/origins' (re-exported by ./types), never a
// hand-written 'https://seat2.theboard.app'.
describe('computeSplit', () => {
  it('reports agreement when both seats reach the same outcome', () => {
    const ledger = new Ledger(() => 1000);
    const a: Verdict = { seat: 'seat1', outcome: 'UPHELD', cited: ['F1'], opened: ['E1'], neverOpened: [], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    const b: Verdict = { seat: 'seat2', outcome: 'UPHELD', cited: ['F1'], opened: ['E1'], neverOpened: [], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    expect(computeSplit(a, b, ledger).split).toBe(false);
  });

  it('names the exhibit one seat read and the other did not', () => {
    const ledger = new Ledger(() => 1000);
    const a: Verdict = { seat: 'seat1', outcome: 'UPHELD', cited: ['F1'], opened: ['E1'], neverOpened: ['E2'], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    const b: Verdict = { seat: 'seat2', outcome: 'OVERTURNED', cited: ['F1', 'F7'], opened: ['E1', 'E2'], neverOpened: [], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    const split = computeSplit(a, b, ledger);
    expect(split.split).toBe(true);
    expect(split.differingInput).toEqual(['E2']);
  });

  it('reads the call counts straight out of the ledger, not from the seats', async () => {
    const ledger = new Ledger(() => 1000);
    await ledger.wrap(ORIGIN.seat2, 'extract_text', async () => 'ok')({});
    await ledger.wrap(ORIGIN.seat2, 'extract_text', async () => 'ok')({});
    const a: Verdict = { seat: 'seat1', outcome: 'UPHELD', cited: [], opened: [], neverOpened: [], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    const b: Verdict = { seat: 'seat2', outcome: 'OVERTURNED', cited: [], opened: [], neverOpened: [], reasoning: '', basis: { cited: false, reason: 'no rule exhibit cited' } };
    const split = computeSplit(a, b, ledger);
    expect(split.callCounts.seat1.extract_text ?? 0).toBe(0);
    expect(split.callCounts.seat2.extract_text).toBe(2);
  });
});
