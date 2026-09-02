// Fix round 1, Critical 2: an integration-level regression test, not just a
// unit test on Masthead's own formatting. The bug was in the WIRING —
// App.tsx handed Masthead the live, still-growing exhibit store — and a
// Masthead-only test can prove the component formats whatever it is given
// correctly, but cannot prove App.tsx gives it the right thing. This drives
// a real `<App />` through a real (faked) WebMCP registration, files a live
// exhibit through the actual `file_exhibit` tool body, and asserts the
// masthead clock is byte-identical before and after — the assertion the
// review asked for ("render with a live exhibit whose timestamp is today
// and assert the clock does not move").
//
// This is the first `App.test.tsx` in the repo. Deliberately narrow: one
// behaviour, using the existing `FakeModelContext` double (already used by
// `webmcp/phases.test.ts` and others) rather than any new test
// infrastructure, so it stays low-risk against the rest of App.tsx's
// surface, which other tasks in this plan are actively restyling.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { FakeModelContext } from './webmcp/fakeModelContext';
import { bareToolName } from './webmcp/tools';
import { ORIGIN } from './config/origins';

describe('App — the masthead clock never reads the live exhibit store', () => {
  afterEach(() => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it('does not move when Advocate A files a live exhibit', async () => {
    const mc = new FakeModelContext();
    (document as unknown as { modelContext?: unknown }).modelContext = mc;

    render(<App />);

    // The seeded scenario (five fixed exhibits, 09:00 to 09:20 UTC) has landed.
    await waitFor(() => expect(screen.getByTestId('masthead-clock')).toBeInTheDocument());
    const before = screen.getByTestId('masthead-clock').textContent;
    expect(before).toContain('09:00 to 09:20');

    // Advocate A's real, registered file_exhibit — the same body a panel
    // would call, stamping `now()` (wall-clock time; App.tsx passes no
    // override, so this really is "today").
    const fileExhibit = await waitFor(() => {
      const tool = mc.tools.find(
        (t) => t.live && bareToolName(t.name) === 'file_exhibit' && t.exposedTo?.includes(ORIGIN.A)
      );
      if (!tool) throw new Error('file_exhibit not yet registered to Advocate A');
      return tool;
    });
    await fileExhibit.execute({ name: 'filed live, on camera', kind: 'text', content: 'today, not the fixture' });

    // The live store now holds six exhibits, not five — this is what proves
    // the filing actually landed, distinct from the masthead assertion below.
    //
    // Finish task: `execute` now resolves with `Ledger.wrap`'s own JSON
    // envelope (`ledger.ts`), never the raw board object — parsed here and
    // asserted against the unwrapped `result`.
    // The OBSERVER's read, matched on its registered name rather than its
    // bare one. Task 4 gave A and B a `read_board` of their own, registered
    // as `a__read_board`/`b__read_board`, whose payload is the party's
    // sectioned view and carries no `exhibits` array at all — a bare-name
    // match would pick whichever of the three registered first and assert
    // against the wrong shape. The unprefixed name is the unscoped grant.
    const observed = mc.tools.find((t) => t.live && t.name === 'read_board');
    // Assert the grant EXISTS before asserting through it. The `if` below is
    // narrowing for the type checker, not a licence to skip: without this
    // line, an unscoped `read_board` that stopped being registered at all
    // would take the whole observer assertion with it and still pass green.
    expect(observed).toBeDefined();
    if (observed) {
      const wire = JSON.parse((await observed.execute({})) as string) as { ok: true; result: { exhibits: unknown[] } };
      expect(wire.result.exhibits.length).toBe(6);
    }

    // The masthead clock must be untouched: it reads the fixture's own
    // snapshot, captured once, never the live store this filing just grew.
    await waitFor(() => {
      expect(screen.getByTestId('masthead-clock').textContent).toBe(before);
    });
  });
});

// The run block is only worth anything where a judge cannot miss it. A
// RunIt-only test proves the block renders; it cannot prove App.tsx put it
// between the masthead and the phase rail, which is the whole placement
// argument. `compareDocumentPosition` asserts DOM order rather than pixels,
// which is what a test in jsdom can honestly claim.
describe('App — the run block sits between the masthead and the phase rail', () => {
  afterEach(() => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it('renders after the masthead meta rows and before the phase rail', async () => {
    (document as unknown as { modelContext?: unknown }).modelContext = new FakeModelContext();
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('run-it')).toBeInTheDocument());
    const record = screen.getByTestId('masthead-record');
    const runIt = screen.getByTestId('run-it');
    const rail = screen.getByTestId('phase-rail');

    // DOCUMENT_POSITION_FOLLOWING === 4: the argument comes after the node.
    expect(record.compareDocumentPosition(runIt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runIt.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
