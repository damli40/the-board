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

  // -----------------------------------------------------------------
  // 2 Sep 2026, the clerk's controls. Two separate defects, both found by
  // driving the deployed page rather than by reading this file.
  //
  // One: the advance button MOVED. 'Open review' measures 147px and 'Ask the
  // seats to draft' 208px, and at an 843px viewport only the first fit beside
  // a 640px ribbon basis — so pressing the first control sent the second one
  // 654px left and 101px down onto a row of its own, under a cursor that had
  // not moved. Geometry is not testable here (jsdom lays nothing out), so
  // what these pin is the two style decisions that hold the box still.
  //
  // Two: at VERDICT the slot was simply empty, which reads as a control that
  // stopped working rather than as one that was never supposed to exist.
  it('gives the advance button a fixed box, so it does not move when the label changes length', () => {
    const { rerender } = render(<PhaseRail phase="FILING" onAdvance={() => {}} />);
    const filing = screen.getByTestId('advance-phase');
    expect(filing.style.minWidth).toBe('216px');
    expect(filing.style.justifyContent).toBe('space-between');
    rerender(<PhaseRail phase="REVIEW" onAdvance={() => {}} />);
    const review = screen.getByTestId('advance-phase');
    expect(review.style.minWidth).toBe('216px');
    expect(review).toHaveTextContent('Ask the seats to draft');
  });

  it('gives the ribbon a basis narrow enough that the longest label still fits beside it', () => {
    render(<PhaseRail phase="REVIEW" onAdvance={() => {}} />);
    // 560 + the button's 216px minimum + 42px of wrapper padding = 818px, so
    // the control keeps the ribbon's row at the 843px viewport this is filmed
    // at. Raising this back to 640 silently reintroduces the jump.
    expect(screen.getByTestId('phase-ribbon').style.flex).toContain('560px');
  });

  it('offers a way down to the signature at VERDICT, where no advance button can exist', () => {
    render(<PhaseRail phase="VERDICT" onAdvance={() => {}} />);
    expect(screen.queryByTestId('advance-phase')).toBeNull();
    expect(screen.getByTestId('go-to-signature')).toHaveTextContent('Sign it below');
  });

  it('the sign link moves the page and never the phase', () => {
    const onAdvance = vi.fn();
    const input = document.createElement('input');
    input.id = 'confirm-bar-name-input';
    document.body.appendChild(input);
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;

    render(<PhaseRail phase="VERDICT" onAdvance={onAdvance} />);
    fireEvent.click(screen.getByTestId('go-to-signature'));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    // The whole point: confirm is still the only thing that reaches CONFIRMED.
    expect(onAdvance).not.toHaveBeenCalled();
    input.remove();
  });

  it('shows the sign link only at VERDICT, not in the phases that have a real button', () => {
    for (const phase of ['FILING', 'REVIEW', 'CONFIRMED'] as const) {
      const { unmount } = render(<PhaseRail phase={phase} onAdvance={() => {}} />);
      expect(screen.queryByTestId('go-to-signature'), `${phase} should not offer it`).toBeNull();
      unmount();
    }
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
