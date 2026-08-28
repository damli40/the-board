import { describe, it, expect } from 'vitest';
import { truncateForTool, TOOL_OUTPUT_BUDGET } from './truncate';

const NOTICE = '...[truncated at 1500 chars; call again with a narrower page or query]';

describe('truncateForTool', () => {
  it('truncates output over the 1.5K budget so the TOTAL payload (body + notice) is at most 1500 chars', () => {
    const long = 'x'.repeat(TOOL_OUTPUT_BUDGET + 1);
    const out = truncateForTool(long);

    // The whole point: Chrome's own 1.5K hard limit must not be able to clip
    // the notice. If body were cut to 1500 and the notice appended after,
    // the total would run to ~1500 + notice.length and a second truncation
    // on top of ours could silence the very thing announcing the first one.
    expect(out.length).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET);
    expect(out.endsWith(NOTICE)).toBe(true);
    expect(out).toBe('x'.repeat(TOOL_OUTPUT_BUDGET - NOTICE.length) + NOTICE);
  });

  it('returns output under the budget untouched, with no notice', () => {
    const short = 'y'.repeat(TOOL_OUTPUT_BUDGET - 1);
    expect(truncateForTool(short)).toBe(short);
    expect(truncateForTool(short)).not.toContain('truncated');
  });

  it('returns output exactly at the budget untouched', () => {
    const exact = 'z'.repeat(TOOL_OUTPUT_BUDGET);
    expect(truncateForTool(exact)).toBe(exact);
    expect(truncateForTool(exact)).not.toContain('truncated');
  });
});
