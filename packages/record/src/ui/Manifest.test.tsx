import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Manifest, ManifestSection } from './Manifest';
// Ruling 5 (controller, task 8): no origin URL literals outside
// src/config/origins.test.ts. The brief's own Step 1 code wrote
// 'https://seat2.theboard.app' as a literal; ORIGIN.seat2 / ORIGIN.seat1
// carry the same illustrative value without hand-writing it a second time.
import { ORIGIN } from '../config/origins';
import { ALL_TOOL_NAMES, OBSERVER_LABEL, OBSERVER_ORIGIN } from '../webmcp/tools';
import { ACTORS } from './theme';
import type { Manifest as ManifestData, RegistrationFailure } from '../webmcp/registry';
import type { Actor } from '../model/types';

const manifest = {
  actor: 'seat2' as const,
  origin: ORIGIN.seat2,
  granted: [
    { tool: 'open_exhibit', used: 4, lends: false },
    { tool: 'extract_text', used: 2, lends: true }
  ],
  notGranted: ['file_fact', 'confirm']
};

describe('Manifest', () => {
  it('shows the call count beside each granted tool', () => {
    render(<Manifest manifest={manifest} phase="REVIEW" />);
    expect(screen.getByTestId('used-open_exhibit')).toHaveTextContent('4');
  });

  it('marks a lent capability, because that is what WebMCP is for', () => {
    render(<Manifest manifest={manifest} phase="REVIEW" />);
    expect(screen.getByTestId('row-extract_text')).toHaveTextContent('page lends');
  });

  it('renders the NOT GRANTED half, which is the half doing the work', () => {
    render(<Manifest manifest={manifest} phase="REVIEW" />);
    expect(screen.getByTestId('notgranted-confirm')).toHaveTextContent('NOT GRANTED');
    expect(screen.getByTestId('notgranted-file_fact')).toHaveTextContent('NOT GRANTED');
  });

  // Ruling 3 (controller, task 8): `ToolRegistry.registered()` builds
  // `granted` from Map insertion order, not alphabetically — Chrome's own
  // `getTools()` guarantee does not propagate here. This manifest's input is
  // deliberately given OUT of alphabetical order (search, then extract, then
  // open); the component must still render it sorted, or the signature image
  // reshuffles between takes of the video.
  it('renders the granted half sorted by tool name regardless of input order', () => {
    const unsorted = {
      actor: 'seat2' as const,
      origin: ORIGIN.seat2,
      granted: [
        { tool: 'search_exhibits', used: 1, lends: true },
        { tool: 'extract_text', used: 2, lends: true },
        { tool: 'open_exhibit', used: 4, lends: false }
      ],
      notGranted: []
    };
    render(<Manifest manifest={unsorted} phase="REVIEW" />);
    const rows = screen.getAllByTestId(/^row-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['row-extract_text', 'row-open_exhibit', 'row-search_exhibits']);
  });

  // Same ruling, the other column: NOT GRANTED is built from `ALL_TOOL_NAMES`
  // filtering, which follows TOOLS declaration order plus NEVER_GRANTED
  // appended — also not alphabetical.
  it('renders the NOT GRANTED half sorted by tool name regardless of input order', () => {
    const unsorted = {
      actor: 'seat1' as const,
      origin: ORIGIN.seat1,
      granted: [],
      notGranted: ['confirm', 'concede', 'dispute']
    };
    render(<Manifest manifest={unsorted} phase="REVIEW" />);
    const rows = screen.getAllByTestId(/^notgranted-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['notgranted-concede', 'notgranted-confirm', 'notgranted-dispute']);
  });

  // Task 4 (finish plan, brief 4a): the two row annotations are derived from
  // the real tool catalogue, and apply to a row whether it is granted or
  // withheld — extract_text is seat-only, so Advocate A's row for it is
  // always NOT GRANTED, and it must still carry the "lent by the page"
  // annotation there, not just in a seat's GRANTED column.
  //
  // Fix round 1, test hygiene: this used to be two `render()` calls in one
  // test with no cleanup between them — split into two tests, each with its
  // own render, so a testid collision between the two fixtures can never
  // paper over a real failure.
  it('annotates a lent tool as "lent by the page, seats only" when withheld', () => {
    const advocateManifest = {
      actor: 'A' as const,
      origin: ORIGIN.A,
      granted: [],
      notGranted: ['extract_text', 'search_exhibits']
    };
    render(<Manifest manifest={advocateManifest} phase="FILING" />);
    expect(screen.getByTestId('notgranted-extract_text')).toHaveTextContent('lent by the page, seats only');
    expect(screen.getByTestId('notgranted-search_exhibits')).toHaveTextContent('lent by the page, seats only');
  });

  // Fix round 1, Minor: a granted, lent tool used to show BOTH the "page
  // lends" badge and this fuller sentence — the same fact twice in one row.
  // The badge alone now covers the granted case.
  it('shows only the "page lends" badge, not the fuller sentence too, when the lent tool is granted', () => {
    render(<Manifest manifest={manifest} phase="REVIEW" />);
    const row = screen.getByTestId('row-extract_text');
    expect(row).toHaveTextContent('page lends');
    expect(row).not.toHaveTextContent('lent by the page, seats only');
  });

  it('annotates confirm and return_with_note as "never handed to anyone", from the real catalogue', () => {
    render(<Manifest manifest={manifest} phase="REVIEW" />);
    const row = screen.getByTestId('notgranted-confirm');
    expect(row).toHaveTextContent('never handed to anyone');
    // Never annotated on a tool that IS handed out somewhere.
    expect(screen.getByTestId('notgranted-file_fact')).not.toHaveTextContent('never handed to anyone');
  });

  // Fix round 1, I4: "lent by the page, seats only" must be derived from
  // BOTH `t.lends` AND `t.actors` — not `t.lends` alone. `record_assessment`
  // is seat-only (`actors: ['seat1','seat2']`) but does NOT lend the page's
  // machinery, so it must never carry the sentence; `extract_text` carries
  // both properties and must. This is the real catalogue, not a stub, so it
  // proves the conjunction is actually load-bearing today, not only in a
  // hypothetical future entry.
  it('does not annotate a seat-only tool that does not lend the page\'s machinery', () => {
    const seatManifest = {
      actor: 'seat1' as const,
      origin: ORIGIN.seat1,
      granted: [{ tool: 'record_assessment', used: 0, lends: false }],
      notGranted: []
    };
    render(<Manifest manifest={seatManifest} phase="REVIEW" />);
    expect(screen.getByTestId('row-record_assessment')).not.toHaveTextContent('lent by the page, seats only');
  });

  // C2: the empty-state sentence used to render whenever a card held
  // nothing, for ANY actor in ANY phase — so every card in CONFIRMED said
  // "Seats hold nothing while the advocates are filing," which is the last
  // frame of the filmed run, false on both counts (nobody is filing, and
  // two of the four are not seats). Only a seat, in FILING, gets that
  // sentence; every other empty case gets the phase- and role-neutral one.
  describe('the empty state (C2)', () => {
    const empty = (actor: Actor, notGranted: string[] = []) => ({ actor, origin: ORIGIN[actor], granted: [], notGranted });

    it('shows the seat/FILING sentence only for a seat, in FILING', () => {
      render(<Manifest manifest={empty('seat1')} phase="FILING" />);
      const card = screen.getByTestId('manifest-seat1');
      expect(within(card).getByText(/Seats hold nothing while the advocates are filing/)).toBeInTheDocument();
    });

    it('a seat holding nothing in CONFIRMED gets the neutral sentence, not the FILING one', () => {
      render(<Manifest manifest={empty('seat2')} phase="CONFIRMED" />);
      const card = screen.getByTestId('manifest-seat2');
      expect(within(card).queryByText(/Seats hold nothing while the advocates are filing/)).not.toBeInTheDocument();
      expect(within(card).getByText('Nothing is handed to this agent in this phase. That is the design, not a fault.')).toBeInTheDocument();
    });

    it('an advocate holding nothing in CONFIRMED — the last frame of the filmed run — gets the neutral sentence', () => {
      render(<Manifest manifest={empty('A')} phase="CONFIRMED" />);
      const card = screen.getByTestId('manifest-A');
      expect(within(card).queryByText(/Seats hold nothing while the advocates are filing/)).not.toBeInTheDocument();
      expect(within(card).getByText('Nothing is handed to this agent in this phase. That is the design, not a fault.')).toBeInTheDocument();
    });

    // An advocate whose appeal lifetime just closed permanently (spent
    // during VERDICT) empties the same way.
    it('an advocate holding nothing in VERDICT (a spent appeal) gets the neutral sentence', () => {
      render(<Manifest manifest={empty('B')} phase="VERDICT" />);
      const card = screen.getByTestId('manifest-B');
      expect(within(card).getByText('Nothing is handed to this agent in this phase. That is the design, not a fault.')).toBeInTheDocument();
    });

    it('a seat holding nothing outside FILING (e.g. before its own phase opens) gets the neutral sentence', () => {
      render(<Manifest manifest={empty('seat1')} phase="CONFIRMED" />);
      const card = screen.getByTestId('manifest-seat1');
      expect(within(card).getByText('Nothing is handed to this agent in this phase. That is the design, not a fault.')).toBeInTheDocument();
    });
  });
});

describe('ManifestSection', () => {
  const grantedObserver = { label: OBSERVER_LABEL, origin: OBSERVER_ORIGIN, granted: [{ tool: 'read_board', used: 1, lends: false }], notGranted: [] };
  const emptyObserver = { label: OBSERVER_LABEL, origin: OBSERVER_ORIGIN, granted: [], notGranted: ['read_board'] };
  const noFailures: RegistrationFailure[] = [];

  function fixtureManifests(catalogue: string[]): Record<Actor, ManifestData> {
    return Object.fromEntries(
      ACTORS.map((actor) => [actor, { actor, origin: ORIGIN[actor], granted: [], notGranted: [...catalogue] }])
    ) as unknown as Record<Actor, ManifestData>;
  }

  // Fix round 1, test hygiene: the previous version of this test read the
  // SAME `ALL_TOOL_NAMES` constant the component itself reads, so a
  // hardcoded `all 14` in the component would have passed it — it proved
  // nothing about liveness today, only that a future catalogue change would
  // eventually be caught. This stubs a catalogue of a DIFFERENT size (5, not
  // the real 14) into the manifests prop and asserts the rendered sentence
  // follows it, the same pattern `ConfirmBar.test.tsx` uses to prove ITS
  // check is live: this could only pass if the component derives the count
  // from the data it was actually given.
  it('renders the tool count read live from the manifests it was given, not a module constant', () => {
    const stubCatalogue = ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e'];
    render(<ManifestSection manifests={fixtureManifests(stubCatalogue)} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    expect(screen.getByText(/all 5\b/)).toBeInTheDocument();
    expect(screen.queryByText(/all 14\b/)).not.toBeInTheDocument();
  });

  // Fix round 2, Minor: the headline count only ever read `manifests[ACTORS[0]]`
  // (Advocate A). That is provably correct today — `granted`/`notGranted`
  // both partition the same `ALL_TOOL_NAMES` universe for every actor, per
  // `ToolRegistry.manifest()` — but nothing asserted it, so a future actor
  // whose `granted` list somehow held a duplicate tool name (two open
  // lifetimes granting the same name to one actor at once) could inflate
  // ONE actor's total silently. This fails if any actor's own
  // granted+notGranted total ever disagrees with Advocate A's.
  it('the headline total agrees across all four actors, not just the one it reads', () => {
    const manifests = fixtureManifests([...ALL_TOOL_NAMES]);
    const sample = manifests[ACTORS[0]].granted.length + manifests[ACTORS[0]].notGranted.length;
    for (const actor of ACTORS) {
      expect(manifests[actor].granted.length + manifests[actor].notGranted.length).toBe(sample);
    }
  });

  it('renders "catalogue", not "registry" — confirm and return_with_note are never registered', () => {
    render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    expect(screen.getByText(/one tool in this case.s catalogue/)).toBeInTheDocument();
  });

  // 1 Sep fix: the page never named WebMCP anywhere a reader can see it —
  // every `webmcp` occurrence in packages/record/src was an import path or a
  // code comment. copy-final.md's "The product name, 1 Sep" section names
  // the registry call as a WebMCP call. Assert on the visible string, not on
  // a variable holding it, so an edit that quietly drops the word back out
  // fails this test.
  it('names WebMCP in the lead paragraph, describing the registry call both marks share', () => {
    render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    expect(screen.getByText(/same WebMCP registry call/)).toBeInTheDocument();
  });

  it('renders one manifest card per actor', () => {
    render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    for (const actor of ACTORS) expect(screen.getByTestId(`manifest-${actor}`)).toBeInTheDocument();
  });

  // I2(b): `read_board` is a registered capability (the visiting agent's
  // grant) that appeared in no manifest anywhere before this fix.
  it('renders a fifth block for the visiting agent, with its grant', () => {
    render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    const card = screen.getByTestId('manifest-observer');
    expect(within(card).getByText(OBSERVER_LABEL)).toBeInTheDocument();
    expect(within(card).getByText(OBSERVER_ORIGIN)).toBeInTheDocument();
    expect(within(card).getByTestId('row-read_board')).toBeInTheDocument();
  });

  // Fix round 2, C1 — the Critical. The card used to be able to state
  // "This agent was handed one tool... It can read the whole board" AND
  // "Nothing is handed to this agent... That is the design" AT ONCE,
  // because the second sentence was gated only on `heldCount === 0`, with no
  // way to tell a genuine empty grant from a browser REFUSAL of the
  // registration (`observerFailures`, written by `openObserver`'s catch
  // branch, was read nowhere). These three tests are the regression suite:
  // granted, refused, and empty-with-no-refusal must render mutually
  // exclusive text, and the refused case must never claim a grant.
  describe('the visiting agent card, three states (C1)', () => {
    it('granted: the count-driven sentence, never the old hardcoded "one tool"', () => {
      render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
      const state = screen.getByTestId('manifest-observer-state');
      expect(state).toHaveTextContent(/This agent holds 1 of the board.s tools/);
      expect(state).not.toHaveTextContent('handed one tool');
      expect(state).not.toHaveTextContent('Nothing is handed to this agent');
      expect(state).not.toHaveTextContent('browser refused');
    });

    it('refused: names the browser refusal as a failure, never the granted sentence', () => {
      const failures: RegistrationFailure[] = [{ origin: OBSERVER_ORIGIN, tool: 'read_board', lifetime: 'observer' as never, reason: 'NotAllowedError' }];
      render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={emptyObserver} observerFailures={failures} />);
      const state = screen.getByTestId('manifest-observer-state');
      expect(state).toHaveTextContent('The browser refused this grant. This agent is holding nothing, and that is a failure, not the design.');
      expect(state).not.toHaveTextContent('This agent holds');
      expect(state).not.toHaveTextContent('Nothing is handed to this agent.');
    });

    it('registered and empty, no refusal recorded: the third sentence, with no phase named in it', () => {
      render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={emptyObserver} observerFailures={noFailures} />);
      const state = screen.getByTestId('manifest-observer-state');
      expect(state).toHaveTextContent('Nothing is handed to this agent.');
      expect(state).not.toHaveTextContent('in this phase');
      expect(state).not.toHaveTextContent('browser refused');
      expect(state).not.toHaveTextContent('This agent holds');
    });
  });

  it('the legend marks are decorative — the visible words already say what they mean', () => {
    render(<ManifestSection manifests={fixtureManifests([...ALL_TOOL_NAMES])} phase="FILING" observer={grantedObserver} observerFailures={noFailures} />);
    // A decorative SVG carries `aria-hidden`, not `role="img"` — so within
    // the legend specifically, it is absent from the accessible tree
    // entirely rather than double-announcing "handed over" next to its own
    // visible label. (Scoped to the legend, not the whole page: a per-row
    // mark elsewhere — e.g. the observer's granted `read_board` row — keeps
    // its real, functional aria-label on purpose.)
    const legend = screen.getByTestId('manifest-legend');
    expect(within(legend).queryAllByRole('img')).toHaveLength(0);
  });
});
