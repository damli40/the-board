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

  get(id: string): Fact | undefined {
    return this.items.find((x) => x.id === id);
  }

  all(): Fact[] {
    return [...this.items];
  }
}
