import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FactsColumn } from './App';
import type { Fact } from './model/types';

// Fix round 2, I3: C3 (fix round 1) said "add a test per status" and none
// existed — `FactsColumn` was private and untested, and the `fact-*`
// testids appeared nowhere. This pins the real bug C3 fixed: `unopposed`
// (nobody has contested it YET) must never render as the same shape as
// `conceded` (agreed), and the status word must render for all three,
// never suppressed — the previous port suppressed it exactly for
// `unopposed`, which is the one status where saying so matters most.

function fact(id: string, status: Fact['status']): Fact {
  return {
    id,
    side: 'A',
    text: `fact ${id}`,
    points: { exhibitId: 'E1', locator: {} },
    status,
  };
}

describe('FactsColumn — the three marks (C3)', () => {
  it('conceded: filled disc, aria-label "agreed", status word "agreed"', () => {
    render(<FactsColumn facts={[fact('F1', 'conceded')]} />);
    const row = screen.getByTestId('fact-F1');
    expect(row.querySelector('svg')).toHaveAttribute('aria-label', 'agreed');
    // Filled disc: a solid <circle fill="currentColor">, no hollow stroke ring, no strike line.
    expect(row.querySelector('circle')).toHaveAttribute('fill', 'currentColor');
    expect(row.querySelector('line')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('agreed');
  });

  it('unopposed: hollow ring, aria-label "not yet contested", status word "unopposed" — never drawn as agreed', () => {
    render(<FactsColumn facts={[fact('F2', 'unopposed')]} />);
    const row = screen.getByTestId('fact-F2');
    expect(row.querySelector('svg')).toHaveAttribute('aria-label', 'not yet contested');
    expect(row.querySelector('circle')).toHaveAttribute('fill', 'none');
    expect(row.querySelector('line')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('unopposed');
    // The exact bug C3 fixed: an unopposed fact must never carry the word
    // "agreed" — that is the claim this whole fix exists to stop.
    expect(row).not.toHaveTextContent('agreed');
  });

  it('disputed: hollow ring struck through, aria-label "contested", status word "disputed"', () => {
    render(<FactsColumn facts={[fact('F3', 'disputed')]} />);
    const row = screen.getByTestId('fact-F3');
    expect(row.querySelector('svg')).toHaveAttribute('aria-label', 'contested');
    expect(row.querySelector('circle')).toHaveAttribute('fill', 'none');
    // The struck ring is the ONLY variant with a <line> — this is what
    // makes it a genuinely third, distinct shape rather than a recoloured
    // hollow ring.
    expect(row.querySelector('line')).toBeInTheDocument();
    expect(row).toHaveTextContent('disputed');
  });

  it('the three variants are three distinct shapes, not the same shape recoloured', () => {
    render(
      <FactsColumn
        facts={[fact('F1', 'conceded'), fact('F2', 'unopposed'), fact('F3', 'disputed')]}
      />
    );
    const shapes = ['F1', 'F2', 'F3'].map((id) => {
      const row = screen.getByTestId(`fact-${id}`);
      const circle = row.querySelector('circle')!;
      return { fill: circle.getAttribute('fill'), hasLine: !!row.querySelector('line') };
    });
    expect(shapes).toEqual([
      { fill: 'currentColor', hasLine: false }, // conceded
      { fill: 'none', hasLine: false },          // unopposed
      { fill: 'none', hasLine: true },           // disputed
    ]);
  });

  it('renders "no facts filed yet" when there are none', () => {
    render(<FactsColumn facts={[]} />);
    expect(screen.getByText('no facts filed yet')).toBeInTheDocument();
  });
});
