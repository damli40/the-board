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
    const observed = mc.tools.find((t) => t.live && bareToolName(t.name) === 'read_board');
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
