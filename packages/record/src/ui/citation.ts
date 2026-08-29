// The citation trace (storyboard component 6) draws a line from a cited fact
// to its exhibit, opens the exhibit at the locator, and highlights the exact
// matched substring. `checkQuote` (Task 6) already proves the quote exists
// inside the locator's scope, using whitespace/case-insensitive comparison —
// this file finds WHERE in the original, unnormalised text that match sits,
// so the UI can wrap the real characters the reader sees, not a normalised
// stand-in.
import type { Exhibit, Locator } from '../model/types';
import { scopeText } from '../model/quote';

export interface MatchSpan {
  /** Offset into the locator's scoped text (not the whole document). */
  start: number;
  end: number;
}

/**
 * Finds `quote` inside `source`, tolerating exactly the differences
 * `checkQuote` tolerates — runs of whitespace and letter case — so a
 * highlight lands even when the model's quote collapsed a line break the
 * original text kept. Returns null if the quote is empty or genuinely absent
 * (the caller falls back to a `human-check` stamp instead of a highlight).
 */
export function locateMatch(source: string, quote: string): MatchSpan | null {
  const trimmed = quote.trim();
  if (trimmed === '') return null;

  const words = trimmed.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = words.join('\\s+');
  let match: RegExpExecArray | null;
  try {
    match = new RegExp(pattern, 'i').exec(source);
  } catch {
    return null;
  }
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

export interface CitationTrace {
  exhibitId: string;
  locator: Locator;
  /** The locator's scoped text (a page, a line range, or the whole document). */
  scoped: string;
  /** Where inside `scoped` the quote was found, or null (verify by eye instead). */
  match: MatchSpan | null;
}

/**
 * Resolves a citation down to an exact highlightable span, walking the same
 * locator-scoping rule `checkQuote` uses (page, then line range, then whole
 * document) so this can never disagree with what the record already proved.
 */
export function resolveCitation(exhibit: Exhibit, locator: Locator, quote: string): CitationTrace {
  const scope = scopeText(exhibit, locator);
  const scoped = 'text' in scope ? scope.text : scope.error;
  return {
    exhibitId: exhibit.id,
    locator,
    scoped,
    match: 'text' in scope ? locateMatch(scope.text, quote) : null,
  };
}
