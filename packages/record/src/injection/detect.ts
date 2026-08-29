// This file runs on the RECORD page and SHOWS, NEVER STRIPS. It is evidence
// for the human reader: a filed exhibit can carry text an author wrote to
// steer whoever — human or agent — reads it later, and the record's job is
// to surface that attempt next to the raw text, not to launder it away.
// Silently scrubbing it would recreate the black box this whole project
// exists to replace, and it would destroy the very evidence a seat or a
// judge needs to see.
//
// Its counterpart is `packages/panel/src/agent/sanitize.ts`, which runs in
// the PANEL, immediately before counterparty text reaches a model, and DOES
// fence and redact — because that string is about to be handed to something
// that can act on instructions embedded in it. Two different jobs. Merging
// them would either blind the humans reading this page (if this file
// stripped) or feed a model raw, unfenced instructions (if sanitize.ts only
// flagged). See that file's header for the reverse pointer.
//
// This is defence in depth, not the thing that actually holds. The layer
// that holds is Task 4: `exposedTo` scoping tools to an origin, enforced by
// the browser. Nothing in this file expands or restricts what any seat can
// do — it only makes an attempt visible on the record.

export interface Flag {
  pattern: string;
  index: number;
  matched: string;
}

// Module-level so the regex objects (and their `lastIndex` cursors) are
// built once, not re-compiled on every call. That reuse is exactly why the
// `lastIndex` reset below is not optional — see the comment on the loop.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'system-impersonation', re: /system\s*:\s*(disregard|ignore)\s+(all\s+)?(prior|previous)\s+\w+/gi },
  { name: 'instruction-override', re: /ignore\s+(all\s+)?previous\s+instructions?/gi },
  { name: 'role-reassignment', re: /you\s+are\s+now\s+(a|an|the)\s+\w+/gi },
  // Fix round 1 — a reviewer found the original `\b`-terminated version of
  // this pattern cried wolf on ordinary evidence: `\b` only checks the
  // transition between a word character and a non-word character, so it is
  // satisfied by the space after "a" in "the rule for a late delivery" just
  // as readily as by the end of "rule for B." — it does not care what comes
  // next. Fixed by requiring the party letter be a standalone token:
  // followed by punctuation or the end of the string/clause, or preceded by
  // "side".
  //
  // Fix round 2 — that guard was over-tightened: it was only ever needed
  // for "a", because "a" doubles as the indefinite article. "b" has no such
  // collision, so guarding it the same way made "rule for B in this
  // matter" stop matching. Made asymmetric: "a" keeps the lookahead; "b"
  // uses a plain `\b`. Also added "party" alongside "side" as a second way
  // to introduce the letter.
  //
  // Fix round 3 — the round-2 asymmetry still applied the article-guard
  // lookahead to "a" even when "side" or "party" immediately precedes it,
  // where "a" cannot possibly be the indefinite article ("rule for side a
  // late delivery" is not English). That made the detector systematically
  // better at catching an attempt aimed at B than an identical one aimed at
  // A — a per-party blind spot this project's whole claim of even-handed
  // treatment cannot afford. Fixed by relaxing to a plain `\b` for BOTH
  // letters whenever "side"/"party" precedes them, for both connectors
  // ("for" and "in favour of").
  //
  // That relaxation reopens a different false positive: "no rule for party
  // A to follow" ASSERTS THE ABSENCE of a rule — the opposite of a directed
  // outcome — so every side/party-relaxed branch additionally requires
  // "rule" not be immediately preceded by the standalone word "no" (a
  // negative lookbehind, scoped with `\b` so it can't misfire on a word
  // that merely ends in "no", e.g. "the casino rule for B.").
  //
  // DECISION (asked for explicitly in round 3): "in favour of" does NOT get
  // the same full relaxation "for" without a prefix keeps needing. "in
  // favour of a refund" is exactly as plausible ordinary language as "for a
  // refund" — the indefinite-article collision is connector-independent —
  // so relaxing "favour of" wholesale would reopen the very false-positive
  // class round 1 closed, just behind a different preposition. "in favour
  // of A" without "side"/"party" therefore keeps the article-guard lookahead,
  // same as bare "for A".
  //
  // RESIDUE, NAMED PLAINLY: without a "side"/"party" prefix, this pattern
  // still catches a directed outcome naming B mid-clause ("rule for B in
  // this matter", "rule in favour of B because ...") but MISSES the
  // identical phrasing naming A ("rule for A in this matter", "rule in
  // favour of A in this matter") — because "a" is also the indefinite
  // article and "b" is not, so only "a" needs the terminal-or-punctuation
  // guard to avoid matching "a late delivery", "a refund", "a claim". This
  // is a deliberately accepted, documented limit, not an unnoticed gap: a
  // bare "rule for A ..." only escapes detection when it both lacks a
  // "side"/"party" prefix AND continues past the letter into more text: add
  // either "side"/"party" or a terminal period and it is caught the same as
  // B. See detect.test.ts's pinned must-match / must-not-match / judgment-
  // call cases for the exact boundary this was derived against.
  {
    name: 'directed-outcome',
    re: /(?:(?<!\bno\s)rule\s+for\s+(?:side|party)\s+(?:a|b)\b|rule\s+for\s+(?:a(?=[.,;:!?)]|\s*$)|b\b)|(?<!\bno\s)rule\s+in\s+favou?r\s+of\s+(?:side|party)\s+(?:a|b)\b|rule\s+in\s+favou?r\s+of\s+(?:a(?=[.,;:!?)]|\s*$)|b\b))/gi,
  },
];

/**
 * Scans `text` for imperative-shaped attempts to steer a reader (human or
 * agent) and returns where each one was found, sorted by index. Reports.
 * Never rewrites — `text` is returned to the caller untouched; the raw
 * string still belongs to the record. See the file header for why.
 *
 * Every pattern above is a shared, module-level `/g` RegExp, so `.exec`
 * carries a `lastIndex` cursor across calls. Without resetting it to 0
 * before each scan, a second call on the SAME text (or a call after a
 * partial match on different text) would resume scanning mid-string and
 * silently return different, wrong results — a stateful bug that a caller
 * re-rendering this page on every keystroke would hit constantly. Resetting
 * here, once per pattern per call, makes `detectImperatives` a pure function
 * of `text` regardless of call history.
 */
export function detectImperatives(text: string): Flag[] {
  const flags: Flag[] = [];
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      flags.push({ pattern: name, index: m.index, matched: m[0] });
    }
  }
  return flags.sort((a, b) => a.index - b.index);
}
