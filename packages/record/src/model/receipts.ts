import type { Actor, Assessment, Finding, Locator, Seat } from './types';
import type { ExhibitStore } from './exhibits';
import { checkQuote } from './quote';

/** Which actor has opened which exhibit. Written only by the open_exhibit tool. */
// Actor, not Seat. Parties are receipted too, because `dispute` now requires a read.
// Widening this one type is what lets the read-receipt chain run on both layers.
export class Receipts {
  private opened = new Map<Actor, Set<string>>();

  // Ruling 2 (controller, task 9): this method performs no existence check
  // on `exhibitId` — the validating caller is the `open_exhibit` tool body
  // in packages/record/src/tools/impl.ts, which throws `no such exhibit:
  // <id>` BEFORE calling this, so a phantom id can never ride into a read
  // receipt (and from there into `VerdictStore.draft`'s `opened` list and
  // `computeSplit`'s `differingInput`).
  markOpened(actor: Actor, exhibitId: string): void {
    if (!this.opened.has(actor)) this.opened.set(actor, new Set());
    this.opened.get(actor)!.add(exhibitId);
  }

  hasOpened(actor: Actor, exhibitId: string): boolean {
    return this.opened.get(actor)?.has(exhibitId) ?? false;
  }

  openedBy(actor: Actor): string[] {
    return [...(this.opened.get(actor) ?? [])];
  }
}

export interface AssessmentInput {
  seat: Seat;
  factId: string;
  exhibitId: string;
  locator: Locator;
  finding: Finding;
  quote: string;
  because: string;
}

export class AssessmentStore {
  private items: Assessment[] = [];

  constructor(private exhibits: ExhibitStore, private receipts: Receipts) {}

  record(input: AssessmentInput): Assessment {
    if (!this.receipts.hasOpened(input.seat, input.exhibitId)) {
      throw new Error(`${input.seat} has not opened ${input.exhibitId}`);
    }

    const exhibit = this.exhibits.get(input.exhibitId);
    if (!exhibit) throw new Error(`no such exhibit: ${input.exhibitId}`);

    const check = checkQuote(exhibit, input.locator, input.quote);
    if (check.verifiable && !check.found) throw new Error(check.reason);

    const assessment: Assessment = {
      id: `AS${this.items.length + 1}`,
      seat: input.seat,
      factId: input.factId,
      exhibitId: input.exhibitId,
      locator: input.locator,
      finding: input.finding,
      quote: input.quote,
      because: input.because,
      verified: check.verifiable ? 'machine-checked' : 'human-check'
    };

    this.items.push(assessment);
    return assessment;
  }

  /** cite() calls this. No assessment, no citation. */
  heldFor(seat: Seat, factId: string): boolean {
    return this.items.some((a) => a.seat === seat && a.factId === factId);
  }

  forSeat(seat: Seat): Assessment[] {
    return this.items.filter((a) => a.seat === seat);
  }

  all(): Assessment[] {
    return [...this.items];
  }
}
