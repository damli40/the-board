import { ORIGIN, type Basis, type Outcome, type Seat, type Verdict } from './types';
import type { AssessmentStore, Receipts } from './receipts';
import type { FactStore } from './facts';
import type { ExhibitStore } from './exhibits';
// Task 5, fix round 2, N1: cite's "no assessment held" guard is the last
// link in the read-receipt chain and fires on the demo path — marked
// deliberate, same class as impl.ts's own guards.
import { Refusal, type Ledger } from '../webmcp/ledger';

/**
 * Ruling 1 (controller, task 6): this constructor takes FOUR arguments, not
 * the two the brief's own test literally wrote. `resolveBasis` below has to
 * walk fact -> exhibit -> kind to tell a real rule from anything else, so it
 * needs a FactStore and an ExhibitStore of its own — it cannot borrow them
 * from AssessmentStore, which only proves an exhibit was opened and a quote
 * checks out, not what kind of document sits behind a cited fact.
 */
export class VerdictStore {
  private citations = new Map<Seat, string[]>();
  private drafts = new Map<Seat, Verdict>();

  constructor(
    private assessments: AssessmentStore,
    private receipts: Receipts,
    private facts: FactStore,
    private exhibits: ExhibitStore
  ) {}

  /** No assessment, no citation. The last link in the read-receipt chain. */
  cite(seat: Seat, factId: string): string[] {
    if (!this.assessments.heldFor(seat, factId)) {
      // record_assessment is safe to name: it is held by ['seat1','seat2']
      // in boardRead, and a seat is the only actor that can reach `cite`
      // (verdictDraft, actors seat1/seat2) in the first place.
      throw new Refusal(`${seat} holds no assessment for ${factId}; call record_assessment for it first`);
    }
    const list = this.citations.get(seat) ?? [];
    if (!list.includes(factId)) list.push(factId);
    this.citations.set(seat, list);
    return [...list];
  }

  /**
   * NOTE THE ASYMMETRY, IT IS DELIBERATE. `cite` above THROWS — refusing there
   * makes the seat go and read, and the read lands on the record, so refusing
   * produces evidence. Here it does NOT throw on a missing or invalid basis.
   * Refusing a verdict draft would produce only silence, and silence is the
   * original injury this project answers: an outcome arrives, no rule is
   * named, and there is nothing left to point at. So the absence is recorded
   * instead — `basis: { cited: false }` — and the UI draws NO RULE CITED at
   * the same visual weight as the outcome itself. A hole you can show someone
   * is worth more than a silence you cannot. Do not "improve" this into a
   * throw; that would delete the one deliberate asymmetry in this file.
   *
   * `basisFactId` only counts as a real basis if this seat actually cited it
   * (via `cite`, above) AND it points at an exhibit whose kind is 'rule'.
   * Anything else — omitted, uncited, or pointing at a non-rule document —
   * records `cited: false`.
   */
  draft(
    seat: Seat,
    outcome: Outcome,
    reasoning: string,
    allExhibitIds: string[],
    basisFactId?: string
  ): Verdict {
    const opened = this.receipts.openedBy(seat);
    const cited = [...(this.citations.get(seat) ?? [])];
    // Case-normalise, do not validate membership. `outcome` arrives from a
    // model, and the filmed run puts two DIFFERENT model providers behind
    // seat1/seat2 — one may write "Upheld", the other "UPHELD", and nothing
    // upstream guarantees they agree on case. `computeSplit`'s
    // `a.outcome !== b.outcome` is case-sensitive, so two seats that agree
    // could otherwise print THE SEATS DISAGREE. Fixed here, once, at the
    // single point every draft is stored, so both readers (`computeSplit`
    // and `VerdictPanel`'s `outcome === 'UPHELD'` styling check) see it
    // normalised without being touched themselves.
    //
    // This is NOT membership validation and must not become it — see the
    // asymmetry note above `draft`. A value outside the `Outcome` union
    // (the offline script ships `outcome: 'unproven'`) is uppercased to
    // `'UNPROVEN'` and stored as-is, still outside the union, still
    // rendered. Refusing an unrecognised outcome here would be the same
    // widened refusal this file already warns against.
    const normalized = (typeof outcome === 'string' ? outcome.toUpperCase() : outcome) as Outcome;
    const verdict: Verdict = {
      seat,
      outcome: normalized,
      cited,
      opened,
      neverOpened: allExhibitIds.filter((id) => !opened.includes(id)),
      reasoning,
      basis: this.resolveBasis(cited, basisFactId)
    };
    this.drafts.set(seat, verdict);
    return verdict;
  }

  private resolveBasis(cited: string[], basisFactId?: string): Basis {
    const NO_RULE: Basis = { cited: false, reason: 'no rule exhibit cited' };
    if (!basisFactId || !cited.includes(basisFactId)) return NO_RULE;
    const fact = this.facts.get(basisFactId);
    if (!fact) return NO_RULE;
    const exhibit = this.exhibits.get(fact.points.exhibitId);
    if (!exhibit || exhibit.kind !== 'rule') return NO_RULE;
    return { cited: true, factId: basisFactId, exhibitId: exhibit.id };
  }

  bySeat(seat: Seat): Verdict | undefined {
    return this.drafts.get(seat);
  }

  /**
   * Every draft filed so far, in the order the seats filed them. A copy, like
   * every other store's `all()` — a caller that mutates what it is handed
   * must not be able to edit the record from the outside.
   */
  all(): Verdict[] {
    return [...this.drafts.values()];
  }
}

export interface Split {
  split: boolean;
  /** Exhibits exactly one seat opened. This is the "differing input" lower-third. */
  differingInput: string[];
  callCounts: Record<Seat, Record<string, number>>;
}

/**
 * Computed from the ledger and the read receipts. Neither seat is asked to
 * account for itself, which is the entire point: the page can say why two
 * seats disagree without narrating anything a model wrote.
 */
export function computeSplit(a: Verdict, b: Verdict, ledger: Ledger): Split {
  const onlyA = a.opened.filter((id) => !b.opened.includes(id));
  const onlyB = b.opened.filter((id) => !a.opened.includes(id));

  return {
    split: a.outcome !== b.outcome,
    differingInput: [...new Set([...onlyA, ...onlyB])].sort(),
    callCounts: {
      seat1: ledger.countsFor(ORIGIN.seat1),
      seat2: ledger.countsFor(ORIGIN.seat2)
    }
  };
}
