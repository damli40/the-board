import type { Exhibit, Locator } from './types';

export type QuoteCheck =
  | { verifiable: true; found: true; verified: 'machine-checked' }
  | { verifiable: true; found: false; reason: string }
  | { verifiable: false; verified: 'human-check'; reason: string };

/**
 * Collapse whitespace and case only. Punctuation and word choice are NOT normalised —
 * tolerating those would weaken the proof into a resemblance test, and the whole value
 * of this check is that it is exact about what it is exact about.
 */
export function normaliseForQuote(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The text the locator points at, or an error string describing why there is
 * none. Exported (Task 8) so the citation trace UI can resolve the exact
 * scoped slice a cited assessment quoted from, using the same locator
 * semantics as the check itself — one definition, not a second copy that
 * could drift.
 */
export function scopeText(exhibit: Exhibit, locator: Locator): { text: string } | { error: string } {
  if (locator.page !== undefined) {
    const pages = exhibit.pages;
    if (!pages || locator.page < 1 || locator.page > pages.length) {
      return { error: `${exhibit.id} has no page ${locator.page}` };
    }
    return { text: pages[locator.page - 1] };
  }

  const whole = exhibit.text ?? '';

  if (locator.lines !== undefined) {
    const [from, to] = locator.lines;
    const lines = whole.split('\n');
    if (from < 1 || to > lines.length || from > to) {
      return { error: `${exhibit.id} has no lines ${from}-${to}` };
    }
    return { text: lines.slice(from - 1, to).join('\n') };
  }
  // Recovery-clause note: `scopeText`'s two `error` strings above are also
  // read directly by `ui/citation.ts` (`resolveCitation`'s `scoped` fallback
  // display text), which is not a refusal at all — so the clause is NOT
  // added here. `checkQuote`, below, is the one caller that turns this into
  // a thrown `Refusal`, and it appends the clause to its OWN copy of the
  // reason, leaving this function's return value untouched for its other
  // caller.

  return { text: whole };
}

export function checkQuote(exhibit: Exhibit, locator: Locator, quote: string): QuoteCheck {
  // Keyed off `kind`, not `text === null`: a PDF whose extraction produced nothing
  // also has `text === null`, and calling that "an image" would be a confident false
  // statement about the record — the exact failure class this project exists to catch.
  if (exhibit.kind === 'image') {
    return {
      verifiable: false,
      verified: 'human-check',
      reason: `${exhibit.id} is an image. The page cannot verify this quote — check it yourself.`
    };
  }

  if (exhibit.text === null) {
    return {
      verifiable: false,
      verified: 'human-check',
      reason: `${exhibit.id} has no extracted text. The page cannot verify this quote — check it yourself.`
    };
  }

  // Recovery-clause note (finish task, refusal-copy round): these three
  // `reason` strings are what `disputes.ts` and `receipts.ts` throw
  // verbatim as `Refusal(check.reason)` — the clause belongs here, once,
  // rather than duplicated at both throw sites. Every clause is a plain
  // literal appended at the END, after the exhibit id (a store-generated
  // id, not caller-supplied text) — never in front of it, which is what
  // `noForgery.test.ts` requires. None of them names a tool: this check
  // runs for BOTH an advocate's `dispute` (lifetime `filing`, actors A/B)
  // and a seat's `record_assessment` (lifetime `boardRead`, actors
  // seat1/seat2), and no single tool is held by both actor sets.
  if (normaliseForQuote(quote) === '') {
    return { verifiable: true, found: false, reason: 'an empty quote proves nothing; quote the exact passage relied on' };
  }

  const scope = scopeText(exhibit, locator);
  if ('error' in scope) {
    return { verifiable: true, found: false, reason: `${scope.error}; check the locator against the exhibit` };
  }

  const found = normaliseForQuote(scope.text).includes(normaliseForQuote(quote));
  return found
    ? { verifiable: true, found: true, verified: 'machine-checked' }
    : { verifiable: true, found: false, reason: `quote not found in ${exhibit.id} at the given locator; check the exact wording and the locator` };
}
