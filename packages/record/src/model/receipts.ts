import type { Actor, Assessment, Finding, Locator, Seat } from './types';
import type { ExhibitStore } from './exhibits';
import { checkQuote } from './quote';
// Task 5, fix round 2, N1: same reasoning as disputes.ts's own comment —
// AssessmentStore's read-receipt and quote guards fire on the demo path
// too and must be marked deliberate, not left to render as broke.
import { Refusal } from '../webmcp/ledger';

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
      // open_exhibit is safe to name: it is held by ['seat1','seat2'] in
      // THIS lifetime (boardRead) — see webmcp/tools.ts.
      throw new Refusal(`${input.seat} has not opened ${input.exhibitId}; call open_exhibit first`);
    }

    const exhibit = this.exhibits.get(input.exhibitId);
    // Byte-identical to DisputeStore.record's own "no such exhibit" string —
    // see that file's comment on why neither actor set gets a tool name here.
    if (!exhibit) throw new Refusal(`no such exhibit: ${input.exhibitId}; use an exhibit id that was actually filed`);

    // Each reason checkQuote returns already carries its own recovery
    // clause (quote.ts) — appended once, at the source, not duplicated here.
    const check = checkQuote(exhibit, input.locator, input.quote);
    if (check.verifiable && !check.found) throw new Refusal(check.reason);

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
