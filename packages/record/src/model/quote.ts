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

/** The text the locator points at, or an error string describing why there is none. */
function scopeText(exhibit: Exhibit, locator: Locator): { text: string } | { error: string } {
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

  if (normaliseForQuote(quote) === '') {
    return { verifiable: true, found: false, reason: 'an empty quote proves nothing' };
  }

  const scope = scopeText(exhibit, locator);
  if ('error' in scope) {
    return { verifiable: true, found: false, reason: scope.error };
  }

  const found = normaliseForQuote(scope.text).includes(normaliseForQuote(quote));
  return found
    ? { verifiable: true, found: true, verified: 'machine-checked' }
    : { verifiable: true, found: false, reason: `quote not found in ${exhibit.id} at the given locator` };
}
