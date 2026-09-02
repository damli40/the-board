// The signature image (storyboard component 1), ported to the Claude Design
// pass's four-column bordered grid (the-board.dc.html, lines 175-260).
//
// ONE list per actor, not two columns. Every tool in the registry appears
// once, marked either handed over (filled) or not handed over (hollow). Both
// marks come from ONE registry call (`ToolRegistry.manifest(actor)`), so the
// two halves still cannot disagree — the withheld half remains a projection
// of the same registry and is never a hard-coded list.
//
// Task 4 (finish plan, brief 4a) adds `ManifestSection`, the wrapper the
// design draws around the four per-actor cards: the heading, the lead
// paragraph, the handed-over/not-handed-over legend, and the closing
// paragraph. `Manifest` itself stays the per-actor card, so `manifest-${actor}`
// and every row testid keep exactly the shape `Manifest.test.tsx` locks.
//
// Fix round 1 (review findings): five changes.
//
// C2 — the empty-state sentence used to render for ANY actor in ANY phase
// whenever it held nothing, including CONFIRMED (where all four cards would
// say "Seats hold nothing while the advocates are filing" — nobody is
// filing, and two of the four are not seats). `Manifest` now takes `phase`
// and only uses the seat/FILING sentence when both are actually true;
// copy-final.md's second, actor-and-phase-neutral string covers every other
// empty case.
//
// I2(b) — `read_board` is a registered capability (the visiting agent's
// grant, `ToolRegistry.observerManifest()`) that appeared in no manifest
// anywhere, which `webmcp/tools.ts`'s own comment calls "precisely the lie
// this project exists to prevent." `ManifestSection` now takes an `observer`
// prop and renders a fifth block, `manifest-observer`, below the four.
//
// I4 — "lent by the page, seats only" used to be derived from `t.lends`
// alone, so a hypothetical future tool with `lends: true` and
// `actors: ['A','B']` would have been told to the viewer as seat-only while
// the registry handed it to both advocates. `LENT_SEATS_ONLY` now also
// checks `t.actors`, across every entry for that name (a tool can appear
// more than once in `TOOLS` under different lifetimes).
//
// Minor — the merged list's sort now matches `VerdictPanel.tsx`'s bare
// code-unit comparator (Chrome's own `getTools()` ordering, CLAUDE.md sec.
// 1) instead of `localeCompare`, which depends on the runtime's ICU build.
// A granted, lent tool no longer shows both "page lends" and the fuller
// sentence — the badge alone covers the granted case, the sentence alone
// covers the withheld case, and they say the same thing exactly once.
// `Mark`'s legend usage is now `decorative`, so the SVG no longer announces
// "handed over" to a screen reader right next to the same words as visible
// text.
//
// Fix round 2, C1 — the observer card stated a fact ("This agent was handed
// one tool... It can read the whole board") directly above a sentence that
// could ALSO render ("Nothing is handed to this agent...") whenever
// `observer.granted` was empty. Both could be on screen together, and the
// state that produces an empty grant here is a browser REFUSAL:
// `ToolRegistry.openObserver` pushes to `observerFailures` when
// `registerTool` rejects, and until this fix nothing anywhere read that
// array — "the most dangerous shape a bug can take in this project"
// (registry.ts's own words), now happening on the one card this task added.
//
// `ObserverManifestCard` now takes `failures` and distinguishes three
// states, copy-final.md verbatim: granted (count-driven, never the old
// hardcoded "one tool" — the same defect as the design's "all fourteen");
// refused by the browser; registered and empty with no refusal recorded.
// The third drops "in this phase" on purpose — the observer's grant does
// not change with the phase, so naming one there would be meaningless.
import type { Actor, Phase } from '../model/types';
import type { Manifest as ManifestData, RegistrationFailure } from '../webmcp/registry';
import { ALL_TOOL_NAMES, NEVER_GRANTED, TOOLS, type ToolSpec } from '../webmcp/tools';
import { ACTORS, ACTOR_ACCENT, ACTOR_LABEL } from './theme';

type Row = {
  tool: string;
  granted: boolean;
  used: number;
  lends: boolean;
};

/** Every `granted`/`notGranted` shape this file draws a card for — the four real actors' and the visiting agent's. */
interface ManifestLike {
  origin: string;
  granted: { tool: string; used: number; lends: boolean }[];
  notGranted: string[];
}

/** Every entry in `TOOLS`, grouped by name — a tool can be declared more than once, under different lifetimes/actors. */
const TOOLS_BY_NAME = new Map<string, ToolSpec[]>();
for (const t of TOOLS) {
  TOOLS_BY_NAME.set(t.name, [...(TOOLS_BY_NAME.get(t.name) ?? []), t]);
}
const SEAT_ACTORS = new Set(['seat1', 'seat2']);

/**
 * I4: a tool is "lent by the page, seats only" only if EVERY entry declared
 * for that name both lends the machinery and is seat-only. `t.lends` alone
 * does not check who the tool is handed to; a future entry with
 * `lends: true, actors: ['A','B']` must not be told to the viewer as
 * seat-only just because some OTHER entry sharing its name is.
 */
const LENT_SEATS_ONLY = new Set(
  [...TOOLS_BY_NAME.entries()]
    .filter(([, specs]) => specs.some((s) => s.lends) && specs.every((s) => s.actors.every((a) => SEAT_ACTORS.has(a))))
    .map(([name]) => name)
);
/** `confirm` and `return_with_note` — never registered anywhere, for any actor, in any phase. */
const NEVER_TOOLS = new Set(NEVER_GRANTED);

/**
 * One row per tool in the registry, granted and withheld interleaved, sorted
 * by name.
 *
 * Sorting the MERGED list keeps each group internally alphabetical too, which
 * is what the manifest tests assert and what the camera needs. The
 * comparator is a bare code-unit comparison (not `localeCompare`, which
 * depends on the runtime's own locale/ICU build) so it matches Chrome's own
 * `getTools()` ordering exactly (docs/WEBMCP-NOTES.md §1) and cannot reshuffle
 * between environments.
 */
function rows(manifest: ManifestLike): Row[] {
  const merged: Row[] = [
    ...manifest.granted.map((g) => ({ tool: g.tool, granted: true, used: g.used, lends: g.lends })),
    ...manifest.notGranted.map((t) => ({ tool: t, granted: false, used: 0, lends: false })),
  ];
  return merged.sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0));
}

/**
 * The filled-disc / hollow-ring mark, shared by the manifest grid and (via
 * `App.tsx`'s `FactsColumn`) the facts column, whose filled/hollow pair means
 * agreed/contested rather than handed-over/not-handed-over. `label` lets a
 * reuser say what the shape actually means in ITS column; `variant` lets a
 * reuser draw a third state (the facts column's struck ring for `disputed`).
 * `decorative` drops the role/aria-label entirely for a mark whose meaning is
 * already spoken by adjacent visible text (the legend), so a screen reader
 * does not announce the same word twice.
 */
export function Mark({
  granted,
  label,
  variant,
  decorative,
}: {
  granted: boolean;
  label?: string;
  variant?: 'filled' | 'hollow' | 'struck';
  decorative?: boolean;
}) {
  const v = variant ?? (granted ? 'filled' : 'hollow');
  const text = label ?? (granted ? 'handed over' : 'not handed over');
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': text };

  if (v === 'filled') {
    return (
      <svg width="11" height="11" viewBox="0 0 22 22" style={{ display: 'block', color: 'var(--tb-ink)' }} {...a11y}>
        <circle cx="11" cy="11" r="10" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 22 22" style={{ display: 'block', color: 'var(--tb-ink-3)' }} {...a11y}>
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      {/*
        Fix round 2, Minor: at 11x11px the old line (5,17)-(17,5), strokeWidth
        2, sat entirely INSIDE the ring's own outline — about a 1px diagonal
        in the same colour and footprint as the plain hollow "not yet
        contested" ring, unreadable as a distinct mark at that size or on
        camera. Thickened and extended past the ring's own edge (which the
        22x22 viewBox's r=9 circle reaches at roughly (4.6,17.4)-(17.4,4.6) on
        this diagonal) so the strike visibly overshoots on both ends.
      */}
      {v === 'struck' && <line x1="2" y1="20" x2="20" y2="2" stroke="currentColor" strokeWidth="3" />}
    </svg>
  );
}

/** The row list body, shared by a real actor's card and the visiting agent's. */
function ManifestRows({ list }: { list: Row[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {list.map((r) => {
        const lentSeatsOnly = LENT_SEATS_ONLY.has(r.tool);
        const never = NEVER_TOOLS.has(r.tool);
        // Minor fix: a granted, lent tool used to show BOTH the "page lends"
        // badge and the fuller "lent by the page, seats only" sentence — the
        // same fact twice in one row. The badge alone covers the granted
        // case (it is the badge `Manifest.test.tsx` locks); the sentence is
        // the only annotation a WITHHELD lent row gets, since it never shows
        // the badge at all.
        const showBadge = r.granted && r.lends;
        const showSentence = lentSeatsOnly && !showBadge;
        return (
          <div
            key={r.tool}
            data-testid={r.granted ? `row-${r.tool}` : `notgranted-${r.tool}`}
            // The design's own row grid is `13px 1fr` (mark, name) — it
            // never draws a call count. This app's manifest always has,
            // and `used-${tool}` is a testid `Manifest.test.tsx` locks
            // (`used-open_exhibit` must read '4'), so a third `auto`
            // column is kept for it rather than dropped to match the
            // design pixel-for-pixel.
            style={{ display: 'grid', gridTemplateColumns: '13px 1fr auto', gap: 9, alignItems: 'start', padding: '5px 0', borderBottom: '1px solid var(--tb-rule-3)' }}
          >
            <div style={{ paddingTop: 3 }}>
              <Mark granted={r.granted} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: r.granted ? 500 : 400,
                  lineHeight: 1.35,
                  overflowWrap: 'break-word',
                  color: r.granted ? 'var(--tb-ink)' : 'var(--tb-ink-3)',
                }}
              >
                {r.tool}
              </span>

              {showBadge && (
                <span
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: 10.5,
                    lineHeight: 1.3,
                    padding: '1px 5px',
                    border: '1px solid var(--tb-rule-2)',
                    color: 'var(--tb-ink-2)',
                  }}
                >
                  page lends
                </span>
              )}

              {showSentence && (
                <span style={{ fontSize: 11, lineHeight: 1.3, color: 'var(--tb-ink-2)' }}>lent by the page, seats only</span>
              )}
              {never && (
                <span style={{ fontSize: 11, lineHeight: 1.3, color: 'var(--tb-never)', fontWeight: 600 }}>never handed to anyone</span>
              )}

              {/*
                The strikethrough and the hollow ring carry nothing to a
                screen reader. These words are the only thing that does,
                and they are why the row is still legible with no colour
                and no shape.
              */}
              {!r.granted && <span className="sr-only"> NOT GRANTED</span>}
            </div>

            {r.granted && (
              <span
                data-testid={`used-${r.tool}`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tb-ink-3)' }}
              >
                {r.used}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** C2: the phase- and role-aware empty state. Both strings are copy-final.md, verbatim. */
function emptyStateText(isSeat: boolean, phase: Phase): string {
  if (isSeat && phase === 'FILING') {
    return 'Seats hold nothing while the advocates are filing. Tools arrive at review. This emptiness is the design, not a fault.';
  }
  return 'Nothing is handed to this agent in this phase. That is the design, not a fault.';
}

export function Manifest({ manifest, phase }: { manifest: ManifestData; phase: Phase }) {
  const accent = ACTOR_ACCENT[manifest.actor];
  const list = rows(manifest);
  const heldCount = manifest.granted.length;
  const isSeat = manifest.actor === 'seat1' || manifest.actor === 'seat2';

  return (
    <section
      data-testid={`manifest-${manifest.actor}`}
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '2px solid var(--tb-rule)',
        borderBottom: '2px solid var(--tb-rule)',
        padding: '14px 16px 8px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
        <span className={accent.dot} style={{ width: 10, height: 10, flex: 'none' }} aria-hidden />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{ACTOR_LABEL[manifest.actor]}</h3>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tb-ink-3)', marginBottom: 12, wordBreak: 'break-all' }}>
        {manifest.origin}
      </div>

      {/*
        Deliberate emptiness must not read as accidental emptiness. Which
        sentence is true depends on WHO is empty and WHEN — see
        `emptyStateText` and C2 above.
      */}
      {heldCount === 0 && (
        <p style={{ margin: '0 0 12px', background: 'var(--tb-ground-2)', padding: '10px 12px', fontSize: 13, lineHeight: 1.45 }}>
          {emptyStateText(isSeat, phase)}
        </p>
      )}

      <ManifestRows list={list} />
    </section>
  );
}

/**
 * I2(b): the visiting agent's manifest — `ToolRegistry.observerManifest()`
 * already exists and, before this fix, nothing drew it. `read_board` is a
 * REGISTERED capability (registered without `exposedTo`, which is what makes
 * it reachable by an agent that is not one of the four panel origins) that
 * appeared in no manifest anywhere: `webmcp/tools.ts`'s own comment names
 * that "precisely the lie this project exists to prevent."
 *
 * Fix round 2, C1: `heldCount === 0` used to gate a SECOND paragraph that
 * could render right below the always-shown "This agent was handed one
 * tool... It can read the whole board" sentence — so a browser REFUSAL
 * (`failures` non-empty, `granted` therefore empty) looked exactly like the
 * card confirming a grant that never happened. Three mutually exclusive
 * states now, one paragraph, copy-final.md verbatim:
 *   1. granted (`heldCount > 0`) — the count-driven sentence. Never the old
 *      hardcoded "one tool", the same defect as the design's "all fourteen".
 *   2. refused (`heldCount === 0 && failures.length > 0`) — names the
 *      refusal as a failure, not the design.
 *   3. registered and empty, no refusal recorded — the only case that is
 *      genuinely "no news"; drops "in this phase" on purpose, since the
 *      observer's grant does not change with the phase.
 * `RefusalBanner` does not read `failures` here — this is not a per-lifetime
 * failure and that component belongs to a different task.
 */
function observerStateText(heldCount: number, failures: RegistrationFailure[]): string {
  if (heldCount > 0) {
    return `This agent holds ${heldCount} of the board’s tools and never asked for a seat. It can read the whole board and change nothing on it. Its grant carries no origin, which is what makes it readable by an agent that simply arrived — and which is why it is not a claim about the browser’s own agent.`;
  }
  if (failures.length > 0) {
    return 'The browser refused this grant. This agent is holding nothing, and that is a failure, not the design.';
  }
  return 'Nothing is handed to this agent.';
}

export function ObserverManifestCard({ observer, failures }: { observer: ManifestLike & { label: string }; failures: RegistrationFailure[] }) {
  const list = rows(observer);
  const heldCount = observer.granted.length;
  const refused = heldCount === 0 && failures.length > 0;

  return (
    <section
      data-testid="manifest-observer"
      style={{
        minWidth: 0,
        border: '2px solid var(--tb-rule)',
        padding: '14px 16px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
        <span style={{ width: 10, height: 10, flex: 'none', background: 'var(--tb-ink-3)' }} aria-hidden />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{observer.label}</h3>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tb-ink-3)', marginBottom: 10, wordBreak: 'break-all' }}>
        {observer.origin}
      </div>
      <p
        data-testid="manifest-observer-state"
        style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, maxWidth: '80ch', color: refused ? 'var(--tb-red)' : 'var(--tb-ink-2)', fontWeight: refused ? 600 : 400 }}
      >
        {observerStateText(heldCount, failures)}
      </p>

      <ManifestRows list={list} />
    </section>
  );
}

/**
 * The section the design wraps the four cards in (lines 167-264): heading,
 * lead paragraph, legend, the `tb-cols4` grid of `Manifest` cards, and the
 * closing paragraph about `extract_text` / `search_exhibits`. All copy is
 * copy-final.md's manifest section, verbatim.
 *
 * The tool count is read from the `manifests` DATA itself — a real actor's
 * `granted.length + notGranted.length` is, by construction, the full
 * catalogue size — rather than from the `ALL_TOOL_NAMES` module constant
 * directly. A test that stubs a different-sized catalogue into `manifests`
 * and asserts the sentence follows it is what proves this is live rather
 * than a number that merely happens to match today (test hygiene, fix
 * round 1).
 */
export function ManifestSection({
  manifests,
  phase,
  observer,
  observerFailures,
}: {
  manifests: Record<Actor, ManifestData>;
  phase: Phase;
  observer: ManifestLike & { label: string };
  observerFailures: RegistrationFailure[];
}) {
  const sample = manifests[ACTORS[0]];
  const totalCount = sample ? sample.granted.length + sample.notGranted.length : ALL_TOOL_NAMES.length;

  return (
    <div style={{ padding: '26px clamp(16px,2.6vw,40px) 30px', borderBottom: '2px solid var(--tb-rule)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 32px', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading, Archivo), sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            What each agent may call
          </h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, maxWidth: '96ch', color: 'var(--tb-ink-2)' }}>
            Every row is one tool in this case&rsquo;s catalogue, all {totalCount}, in the same order for all four
            agents. Both marks come from the same WebMCP registry call, so what an agent holds and what it does not hold
            cannot disagree.
          </p>
        </div>
        <div data-testid="manifest-legend" style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Mark granted decorative />
            handed over
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--tb-ink-2)' }}>
            <Mark granted={false} decorative />
            not handed over
          </span>
        </div>
      </div>

      <div
        className="tb-cols4"
        style={{ display: 'grid', borderTop: '2px solid var(--tb-rule)', borderLeft: '2px solid var(--tb-rule)', alignItems: 'stretch' }}
      >
        {ACTORS.map((actor) => (
          <Manifest key={actor} manifest={manifests[actor]} phase={phase} />
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <ObserverManifestCard observer={observer} failures={observerFailures} />
      </div>

      <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--tb-ink-2)', maxWidth: '112ch' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>extract_text</span> and{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>search_exhibits</span> belong to the seats and to
        no one else. The page holds that machinery, runs it for a seat on request and watches while it runs. No agent,
        seat or advocate, ever receives the machinery itself.
      </p>
    </div>
  );
}
