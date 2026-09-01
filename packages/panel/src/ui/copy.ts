// Panel copy — Task 5, updated in fix round 1 per copy-final.md's "Task 5,
// round 2" section (31 Aug) and the corrections layered into "Panel line
// states (Task 5)" itself (the broke note) and "The panel's empty state"
// (I5's ruling).
//
// Two sources, kept apart on purpose:
//
// 1. EXAMPLES and ACTOR_NAME are ported from the design
//    (docs/design/claude-design/the-board.dc.html, the EXAMPLES and ACTORS
//    consts around lines 528-577). The brief is explicit that these are not
//    "the design's data" in the sense Global Constraint 2 forbids — they are
//    instructions an operator could actually type, matched to the real tool
//    set (file_exhibit, dispute, cite, draft_verdict, ...), not invented
//    case facts like the design's `T` transcripts or its case id. Seat 2's
//    first example is REPLACED per fix round 1, I6: it asked to
//    `return_with_note`, a tool in `NEVER_GRANTED` — an example that can
//    only ever come back refused is not a real example.
//
// 2. Every other string here is copied verbatim from copy-final.md.
import type { Actor } from '../../../record/src/model/types';

/** Friendly display name, e.g. for "Type an instruction for Advocate A".
 *  Distinct from ui/theme.ts's ACTOR_LABEL, which is the all-caps badge
 *  ("ADVOCATE A") used elsewhere — wrong register for a sentence. */
export const ACTOR_NAME: Record<Actor, string> = {
  A: 'Advocate A',
  B: 'Advocate B',
  seat1: 'Seat 1',
  seat2: 'Seat 2',
};

export const EXAMPLES: Record<Actor, string[]> = {
  A: [
    'File the signed agreement as an exhibit.',
    // Fix round 2, N10: was 'File the delivery date as a fact and mark it
    // agreed.' — "mark it agreed" asks A to concede its OWN just-filed
    // fact, which facts.ts's self-dealing guard always refuses. Same
    // class of defect as I6 (seat2's return_with_note example): an
    // offered example that can only ever come back refused is not a
    // real example.
    'File the delivery date as a fact on the record.',
    'Dispute the second paragraph of their letter.',
  ],
  B: [
    'Open exhibit-1 and read the clause about timing.',
    'Concede the date, then dispute what it means.',
    'File our own letter as an exhibit.',
  ],
  seat1: [
    'Have the page read out the scanned letter.',
    'Search both exhibits for delivery window.',
    'Write an assessment of where the two sides actually differ.',
  ],
  seat2: [
    // Fix round 1, I6: was 'Return the case with a note if a citation does
    // not match its source.' — return_with_note is in NEVER_GRANTED.
    'Assess whether each side\'s citation matches its source.',
    'Cite the line each side is relying on.',
    'Draft a verdict for a person to read.',
  ],
};

// -----------------------------------------------------------------------
// Fix round 1, I5: the panel does not know the record's current phase, so
// the empty state must never infer one from a tool count — that was the
// exact defect this ruling corrects (a seat panel printing "Tools arrive
// at review" after review has already been and gone in CONFIRMED). The
// three lines below are keyed ONLY off the tool count's own tri-state
// (known nonzero / known zero / unknown — see ui/theme's toolCountLabel
// note in App.tsx for why "unknown" and "zero" are different states, not
// one collapsed into the other).
// -----------------------------------------------------------------------
export const EMPTY_LINE_DEFAULT = 'No instruction yet. Any of these runs with the tools this agent holds right now.';
export const EMPTY_LINE_ZERO_TOOLS = 'This agent holds no tools right now.';
export const TOOL_COUNT_UNAVAILABLE = 'tool count unavailable';
// Fix round 2, N5: "not read yet" (the very first paint, before the first
// getGrantedTools() call has even resolved) is a DIFFERENT claim than
// "could not be read" (a read was attempted and failed) — the same
// category error I4 already fixed one state earlier. Collapsing both into
// TOOL_COUNT_UNAVAILABLE on first paint says "this failed" about a read
// that hasn't happened yet.
export const TOOL_COUNT_PENDING = 'reading tool count…';

export const REFUSED_CHIP = 'Refused at the boundary';
export const REFUSED_NOTE = 'This is the product working. Your instruction is still in the box below.';

export const NOTGRANTED_CHIP = 'Not handed over';

export const BROKE_CHIP = 'Something broke';
// Fix round 1, I1 + M1: the retry re-runs the WHOLE goal from step 0, so a
// turn that already wrote something before breaking will repeat that write
// if retried. Two honest variants, not one that overclaims either way.
export const BROKE_NOTE_NO_PRIOR_SUCCESS = 'Nothing from this step reached the record.';
export const BROKE_NOTE_HAD_PRIOR_SUCCESS = 'Steps that already completed are on the record. Running this again will repeat them.';
export const BROKE_RETRY_LABEL = 'Run it again';
export const BROKE_RETRY_ANYWAY_LABEL = 'Run it again anyway';

// Fix round 1, I7: Stop cannot cancel a call already sent to Chrome's real
// WebMCP machinery — there is no way to call one back. This is the honest
// beat instead of a false claim of cancellation, appended as the turn's
// ONE entry when a stopped run settles anyway.
export const STOPPED_FINISHED_ANYWAY =
  'The run you stopped finished anyway. Nothing was cancelled — there is no way to call a tool back once it has gone.';

export const STOP_LABEL = 'Stop';
export const RUN_LABEL = 'Run';

/**
 * Fix round 1, I4 + fix round 2, N5 — a genuine tri-state, not two states
 * doing the work of three:
 *   - `undefined`: not read yet (first paint, before the first
 *     `getGrantedTools()` call has resolved either way).
 *   - `null`: a read was attempted and failed — DISTINCT from a real `0`
 *     (I4: a failed read must never render as the confident claim "0 tools
 *     in hand").
 *   - `number`: the real, known count.
 */
export function toolCountLabel(n: number | null | undefined): string {
  if (n === undefined) return TOOL_COUNT_PENDING;
  if (n === null) return TOOL_COUNT_UNAVAILABLE;
  return n === 1 ? '1 tool in hand' : `${n} tools in hand`;
}

export function jumpLabel(pending: number): string {
  return pending > 0 ? `Jump to latest, ${pending} new` : 'Jump to latest';
}

export function composerPlaceholder(actorName: string): string {
  return `Type an instruction for ${actorName}`;
}
