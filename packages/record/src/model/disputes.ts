import type { Dispute, Locator, Side } from './types';
import type { ExhibitStore } from './exhibits';
import type { Receipts } from './receipts';
import { checkQuote } from './quote';
// Task 5, fix round 2, N1: this store's guards fire on the demo's central
// beat ("the seat tried to dispute a document it never read, and the
// record refused") — they need to be marked as deliberate refusals the
// same way impl.ts's own guards are, or they render as a machinery
// failure with a retry button that only fails again. See ledger.ts's own
// comment on Refusal for the full mechanism.
import { Refusal } from '../webmcp/ledger';

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
      // open_exhibit is safe to name: it is held by ['A','B'] in THIS
      // lifetime (filing) too — see webmcp/tools.ts's own 'filing' copy.
      throw new Refusal(`${input.by} has not opened ${input.exhibitId}; call open_exhibit first`);
    }
    const exhibit = this.exhibits.get(input.exhibitId);
    // Same string AssessmentStore throws — one missing-exhibit error across both
    // stores, not two spellings of the same refusal. Kept byte-identical
    // deliberately, including the recovery clause: neither actor set that can
    // reach this guard (A/B here, seat1/seat2 in AssessmentStore) holds a tool
    // that reads exhibit ids back (search_exhibits is boardRead-only; A/B do
    // hold read_board, but the seats that reach AssessmentStore's copy of this
    // guard do not, and the two clauses stay byte-identical) — so the clause
    // says where a real id comes from, not a tool name.
    if (!exhibit) throw new Refusal(`no such exhibit: ${input.exhibitId}; use an exhibit id that was actually filed`);

    const check = checkQuote(exhibit, input.locator, input.quote);
    // check.reason, not a hardcoded string — matches AssessmentStore.record. checkQuote
    // already distinguishes "no such page", "an empty quote proves nothing" and "quote
    // not found" with different reasons; collapsing them here would tell a party the
    // wrong thing is wrong, which is the exact failure class this project exists to catch.
    // Each of those reasons already carries its own recovery clause — see quote.ts.
    if (check.verifiable && !check.found) {
      throw new Refusal(check.reason);
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
