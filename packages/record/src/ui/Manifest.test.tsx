import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Manifest } from './Manifest';
// Ruling 5 (controller, task 8): no origin URL literals outside
// src/config/origins.test.ts. The brief's own Step 1 code wrote
// 'https://seat2.theboard.app' as a literal; ORIGIN.seat2 / ORIGIN.seat1
// carry the same illustrative value without hand-writing it a second time.
import { ORIGIN } from '../config/origins';

const manifest = {
  actor: 'seat2' as const,
  origin: ORIGIN.seat2,
  granted: [
    { tool: 'open_exhibit', used: 4, lends: false },
    { tool: 'extract_text', used: 2, lends: true }
  ],
  notGranted: ['file_fact', 'confirm']
};

describe('Manifest', () => {
  it('shows the call count beside each granted tool', () => {
    render(<Manifest manifest={manifest} />);
    expect(screen.getByTestId('used-open_exhibit')).toHaveTextContent('4');
  });

  it('marks a lent capability, because that is what WebMCP is for', () => {
    render(<Manifest manifest={manifest} />);
    expect(screen.getByTestId('row-extract_text')).toHaveTextContent('page lends');
  });

  it('renders the NOT GRANTED half, which is the half doing the work', () => {
    render(<Manifest manifest={manifest} />);
    expect(screen.getByTestId('notgranted-confirm')).toHaveTextContent('NOT GRANTED');
    expect(screen.getByTestId('notgranted-file_fact')).toHaveTextContent('NOT GRANTED');
  });

  // Ruling 3 (controller, task 8): `ToolRegistry.registered()` builds
  // `granted` from Map insertion order, not alphabetically — Chrome's own
  // `getTools()` guarantee does not propagate here. This manifest's input is
  // deliberately given OUT of alphabetical order (search, then extract, then
  // open); the component must still render it sorted, or the signature image
  // reshuffles between takes of the video.
  it('renders the granted half sorted by tool name regardless of input order', () => {
    const unsorted = {
      actor: 'seat2' as const,
      origin: ORIGIN.seat2,
      granted: [
        { tool: 'search_exhibits', used: 1, lends: true },
        { tool: 'extract_text', used: 2, lends: true },
        { tool: 'open_exhibit', used: 4, lends: false }
      ],
      notGranted: []
    };
    render(<Manifest manifest={unsorted} />);
    const rows = screen.getAllByTestId(/^row-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['row-extract_text', 'row-open_exhibit', 'row-search_exhibits']);
  });

  // Same ruling, the other column: NOT GRANTED is built from `ALL_TOOL_NAMES`
  // filtering, which follows TOOLS declaration order plus NEVER_GRANTED
  // appended — also not alphabetical.
  it('renders the NOT GRANTED half sorted by tool name regardless of input order', () => {
    const unsorted = {
      actor: 'seat1' as const,
      origin: ORIGIN.seat1,
      granted: [],
      notGranted: ['confirm', 'concede', 'dispute']
    };
    render(<Manifest manifest={unsorted} />);
    const rows = screen.getAllByTestId(/^notgranted-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['notgranted-concede', 'notgranted-confirm', 'notgranted-dispute']);
  });
});
