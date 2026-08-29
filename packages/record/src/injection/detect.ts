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
  // next. A filed policy quoting perfectly ordinary contract language like
  // "the rule for a refund" or "no rule for a claim" lit up red on the
  // record page next to genuine evidence.
  //
  // The fix requires the party letter to be a STANDALONE token: followed by
  // punctuation or the end of the string/clause (the lookahead), or preceded
  // by "side". A real directed-outcome attempt names a party and stops —
  // "rule for B.", "rule in favour of A", "rule for side B" — while the
  // false positives always continue into a noun phrase — "a late delivery",
  // "a refund", "a claim" — which the lookahead correctly refuses to match
  // through. See detect.test.ts for the six pinned cases (three must-match,
  // three must-not-match) this was derived against.
  { name: 'directed-outcome', re: /rule\s+(for|in\s+favou?r\s+of)\s+(side\s+)?(a|b)(?=[.,;:!?)]|\s*$)/gi },
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
