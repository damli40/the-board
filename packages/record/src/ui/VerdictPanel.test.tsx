import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictPanel } from './VerdictPanel';
import { Ledger } from '../webmcp/ledger';
import { ORIGIN } from '../config/origins';
import type { Verdict } from '../model/types';

// ---------------------------------------------------------------------------
// FINAL REVIEW, SHOULD-FIX 4: the submission claims something the page never
// rendered.
//
// SUBMISSION.md quotes this table as the place a never-called tool is shown
// as zero: "Seat 1 called `extract_text` zero times; Seat 2 called it
// twice". But `Ledger.countsFor` only holds keys for tools that were actually
// called, so the uncalled one was OMITTED from the row rather than drawn as
// `0`. The one place the submission points at as rendering an ABSENCE was
// rendering a SILENCE: the viewer had to notice a row that was not there and
// know it should have been.
//
// Unioning the counts over the tools that seat currently HOLDS makes the zero
// real, and makes the quoted sentence true.
// ---------------------------------------------------------------------------

function verdict(seat: 'seat1' | 'seat2', outcome: 'UPHELD' | 'OVERTURNED', opened: string[]): Verdict {
  return {
    seat,
    outcome,
    cited: [],
    opened,
    neverOpened: [],
    reasoning: 'reasoning for the draft',
    basis: { cited: false, reason: 'no rule exhibit cited' },
  };
}

/** Seat 2 reads the PDF twice; Seat 1 never touches it. The split beat. */
async function ledgerWithTheSplit(): Promise<Ledger> {
  const ledger = new Ledger(() => 1000);
  const call = (origin: string, tool: string) => ledger.wrap(origin, tool, async () => 'ok')({});
  await call(ORIGIN.seat1, 'open_exhibit');
  await call(ORIGIN.seat2, 'open_exhibit');
  await call(ORIGIN.seat2, 'extract_text');
  await call(ORIGIN.seat2, 'extract_text');
  return ledger;
}

/** What both seats hold during VERDICT, when the split table is on camera. */
const BOARD_TOOLS = ['open_exhibit', 'extract_text', 'search_exhibits', 'record_assessment', 'cite', 'draft_verdict'];

describe('VerdictPanel split table', () => {
  it('renders a granted-but-never-called tool as 0, which is the sentence the submission quotes', async () => {
    const ledger = await ledgerWithTheSplit();
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', ['E4', 'E5'])}
        seat2={verdict('seat2', 'OVERTURNED', ['E1'])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
        grantedTools={{ seat1: BOARD_TOOLS, seat2: BOARD_TOOLS }}
      />
    );

    expect(screen.getByTestId('calls-seat1')).toHaveTextContent('extract_text 0');
    expect(screen.getByTestId('calls-seat2')).toHaveTextContent('extract_text 2');
  });

  it('draws every tool the seat holds, so an absence is visible rather than inferred', async () => {
    const ledger = await ledgerWithTheSplit();
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', [])}
        seat2={verdict('seat2', 'OVERTURNED', [])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
        grantedTools={{ seat1: BOARD_TOOLS, seat2: BOARD_TOOLS }}
      />
    );

    const row = screen.getByTestId('calls-seat1');
    for (const tool of BOARD_TOOLS) expect(row).toHaveTextContent(tool);
    expect(row).toHaveTextContent('open_exhibit 1');
    expect(row).toHaveTextContent('cite 0');
  });

  it('keeps a tool that WAS called even after its grant is gone, so the history never vanishes', async () => {
    const ledger = await ledgerWithTheSplit();
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', [])}
        seat2={verdict('seat2', 'UPHELD', [])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
        // Nothing granted any more: the phase has moved past VERDICT.
        grantedTools={{ seat1: [], seat2: [] }}
      />
    );

    expect(screen.getByTestId('calls-seat2')).toHaveTextContent('extract_text 2');
    expect(screen.getByTestId('calls-seat1')).toHaveTextContent('open_exhibit 1');
  });

  it('falls back to the calls alone when no grant list is supplied', async () => {
    const ledger = await ledgerWithTheSplit();
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', [])}
        seat2={verdict('seat2', 'UPHELD', [])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
      />
    );

    expect(screen.getByTestId('calls-seat1')).toHaveTextContent('open_exhibit 1');
    expect(screen.getByTestId('calls-seat1')).not.toHaveTextContent('extract_text');
  });

  // Task 4 (finish plan, brief 4c): the draft-verdict block gets the design's
  // heading and sub-line (copy-final.md, verbatim), wrapped around the same
  // real seat cards and split table — never the design's own fabricated
  // "verdictText" paragraph, which Global Constraint 2 names as invented
  // data to refuse.
  it('carries the "Draft verdict" heading and its verbatim sub-line', async () => {
    const ledger = await ledgerWithTheSplit();
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', [])}
        seat2={verdict('seat2', 'UPHELD', [])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
        grantedTools={{ seat1: BOARD_TOOLS, seat2: BOARD_TOOLS }}
      />
    );

    expect(screen.getByText('Draft verdict')).toBeInTheDocument();
    expect(screen.getByText('Assembled with draft_verdict from both seats. Not in force until a person confirms it.')).toBeInTheDocument();
  });

  it('still says "none" for a seat that holds nothing and called nothing', async () => {
    const ledger = new Ledger(() => 1000);
    render(
      <VerdictPanel
        seat1={verdict('seat1', 'UPHELD', [])}
        seat2={verdict('seat2', 'UPHELD', [])}
        facts={[]}
        exhibits={[]}
        assessments={[]}
        ledger={ledger}
        grantedTools={{ seat1: [], seat2: [] }}
      />
    );

    expect(screen.getByTestId('calls-seat1')).toHaveTextContent('none');
  });
});
