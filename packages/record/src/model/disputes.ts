import type { Dispute, Locator, Side } from './types';
import type { ExhibitStore } from './exhibits';
import type { Receipts } from './receipts';
import { checkQuote } from './quote';

export interface DisputeInput {
  factId: string;
  by: Side;
  exhibitId: string;
  locator: Locator;
  quote: string;
  because: string;
}

/**
 * The layer-1 guard. Evidence cannot be waved away by someone who never
 * demonstrably read it. Refusing here PRODUCES evidence — the party must go and
 * open the exhibit, and that read lands on the record. Contrast draft_verdict,
 * where refusing would only produce silence, so the absence is drawn instead.
 */
export class DisputeStore {
  private items: Dispute[] = [];

  constructor(private exhibits: ExhibitStore, private receipts: Receipts) {}

  record(input: DisputeInput): Dispute {
    if (!this.receipts.hasOpened(input.by, input.exhibitId)) {
      throw new Error(`${input.by} has not opened ${input.exhibitId}`);
    }
    const exhibit = this.exhibits.get(input.exhibitId);
    // Same string AssessmentStore throws — one missing-exhibit error across both
    // stores, not two spellings of the same refusal.
    if (!exhibit) throw new Error(`no such exhibit: ${input.exhibitId}`);

    const check = checkQuote(exhibit, input.locator, input.quote);
    // check.reason, not a hardcoded string — matches AssessmentStore.record. checkQuote
    // already distinguishes "no such page", "an empty quote proves nothing" and "quote
    // not found" with different reasons; collapsing them here would tell a party the
    // wrong thing is wrong, which is the exact failure class this project exists to catch.
    if (check.verifiable && !check.found) {
      throw new Error(check.reason);
    }

    const dispute: Dispute = {
      id: `D${this.items.length + 1}`,
      factId: input.factId,
      by: input.by,
      points: { exhibitId: input.exhibitId, locator: input.locator },
      quote: input.quote,
      because: input.because,
      verified: check.verifiable ? 'machine-checked' : 'human-check'
    };
    this.items.push(dispute);
    return dispute;
  }

  forFact(factId: string): Dispute | undefined {
    return this.items.find((d) => d.factId === factId);
  }

  all(): Dispute[] {
    return [...this.items];
  }
}
