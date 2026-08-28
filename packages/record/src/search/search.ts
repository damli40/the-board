// Full-text search over everything filed. The same `extract.ts` output (pdf.js
// text, or the plain text an ExhibitStore decoded directly) feeds this, so an
// exhibit that was never machine-readable — an image — is never pretended to
// have been searched. Skipping it silently is the honest behaviour: rendering
// a fake "no match" for content nobody ever read would be a confident false
// statement about the record, the exact failure class this project exists to
// catch (see ../model/quote.ts).

import type { Exhibit, Locator } from '../model/types';

export interface Hit {
  exhibitId: string;
  locator: Locator;
  snippet: string;
}

export function searchExhibits(exhibits: Exhibit[], query: string): Hit[] {
  // Same normalisation as the quote check (../model/quote.ts): case-insensitive,
  // whitespace-trimmed, never a fuzzy match. An empty or whitespace-only query
  // must not become a match-everything query — trim first, then bail on empty.
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];

  const hits: Hit[] = [];

  for (const exhibit of exhibits) {
    if (exhibit.text === null) continue; // an image was never read by the page

    if (exhibit.pages) {
      exhibit.pages.forEach((pageText, i) => {
        if (pageText.toLowerCase().includes(needle)) {
          hits.push({ exhibitId: exhibit.id, locator: { page: i + 1 }, snippet: pageText.trim() });
        }
      });
      continue;
    }

    exhibit.text.split('\n').forEach((line, i) => {
      if (line.toLowerCase().includes(needle)) {
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
