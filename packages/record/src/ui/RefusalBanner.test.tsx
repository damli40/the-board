import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RefusalBanner } from './RefusalBanner';
import { ORIGIN } from '../config/origins';

describe('RefusalBanner', () => {
  it('renders nothing when there are no failures — the normal case', () => {
    const { container } = render(<RefusalBanner failures={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('registration-failures')).toBeNull();
  });

  it('shows the chip and the singular sentence for exactly one refused frame', () => {
    render(
      <RefusalBanner
        failures={[{ origin: ORIGIN.A, tool: 'file_exhibit', lifetime: 'filing', reason: "NotAllowedError: Permissions-Policy 'tools' does not allow this origin" }]}
      />
    );
    const banner = screen.getByTestId('registration-failures');
    expect(banner).toHaveTextContent('BROWSER REFUSED A HANDOVER');
    expect(banner).toHaveTextContent('Agents may be holding no tools at all. Do not read this page as a boundary working.');
    expect(banner).toHaveTextContent(
      'The record tried to hand tools to 1 frame and the browser would not complete the handover. Refused is not the same as not handed over: not handed over means the record kept a tool back on purpose, refused means the browser blocked a handover the record intended.'
    );
  });

  it('shows the plural sentence, counting DISTINCT origins rather than failure rows', () => {
    // Three failure rows, but only two distinct frames (A refuses twice).
    render(
      <RefusalBanner
        failures={[
          { origin: ORIGIN.A, tool: 'file_exhibit', lifetime: 'filing', reason: 'refused' },
          { origin: ORIGIN.A, tool: 'file_fact', lifetime: 'filing', reason: 'refused' },
          { origin: ORIGIN.B, tool: 'object', lifetime: 'partyObject', reason: 'refused' },
        ]}
      />
    );
    const banner = screen.getByTestId('registration-failures');
    expect(banner).toHaveTextContent('The record tried to hand tools to 2 frames and the browser would not complete the handover.');
    expect(banner).not.toHaveTextContent('1 frame ');
  });

  it('renders the real failures beneath, with the fixed text format', () => {
    render(
      <RefusalBanner
        failures={[
          { origin: ORIGIN.A, tool: 'file_exhibit', lifetime: 'filing', reason: 'NotAllowedError: refused' },
          { origin: ORIGIN.B, tool: 'object', lifetime: 'partyObject', reason: 'NotAllowedError: refused' },
        ]}
      />
    );
    expect(screen.getByTestId(`registration-failure-file_exhibit-${ORIGIN.A}`)).toHaveTextContent(
      `file_exhibit · ${ORIGIN.A} · filing · NotAllowedError: refused`
    );
    expect(screen.getByTestId(`registration-failure-object-${ORIGIN.B}`)).toHaveTextContent(
      `object · ${ORIGIN.B} · partyObject · NotAllowedError: refused`
    );
  });

  // Fix round 1, M7: the same tool refused for two different origins used to
  // collide on one testid (`registration-failure-${tool}`) and getByTestId
  // would throw for finding two matches. This is the design's own example
  // (register(seat1) refused / register(seat2) refused, same tool, two
  // origins) — the exact case the old id was unusable for.
  it('keeps distinct testids when the SAME tool is refused for two different origins', () => {
    render(
      <RefusalBanner
        failures={[
          { origin: ORIGIN.seat1, tool: 'spend_appeal', lifetime: 'appealA', reason: 'refused' },
          { origin: ORIGIN.seat2, tool: 'spend_appeal', lifetime: 'appealB', reason: 'refused' },
        ]}
      />
    );
    expect(() => screen.getByTestId(`registration-failure-spend_appeal-${ORIGIN.seat1}`)).not.toThrow();
    expect(() => screen.getByTestId(`registration-failure-spend_appeal-${ORIGIN.seat2}`)).not.toThrow();
    expect(screen.getByTestId(`registration-failure-spend_appeal-${ORIGIN.seat1}`)).toHaveTextContent(ORIGIN.seat1);
    expect(screen.getByTestId(`registration-failure-spend_appeal-${ORIGIN.seat2}`)).toHaveTextContent(ORIGIN.seat2);
  });

  it('field background is --tb-red-deep, not the chip\'s --tb-red', () => {
    render(
      <RefusalBanner failures={[{ origin: ORIGIN.seat1, tool: 'draft_verdict', lifetime: 'verdictDraft', reason: 'refused' }]} />
    );
    expect(screen.getByTestId('registration-failures')).toHaveStyle({ background: 'var(--tb-red-deep)' });
  });
});
