import type { Side } from './types';

export interface Objection { id: string; by: Side; text: string; at: string }

/** "Recorded, not adjudicated" (spec v3 §5) — recorded means kept, in full. */
export class ObjectionStore {
  private items: Objection[] = [];
  record(input: { by: Side; text: string; at: string }): Objection {
    const objection: Objection = { id: `O${this.items.length + 1}`, ...input };
    this.items.push(objection);
    return objection;
  }
  all(): Objection[] { return [...this.items]; }
}
