import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseRail } from './PhaseRail';

describe('PhaseRail', () => {
  it('marks the current phase with aria-current="step", and no other phase', () => {
    render(<PhaseRail phase="REVIEW" onAdvance={() => {}} />);
    expect(screen.getByTestId('phase-REVIEW')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('phase-FILING')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('phase-VERDICT')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('phase-CONFIRMED')).not.toHaveAttribute('aria-current');
  });

  it('carries data-active on the current phase only, same shape PhaseRibbon used', () => {
    render(<PhaseRail phase="REVIEW" onAdvance={() => {}} />);
    expect(screen.getByTestId('phase-REVIEW')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('phase-FILING')).toHaveAttribute('data-active', 'false');
  });

  it('renders past phases as done (a filled disc) and future phases as pending (a hollow ring)', () => {
    render(<PhaseRail phase="VERDICT" onAdvance={() => {}} />);

    // FILING and REVIEW are before VERDICT: done, filled disc (fill="currentColor").
    const filing = screen.getByTestId('phase-FILING');
    expect(filing.querySelector('circle[fill="currentColor"]')).not.toBeNull();
    const review = screen.getByTestId('phase-REVIEW');
    expect(review.querySelector('circle[fill="currentColor"]')).not.toBeNull();

    // VERDICT is current: also filled ("done or current" both draw the filled mark).
    const verdict = screen.getByTestId('phase-VERDICT');
    expect(verdict.querySelector('circle[fill="currentColor"]')).not.toBeNull();

    // CONFIRMED is still pending: hollow ring (fill="none", a stroke circle).
    const confirmed = screen.getByTestId('phase-CONFIRMED');
    expect(confirmed.querySelector('circle[fill="currentColor"]')).toBeNull();
    expect(confirmed.querySelector('circle[fill="none"]')).not.toBeNull();
  });

  it('the advance button fires the real transition', () => {
    const onAdvance = vi.fn();
    render(<PhaseRail phase="FILING" onAdvance={onAdvance} />);
    fireEvent.click(screen.getByTestId('advance-phase'));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('labels the advance button with the design copy for the current phase', () => {
    render(<PhaseRail phase="FILING" onAdvance={() => {}} />);
    expect(screen.getByTestId('advance-phase')).toHaveTextContent('Open review');
  });

  it('has no advance button once there is no real next phase (VERDICT waits on a person, not this button)', () => {
    render(<PhaseRail phase="VERDICT" onAdvance={() => {}} />);
    expect(screen.queryByTestId('advance-phase')).toBeNull();
  });

  it('has no advance button at CONFIRMED, the end of the rail', () => {
    render(<PhaseRail phase="CONFIRMED" onAdvance={() => {}} />);
    expect(screen.queryByTestId('advance-phase')).toBeNull();
  });

  it('keeps the phase-ribbon container testid the deleted PhaseRibbon used', () => {
    render(<PhaseRail phase="FILING" onAdvance={() => {}} />);
    expect(screen.getByTestId('phase-ribbon')).toBeInTheDocument();
  });

  // Fix round 1, M6: the brief's own testid list named `phase-rail` for the
  // rail's outer wrapper, one level up from `phase-ribbon` (the per-phase
  // item grid) — it was never rendered.
  it('carries phase-rail on the outer wrapper, alongside phase-ribbon on the inner one', () => {
    render(<PhaseRail phase="FILING" onAdvance={() => {}} />);
    const rail = screen.getByTestId('phase-rail');
    expect(rail).toBeInTheDocument();
    expect(rail).toContainElement(screen.getByTestId('phase-ribbon'));
  });

  // Fix round 1, missing coverage: copy-final.md's phase table names a
  // sub-line for every real phase id; nothing asserted any of them.
  it('renders every phase\'s sub-line from copy-final.md\'s phase table', () => {
    render(<PhaseRail phase="FILING" onAdvance={() => {}} />);
    expect(screen.getByTestId('phase-FILING')).toHaveTextContent('advocates put their case in');
    expect(screen.getByTestId('phase-REVIEW')).toHaveTextContent('seats read both cases');
    expect(screen.getByTestId('phase-VERDICT')).toHaveTextContent('seats write, nothing is in force');
    expect(screen.getByTestId('phase-CONFIRMED')).toHaveTextContent('a person signed it');
  });
});
