import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Masthead } from './Masthead';
import { PARENT_ORIGIN } from '../config/origins';
import type { Exhibit } from '../model/types';

function exhibit(filedAt: string, id = 'E1'): Exhibit {
  return { id, side: 'A', kind: 'text', name: 'x', sha256: 'abc', text: 'x', filedAt };
}

describe('Masthead', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
  });

  it('renders the title and the standfirst verbatim', () => {
    render(<Masthead fixedExhibits={[]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Board');
    expect(
      screen.getByText(
        'People are starting to send AI agents to act for them. The Board is what happens when my agent and your agent want opposite things: both get a seat, both work from the same file, and every move either one makes is written down here where the other side can read it.'
      )
    ).toBeInTheDocument();
  });

  it('renders the record row with the real PARENT_ORIGIN', () => {
    render(<Masthead fixedExhibits={[]} />);
    expect(screen.getByTestId('masthead-record')).toHaveTextContent(PARENT_ORIGIN);
  });

  it('never renders a case row — scenario.ts carries no case id anywhere', () => {
    render(<Masthead fixedExhibits={[exhibit('2026-08-20T09:00:00.000Z')]} />);
    expect(screen.queryByTestId('masthead-case')).toBeNull();
    expect(screen.queryByText(/2026-0830-04/)).toBeNull();
  });

  it('omits the clock row when no exhibit has been filed yet', () => {
    render(<Masthead fixedExhibits={[]} />);
    expect(screen.queryByTestId('masthead-clock')).toBeNull();
  });

  it('renders the clock row from the real min/max of the fixed exhibits\' own filedAt', () => {
    render(
      <Masthead
        fixedExhibits={[exhibit('2026-08-20T09:00:00.000Z', 'E1'), exhibit('2026-08-20T09:20:00.000Z', 'E5')]}
      />
    );
    expect(screen.getByTestId('masthead-clock')).toHaveTextContent('20 Aug 2026, 09:00 to 09:20');
  });

  // Fix round 1, C2 + the "near-vacuous test" minor: the old version of this
  // test only asserted that two literal strings ('14:02'/'14:41') never
  // appear, which they cannot no matter what this component is given — it
  // could only ever pass. This is the real mechanism instead: prove that a
  // "live"-looking (today-dated) exhibit DOES move the clock when it is part
  // of what gets passed in, which is exactly why `App.tsx` must never pass
  // this component the live, still-growing exhibit store — only the fixed
  // scenario snapshot `loadScenario()` itself returns (see App.tsx's and
  // this file's own comments on `fixedExhibits`). The full end-to-end
  // regression — filing live through the real App and asserting the
  // masthead clock does not move — is `App.test.tsx`.
  it('is a faithful, un-opinionated formatter: mixing in a "live"-dated exhibit changes the range, because it does not know the difference', () => {
    const today = new Date().toISOString();
    render(
      <Masthead
        fixedExhibits={[exhibit('2026-08-20T09:00:00.000Z', 'E1'), exhibit(today, 'E6')]}
      />
    );
    const text = screen.getByTestId('masthead-clock').textContent ?? '';
    expect(text).toContain('20 Aug 2026, 09:00 to');
    // The max half of the range moved to reflect the live-dated entry —
    // demonstrating the defect this component cannot protect against on its
    // own, which is why the caller's contract (never pass the live store)
    // is the actual fix.
    expect(text).not.toContain('09:00 to 09:20');
  });

  it('never invents the design\'s own fabricated case id or clock literal', () => {
    render(<Masthead fixedExhibits={[exhibit('2026-08-20T09:00:00.000Z')]} />);
    expect(screen.queryByText(/14:02/)).toBeNull();
    expect(screen.queryByText(/14:41/)).toBeNull();
    expect(screen.queryByText(/2026-0830-04/)).toBeNull();
  });

  it('the theme toggle defaults to System and applies no data-theme override', () => {
    render(<Masthead fixedExhibits={[]} />);
    expect(screen.getByTestId('theme-toggle-system')).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('choosing Dark writes data-theme="dark" on <html> and remembers it', () => {
    render(<Masthead fixedExhibits={[]} />);
    fireEvent.click(screen.getByTestId('theme-toggle-dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('board:theme')).toBe('dark');
    expect(screen.getByTestId('theme-toggle-dark')).toHaveAttribute('aria-pressed', 'true');
  });

  it('choosing Light writes data-theme="light" on <html> and remembers it', () => {
    render(<Masthead fixedExhibits={[]} />);
    fireEvent.click(screen.getByTestId('theme-toggle-light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('board:theme')).toBe('light');
  });

  it('choosing System after Dark removes the data-theme override again', () => {
    render(<Masthead fixedExhibits={[]} />);
    fireEvent.click(screen.getByTestId('theme-toggle-dark'));
    fireEvent.click(screen.getByTestId('theme-toggle-system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem('board:theme')).toBe('system');
  });

  it('a mount picks up a previously remembered choice', () => {
    window.localStorage.setItem('board:theme', 'light');
    render(<Masthead fixedExhibits={[]} />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByTestId('theme-toggle-light')).toHaveAttribute('aria-pressed', 'true');
  });
});
