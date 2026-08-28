import { describe, it, expect } from 'vitest';
import { truncateForTool, TOOL_OUTPUT_BUDGET } from './truncate';

describe('truncateForTool', () => {
  it('truncates output over the 1.5K budget and appends the notice', () => {
    const long = 'x'.repeat(TOOL_OUTPUT_BUDGET + 1);
    const out = truncateForTool(long);

    expect(out).toBe('x'.repeat(TOOL_OUTPUT_BUDGET) + '...[truncated at 1500 chars; call again with a narrower page or query]');
    expect(out).toContain('...[truncated at 1500 chars; call again with a narrower page or query]');
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
