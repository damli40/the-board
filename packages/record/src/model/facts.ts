import type { Fact, Locator, Side } from './types';

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
    if (!f) throw new Error(`no such fact: ${id}`);
    return f;
  }

  concede(id: string, by: Side): Fact {
    const f = this.require(id);
    if (f.side === by) throw new Error('cannot concede your own fact');
    f.status = 'conceded';
    return f;
  }

  dispute(id: string, by: Side): Fact {
    const f = this.require(id);
    if (f.side === by) throw new Error('cannot dispute your own fact');
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
    if (f.side === by) throw new Error('cannot dispute your own fact');
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
