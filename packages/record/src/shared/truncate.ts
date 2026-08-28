// Chrome publishes a 1.5K-character budget for WebMCP tool output
// (see CLAUDE.md §2, "Character budgets"). `extract_text` and `search_exhibits`
// (Task 9) both call this before returning — a single PDF page routinely runs
// 2-4K characters, so this is not an edge case, it is the common case.
//
// The notice is load-bearing, not housekeeping. A SILENT truncation would let a
// board seat quote text it never actually received — that is precisely the
// failure `checkQuote` (../model/quote.ts) exists to catch: a seat citing
// something it didn't really read. If this guard truncated quietly, it would be
// manufacturing the exact bug the read-receipt chain is built to refuse. So the
// truncated payload must say, in the payload itself, that it was cut — an agent
// (or a human) reading only the tool output has to be able to tell.
//
// One implementation, exported here and re-exported from `pdf/extract.ts` and
// `search/search.ts`, so nothing downstream (including Task 9's tool bodies)
// duplicates this logic with a second, possibly-drifting truncation rule.

export const TOOL_OUTPUT_BUDGET = 1500;

const TRUNCATION_NOTICE =
  '...[truncated at 1500 chars; call again with a narrower page or query]';

/**
 * Truncates `text` to the 1.5K-character WebMCP tool-output budget and appends
 * a notice when it does. Text at or under the budget is returned unchanged —
 * no notice, no copy.
 */
export function truncateForTool(text: string): string {
  if (text.length <= TOOL_OUTPUT_BUDGET) return text;
  return text.slice(0, TOOL_OUTPUT_BUDGET) + TRUNCATION_NOTICE;
}
