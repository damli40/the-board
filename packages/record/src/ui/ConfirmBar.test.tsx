import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmBar } from './ConfirmBar';
import { CaseOutcome } from '../model/outcome';
import { ORIGIN } from '../config/origins';
import { ACTORS } from './theme';
import type { Manifest as ManifestData } from '../webmcp/registry';
import type { Actor } from '../model/types';
import { ALL_TOOL_NAMES } from '../webmcp/tools';

function manifestsWhereNothingIsGranted(): Record<Actor, ManifestData> {
  return Object.fromEntries(
    ACTORS.map((actor) => [actor, { actor, origin: ORIGIN[actor], granted: [], notGranted: [...ALL_TOOL_NAMES] }])
  ) as unknown as Record<Actor, ManifestData>;
}

describe('ConfirmBar registry check', () => {
  // Task 4 (finish plan, brief 4b): "derived by actually asking the registry
  // whether a tool named confirm exists for that origin, so the column is a
  // live check and not a decorative claim." `confirm` is never registered by
  // anyone (webmcp/tools.ts's NEVER_GRANTED), so every row reads
  // "not registered" today — but it must read that BECAUSE the manifest says
  // so, not because the string is hardcoded four times.
  it('reads "not registered" for every actor when the registry holds no confirm grant', () => {
    render(<ConfirmBar outcome={new CaseOutcome()} manifests={manifestsWhereNothingIsGranted()} onChange={() => {}} />);
    for (const actor of ACTORS) {
      expect(screen.getByTestId(`confirm-registry-check-${actor}`)).toHaveTextContent('not registered');
    }
  });

  // Proves the check is live rather than a literal: if a manifest ever DID
  // carry a confirm grant (which should never happen in this app, but the
  // component must not assume that — it must read it), the row must say
  // "registered", not silently keep printing "not registered".
  it('would read "registered" if the registry ever actually granted confirm to an actor', () => {
    const manifests = manifestsWhereNothingIsGranted();
    manifests.A = {
      ...manifests.A,
      granted: [{ tool: 'confirm', used: 0, lends: false }],
      notGranted: manifests.A.notGranted.filter((t) => t !== 'confirm'),
    };
    render(<ConfirmBar outcome={new CaseOutcome()} manifests={manifests} onChange={() => {}} />);
    expect(screen.getByTestId('confirm-registry-check-A')).toHaveTextContent('registered');
    expect(screen.getByTestId('confirm-registry-check-A')).not.toHaveTextContent('not registered');
    // Every other actor is unaffected.
    expect(screen.getByTestId('confirm-registry-check-B')).toHaveTextContent('not registered');
  });

  it('keeps the confirm and return-with-note controls, wired to the same CaseOutcome', () => {
    const outcome = new CaseOutcome();
    render(<ConfirmBar outcome={outcome} manifests={manifestsWhereNothingIsGranted()} onChange={() => {}} />);
    expect(screen.getByTestId('confirm-bar')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-bar-name')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-bar-note')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-bar-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-bar-return')).toBeInTheDocument();
    expect(screen.getByTestId('case-outcome-state')).toHaveTextContent('draft');
  });
});
