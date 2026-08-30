export type Side = 'A' | 'B';
export type Seat = 'seat1' | 'seat2';
export type Actor = Side | Seat;
export type Phase = 'FILING' | 'REVIEW' | 'VERDICT' | 'CONFIRMED';

// The five real origins (dev: localhost ports; prod: the five *.netlify.app
// sites, see docs/evidence/deploy.md) live in exactly one place,
// packages/record/src/config/origins.ts, which resolves dev vs prod at
// runtime, so no file ever needs its own production swap. This re-export
// lets every later task
// import ORIGIN / PARENT_ORIGIN from './types' (or '../model/types') without
// this file duplicating the strings. origins.ts imports `Actor` (above) back
// as a type-only import to key ORIGIN, so the actor union itself also has
// exactly one definition site — this file.
export { ORIGIN, PARENT_ORIGIN } from '../config/origins';

export type ExhibitKind = 'text' | 'pdf' | 'image' | 'capture' | 'rule';   // a published rule or policy, so an outcome can name what it rests on

/** Where inside an exhibit a claim points. Empty object means the whole document. */
export interface Locator {
  /** 1-based page number. PDFs only. */
  page?: number;
  /** 1-based inclusive line range [from, to]. Text and captures only. */
  lines?: [number, number];
}

export interface Exhibit {
  id: string;                  // 'E1', 'E2', ...
  side: Side;
  kind: ExhibitKind;
  name: string;
  sha256: string;              // identity is content
  /** Whole-document text. null for images — nothing machine-readable exists. */
  text: string | null;
  /** Per-page text. PDFs only. Undefined elsewhere. */
  pages?: string[];
  sourceUrl?: string;
  captured?: 'proxy-fetch' | 'party-supplied';
  filedAt: string;             // ISO string, fixed in the scenario
}

export interface Fact {
  id: string;                  // 'F1', 'F2', ...
  side: Side;
  text: string;
  points: { exhibitId: string; locator: Locator };
  status: 'unopposed' | 'conceded' | 'disputed';
  /** The fact this one answers, if any. */
  counters?: string;
  /** Set when the other side disputes it. A dispute is evidence, not a click. */
  disputeId?: string;
}

/**
 * Disputing costs something. Structurally parallel to an Assessment and guarded the
 * same way: the disputing side must have opened the exhibit, and the quote must
 * really be there. This is the layer-1 rule — it runs with no board involved.
 */
export interface Dispute {
  id: string;                  // 'D1', 'D2', ...
  factId: string;
  by: Side;
  points: { exhibitId: string; locator: Locator };
  quote: string;
  because: string;
  verified: 'machine-checked' | 'human-check';
}

/** The rule an outcome rests on — or a record that it rests on nothing. */
export type Basis =
  | { cited: true; factId: string; exhibitId: string }
  | { cited: false; reason: 'no rule exhibit cited' };

export type Finding = 'supported' | 'contradicted' | 'not-addressed' | 'cannot-tell';

export interface Assessment {
  id: string;                  // 'AS1', ...
  seat: Seat;
  factId: string;
  exhibitId: string;
  locator: Locator;
  finding: Finding;
  quote: string;
  because: string;
  /** How the quote was established. Rendered on the page beside the citation. */
  verified: 'machine-checked' | 'human-check';
}

export type Outcome = 'UPHELD' | 'OVERTURNED';

export interface Verdict {
  seat: Seat;
  outcome: Outcome;
  cited: string[];             // factIds
  opened: string[];            // exhibitIds this seat opened
  neverOpened: string[];       // exhibitIds it did not
  reasoning: string;
  /** cite refuses an unfiled rule; draft_verdict records its absence instead. */
  basis: Basis;
}
