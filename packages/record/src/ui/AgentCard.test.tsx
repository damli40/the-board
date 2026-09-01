import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCard, deriveAgentState, type AgentCardState } from './AgentCard';
import { ORIGIN } from '../config/origins';
import { ACTOR_LABEL } from './theme';
import type { Actor } from '../model/types';

const ACTORS: Actor[] = ['A', 'B', 'seat1', 'seat2'];

describe('AgentCard', () => {
  it('renders the origin line for every actor — "each one on its own web address" printed, not just claimed', () => {
    for (const actor of ACTORS) {
      render(
        <AgentCard actor={actor} state="idle">
          <div>frame content</div>
        </AgentCard>
      );
      expect(screen.getByTestId(`agent-card-origin-${actor}`)).toHaveTextContent(`frame ${ORIGIN[actor]}`);
    }
  });

  it('renders the card, name and state chip testids for every actor', () => {
    for (const actor of ACTORS) {
      render(
        <AgentCard actor={actor} state="acted">
          <div />
        </AgentCard>
      );
      expect(screen.getByTestId(`agent-card-${actor}`)).toBeInTheDocument();
      expect(screen.getByTestId(`agent-card-state-${actor}`)).toHaveTextContent('acted');
      expect(screen.getByText(ACTOR_LABEL[actor])).toBeInTheDocument();
    }
  });

  it('renders the exact role line per actor — adversarial for advocates, identical assessor line for both seats', () => {
    const { rerender } = render(<AgentCard actor="A" state="idle"><div /></AgentCard>);
    expect(screen.getByText('Argues one side of the case.')).toBeInTheDocument();

    rerender(<AgentCard actor="B" state="idle"><div /></AgentCard>);
    expect(screen.getByText('Argues the other side.')).toBeInTheDocument();

    rerender(<AgentCard actor="seat1" state="idle"><div /></AgentCard>);
    expect(screen.getByText('Reads both sides and assesses.')).toBeInTheDocument();

    rerender(<AgentCard actor="seat2" state="idle"><div /></AgentCard>);
    expect(screen.getByText('Reads both sides and assesses.')).toBeInTheDocument();
  });

  it('renders whatever state prop it is given, including every honest state', () => {
    const states: AgentCardState[] = ['no tools', 'refused', 'broke', 'acted', 'idle'];
    for (const state of states) {
      render(<AgentCard actor="A" state={state}><div /></AgentCard>);
      expect(screen.getAllByTestId('agent-card-state-A').at(-1)).toHaveTextContent(state);
    }
  });

  // Fix round 1, I9: the card's own border must draw from the SAME hue as
  // the bar and chip, never from theme.ts's Tailwind `accent.border` — for
  // Advocate B those two disagree (amber vs. the design's pink), and amber
  // also collides with the page's own brand colour. Asserted on the DOM
  // attribute rather than a screenshot: the `border` class no longer carries
  // a Tailwind colour utility, and `borderColor` is set inline from the same
  // `hue` the bar/chip already use.
  it("draws its own border from the actor's hue, not from a second, disagreeing accent colour", () => {
    render(<AgentCard actor="B" state="idle"><div /></AgentCard>);
    const card = screen.getByTestId('agent-card-B');
    expect(card.className).not.toMatch(/border-(amber|cyan|violet|emerald)-500/);
    expect(card.style.borderColor).toBe('rgb(232, 97, 140)'); // #E8618C, B's hue
  });

  it('renders its children (the iframe) inside the card', () => {
    render(
      <AgentCard actor="seat2" state="idle">
        <iframe data-testid="frame-seat2" title="Seat 2 panel" />
      </AgentCard>
    );
    expect(screen.getByTestId('frame-seat2')).toBeInTheDocument();
  });
});

describe('deriveAgentState', () => {
  // Fix round 1, C1: this whole block replaces a describe that PINNED the
  // defect — it asserted `deriveAgentState(0, [{ ok: false }])` was
  // `'no tools'`, with a comment claiming an actor holding nothing "cannot
  // have produced a real refusal." True only within a phase; false the
  // instant a lifetime closes (every entry in `LIFETIME_WINDOW` ends at or
  // before `VERDICT`, so `CONFIRMED` empties every actor's `granted`) — and
  // the false version is what a viewer sees at the end of a filmed run.

  it('is "no tools" only when nothing is granted AND nothing has ever happened', () => {
    expect(deriveAgentState(0, [])).toBe('no tools');
  });

  it('keeps a refusal in view even after the tools that produced it are gone (a closed lifetime, or CONFIRMED)', () => {
    expect(deriveAgentState(0, [{ ok: false, failure: 'refusal' }])).toBe('refused');
    expect(deriveAgentState(0, [{ ok: true }, { ok: false, failure: 'refusal' }])).toBe('refused');
  });

  it('keeps a completed history in view even after the tools are gone — "acted," never erased back to "no tools"', () => {
    expect(deriveAgentState(0, [{ ok: true }])).toBe('acted');
    expect(deriveAgentState(0, [{ ok: true }, { ok: true }])).toBe('acted');
  });

  it('refusal outranks a successful history — one refusal among several ok entries still reads "refused"', () => {
    expect(deriveAgentState(3, [{ ok: true }, { ok: true }, { ok: false, failure: 'refusal' }])).toBe('refused');
  });

  it('is "acted" when granted, all entries ok, and there is at least one', () => {
    expect(deriveAgentState(2, [{ ok: true }, { ok: true }])).toBe('acted');
  });

  it('is "idle" when granted but no entries exist yet', () => {
    expect(deriveAgentState(2, [])).toBe('idle');
  });

  // `AgentCardState`'s own union type excludes 'running' — a runtime
  // assertion that no branch returns it cannot fail without `tsc` already
  // having failed first, so fix round 1's test-hygiene note removes that
  // (now-redundant) case rather than keep a test that tests the compiler.

  // -------------------------------------------------------------------
  // Finish task: `ok: false` used to mean only "refused," collapsing a real
  // refusal and an ordinary crash into the SAME card state — the exact "a
  // bug puts the word refused on an agent's card" defect this block pins
  // shut. `failure` is the discriminator `webmcp/ledger.ts`'s `Ledger.wrap`
  // now writes from `instanceof Refusal`, at the only point that ever sees
  // the real exception.
  // -------------------------------------------------------------------
  describe('the crash/refusal discriminator (finish task)', () => {
    it('is "broke", never "refused", when every failure is a crash', () => {
      expect(deriveAgentState(0, [{ ok: false, failure: 'crash' }])).toBe('broke');
      expect(deriveAgentState(0, [{ ok: true }, { ok: false, failure: 'crash' }])).toBe('broke');
    });

    it('treats a failed entry with no failure field as a crash, not a refusal — under-claiming is the safe default', () => {
      // The real ledger always sets `failure` on a `!ok` entry (see
      // ledger.ts's own `wrap`), so this shape should not occur in
      // production — this pins the DEFENSIVE fallback for a caller of this
      // pure function that omits it, so a missing signal can never read as
      // this project's own central claim.
      expect(deriveAgentState(0, [{ ok: false }])).toBe('broke');
    });

    it('a real refusal still outranks a crash in the same actor history', () => {
      expect(deriveAgentState(0, [
        { ok: false, failure: 'crash' },
        { ok: false, failure: 'refusal' }
      ])).toBe('refused');
    });

    it('a crash outranks a quiet "acted" or "no tools" — a bug that happened is still worth surfacing', () => {
      expect(deriveAgentState(2, [{ ok: true }, { ok: false, failure: 'crash' }])).toBe('broke');
      expect(deriveAgentState(0, [{ ok: false, failure: 'crash' }])).toBe('broke');
    });
  });
});
