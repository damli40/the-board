// Full-text search over everything filed. The same `extract.ts` output (pdf.js
// text, or the plain text an ExhibitStore decoded directly) feeds this, so an
// exhibit that was never machine-readable — an image — is never pretended to
// have been searched. Skipping it silently is the honest behaviour: rendering
// a fake "no match" for content nobody ever read would be a confident false
// statement about the record, the exact failure class this project exists to
// catch (see ../model/quote.ts).

import type { Exhibit, Locator } from '../model/types';
import { normaliseForQuote } from '../model/quote';

export interface Hit {
  exhibitId: string;
  locator: Locator;
  snippet: string;
}

export function searchExhibits(exhibits: Exhibit[], query: string): Hit[] {
  // Reuse checkQuote's own normaliser (../model/quote.ts) rather than
  // hand-rolling a second one: it collapses every whitespace run to a single
  // space, lowercases, and trims. Matching case-only here previously let a
  // real PDF hit go missing — pdf.js commonly emits items that already carry
  // their own trailing space, so extract.ts's `.join(' ')` can double up
  // ('Hello ' + ' ' + 'World' -> 'Hello  World'), and plain `.includes()`
  // does not see through that even though checkQuote does. Importing the
  // same function instead of re-implementing it is what keeps this in sync
  // with quote.ts going forward, not just today.
  const needle = normaliseForQuote(query);
  if (needle === '') return [];

  const hits: Hit[] = [];

  for (const exhibit of exhibits) {
    if (exhibit.text === null) continue; // an image was never read by the page

    if (exhibit.pages) {
      exhibit.pages.forEach((pageText, i) => {
        // Split into pages/lines BEFORE collapsing, so locators stay correct —
        // collapsing the whole document first would erase the boundaries this
        // per-unit search depends on. One consequence, left alone on purpose:
        // a phrase split across two lines by a real line break is still not
        // found here, even though checkQuote would find it against the whole
        // exhibit (empty locator). That's a real divergence from the quote
        // check, not a re-occurrence of this bug — line locators are the
        // reason search exists in this shape.
        if (normaliseForQuote(pageText).includes(needle)) {
          hits.push({ exhibitId: exhibit.id, locator: { page: i + 1 }, snippet: pageText.trim() });
        }
      });
      continue;
    }

    exhibit.text.split('\n').forEach((line, i) => {
      if (normaliseForQuote(line).includes(needle)) {
        hits.push({ exhibitId: exhibit.id, locator: { lines: [i + 1, i + 1] }, snippet: line.trim() });
      }
    });
  }

  return hits;
}

// The 1.5K WebMCP tool-output budget applies to what `search_exhibits`
// (Task 9) returns after assembling hits into a payload, not to this
// function's Hit[] — see ../shared/truncate.ts for why a silent truncation
// there would be load-bearing, not cosmetic. Re-exported here so a caller
// that already imports from this module doesn't need a second import path.
export { truncateForTool, TOOL_OUTPUT_BUDGET } from '../shared/truncate';
