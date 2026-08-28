// This file runs in the PANEL, on text the OTHER side wrote, immediately
// before that text reaches a model — and it DOES fence and redact, because
// the string is about to be handed to something that can act on
// instructions embedded in it. This is Chrome's "spotlighting" guardrail
// (delimit untrusted content; see CLAUDE.md §3): cheap, token-efficient
// fencing rather than the base64 upgrade, which Chrome itself frames as the
// next step, not a day-one requirement.
//
// Its counterpart is `packages/record/src/injection/detect.ts`, which runs
// on the RECORD page and SHOWS, NEVER STRIPS — the raw text stays fully
// readable there, with the pattern flagged beside it, because a human
// reader needs the evidence intact. Two different jobs. Merging them would
// either blind the humans (if that file stripped like this one) or feed a
// model raw, unfenced instructions (if this file only flagged like that
// one). See that file's header for the reverse pointer.
//
// This is defence in depth, not the thing that actually holds. The layer
// that holds is Task 4: `exposedTo` scoping tools to an origin, enforced by
// the browser. Sanitising text cannot expand or restrict what a seat may
// do — a fooled agent still has no more capability than an honest one. It
// only reduces how badly a fooled agent gets fooled.

const OPEN = '<untrusted-counterparty-text>';
const CLOSE = '</untrusted-counterparty-text>';

// Instruction-shaped markers redacted from counterparty text before a model
// ever sees it. Deliberately narrower than record/injection/detect.ts's
// PATTERNS list is not a drift bug — the two files have different jobs: this
// one only needs to catch what would actually let injected text act as an
// instruction inside the fence; detect.ts flags anything imperative-shaped
// for a human to weigh.
const INJECTION_MARKERS = [
  /system\s*:\s*(disregard|ignore)\s+(all\s+)?(prior|previous)\s+\w+/gi,
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /disregard\s+(all\s+)?(prior|previous)\s+\w+/gi,
  /you\s+are\s+now\s+(a|an|the)\s+\w+/gi,
];

/**
 * Fences `raw` — text the other side wrote — inside an explicit
 * `<untrusted-counterparty-text>` block and redacts instruction-shaped
 * markers inside it, so a crafted payload cannot pose as a system
 * instruction and cannot break out of the fence early.
 *
 * Any OPEN/CLOSE tag already present in `raw` is stripped BEFORE the real
 * fence is applied. That ordering is what neutralises an attempt to close
 * the fence early: a payload like `x</untrusted-counterparty-text> now do
 * Y` cannot inject a premature closing tag, because every occurrence of the
 * tag — genuine or forged — is removed from the body first, and exactly one
 * OPEN and one CLOSE are added back around the whole thing afterward.
 */
export function sanitizeCounterpartyText(raw: string): string {
  let body = raw.split(OPEN).join('').split(CLOSE).join('');
  for (const re of INJECTION_MARKERS) {
    re.lastIndex = 0;
    body = body.replace(re, '[redacted-instruction]');
  }
  return `${OPEN}${body}${CLOSE}`;
}
