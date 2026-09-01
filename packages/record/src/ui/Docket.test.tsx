import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Docket, ToolHandStrip } from './Docket';
import { Ledger, Refusal } from '../webmcp/ledger';
import { ORIGIN } from '../config/origins';
import { ACTORS } from './theme';
import type { Manifest } from '../webmcp/registry';
import type { Actor } from '../model/types';

function emptyManifests(): Record<Actor, Manifest> {
  return Object.fromEntries(
    ACTORS.map((actor) => [actor, { actor, origin: ORIGIN[actor], granted: [], notGranted: [] }])
  ) as unknown as Record<Actor, Manifest>;
}

const noAppeal = { held: () => false, spent: () => false };

describe('Docket', () => {
  it('renders the empty-ledger state', () => {
    render(<Docket entries={[]} />);
    expect(screen.getByTestId('docket')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-tape')).toHaveTextContent('the ledger is empty — nothing has been called yet');
  });

  // Task 4 (finish plan, brief 4c): "The docket rows show the real ledger:
  // time from the ledger entry, the line, the outcome, with flagged styling
  // for a refusal." A success and a refusal must render as the SAME testids
  // the pre-restyle LedgerTape used, so nothing reading them by testid
  // breaks, and the refusal's thrown message must still be on the page.
  //
  // Fix round 1, test hygiene: this used to wrap a `confirm` call and throw
  // from it. `confirm` is in `NEVER_GRANTED` and is never registered
  // anywhere, so it is never wrapped by `Ledger.wrap` — no such ledger entry
  // can exist in the real system, even though the render path this test
  // exercises is real. `record_assessment` without an open exhibit is a
  // refusal that genuinely happens (`tools/impl.ts`'s read-receipt chain),
  // and this file's own guards throw `Refusal` for it — so the mock below
  // throws `Refusal` too, not a plain `Error`, to stay a real refusal shape
  // now that `LedgerTape` reads the `instanceof Refusal` discriminator
  // rather than treating every `!ok` row alike (finish task).
  it('renders a success row and a refusal row with their locked testids, and keeps the refusal message', async () => {
    const ledger = new Ledger(() => 1000);
    await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
    await ledger
      .wrap(ORIGIN.seat2, 'record_assessment', async () => { throw new Refusal('seat2 has not opened E1'); })({})
      .catch(() => {});

    render(<Docket entries={ledger.all()} />);

    expect(screen.getByTestId('ledger-row-success')).toHaveTextContent('open_exhibit');
    expect(screen.getByTestId('ledger-row-refusal')).toHaveTextContent('record_assessment');
    expect(screen.getByTestId('ledger-row-refusal')).toHaveTextContent('seat2 has not opened E1');
    expect(screen.getByTestId('ledger-row-refusal')).toHaveTextContent('REFUSED');
  });

  // Finish task: the defect this pins is the mirror image of the one
  // AgentCard's own test file pins — before this, EVERY `!ok` row rendered
  // "REFUSED" regardless of what actually happened, so a genuine bug during
  // the filmed run would print this project's own central claim about an
  // event that never occurred. A plain, unmarked `Error` — exactly what an
  // unanticipated crash looks like crossing `Ledger.wrap` — must render as
  // "BROKE" on its own distinct testid, never as "REFUSED".
  it('renders a genuine crash as BROKE, never as REFUSED', async () => {
    const ledger = new Ledger(() => 1000);
    await ledger
      .wrap(ORIGIN.seat1, 'open_exhibit', async () => { throw new TypeError('cannot read properties of undefined'); })({})
      .catch(() => {});

    render(<Docket entries={ledger.all()} />);

    expect(screen.getByTestId('ledger-row-broke')).toHaveTextContent('open_exhibit');
    expect(screen.getByTestId('ledger-row-broke')).toHaveTextContent('BROKE');
    expect(screen.getByTestId('ledger-row-broke')).toHaveTextContent('cannot read properties of undefined');
    expect(screen.queryByTestId('ledger-row-refusal')).not.toBeInTheDocument();
  });

  it('labels the row time as UTC', async () => {
    const ledger = new Ledger(() => Date.UTC(2026, 7, 31, 14, 3, 11));
    await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
    render(<Docket entries={ledger.all()} />);
    expect(screen.getByTestId('ledger-row-success')).toHaveTextContent('14:03:11Z');
  });
});

// Fix round 1, I5: the tool-hand strip moved out of "Record of steps" and
// is now its own export, rendered by App.tsx directly beneath the manifest
// grid. Its own testids and behaviour are unchanged.
describe('ToolHandStrip', () => {
  it('keeps the tool-hand strip testids', () => {
    render(<ToolHandStrip phase="FILING" manifests={emptyManifests()} appeal={noAppeal} />);
    for (const actor of ACTORS) expect(screen.getByTestId(`hand-${actor}`)).toBeInTheDocument();
  });
});
