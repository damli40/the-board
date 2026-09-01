import type { Fact, Locator, Side } from './types';
// Task 5, fix round 2, N1: the self-dealing guards (concede/dispute your
// own fact) and the missing-fact guard are deliberate refusals, same class
// as impl.ts's own — marked so they don't render as broke.
import { Refusal } from '../webmcp/ledger';

// Recovery-clause note (finish task, refusal-copy round): a self-dealing
// refusal has no retry for the ACTING side — the honest next move is to
// name who can act, not a tool to call again (there is no tool for "concede
// on someone else's behalf"). `Side` is exactly two values, so the other
// side is always this simple flip — never a guess and never text the caller
// supplied.
//
// Exported: `tools/impl.ts`'s own `dispute` body pre-checks this exact
// self-dealing rule before ever calling `disputes.record` (see that file's
// own comment), and the finish task's scope-extension round requires that
// guard's message end up byte-identical to this one's — sharing the
// function is what keeps the two from drifting apart by hand.
export const otherSide = (s: Side): Side => (s === 'A' ? 'B' : 'A');

export interface FactInput {
  side: Side;
  text: string;
  points: { exhibitId: string; locator: Locator };
  counters?: string;
}

export class FactStore {
  private items: Fact[] = [];

  file(input: FactInput): Fact {
    const fact: Fact = {
      id: `F${this.items.length + 1}`,
      side: input.side,
      text: input.text,
      points: input.points,
      status: 'unopposed',
      counters: input.counters
    };
    this.items.push(fact);
    return fact;
  }

  private require(id: string): Fact {
    const f = this.items.find((x) => x.id === id);
    // file_fact IS the tool that produces a real fact id, and every real
    // path into this guard (the `concede` tool; `attachDispute` reached via
    // the `dispute` tool) is A/B in `filing`, the same actor set that holds
    // file_fact — so naming it would not be wrong the way the exhibit
    // guards' cross-lifetime sharing makes search_exhibits wrong there
    // (search_exhibits is boardRead-only; A/B do hold read_board, but the
    // seats that reach AssessmentStore's copy of that guard do not, and the
    // two clauses stay byte-identical). Left conservative anyway: this is a PRIVATE method any
    // future FactStore caller can reach, and under-claiming a recovery
    // clause is safe where a wrong one is not (this task's own brief).
    if (!f) throw new Refusal(`no such fact: ${id}; use a fact id that was actually filed`);
    return f;
  }

  concede(id: string, by: Side): Fact {
    const f = this.require(id);
    if (f.side === by) throw new Refusal(`cannot concede your own fact; only ${otherSide(by)} can concede it`);
    f.status = 'conceded';
    return f;
  }

  dispute(id: string, by: Side): Fact {
    const f = this.require(id);
    if (f.side === by) throw new Refusal(`cannot dispute your own fact; only ${otherSide(by)} can dispute it`);
    f.status = 'disputed';
    return f;
  }

  /**
   * Links a real Dispute record (Task 3/4) to the fact it disputes and sets
   * status to 'disputed' together, in one guarded write. This is the only
   * legitimate way to set `disputeId` — there is no public setter for it —
   * so a dispute tool never needs to reach around the store (e.g.
   * `facts.get(id).disputeId = d.id`) to link the two, which would also
   * silently reach past this same self-dealing guard.
   */
  attachDispute(factId: string, disputeId: string, by: Side): Fact {
    const f = this.require(factId);
    if (f.side === by) throw new Refusal(`cannot dispute your own fact; only ${otherSide(by)} can dispute it`);
    f.status = 'disputed';
    f.disputeId = disputeId;
    return f;
  }

  get(id: string): Fact | undefined {
    return this.items.find((x) => x.id === id);
  }

  all(): Fact[] {
    return [...this.items];
  }
}
