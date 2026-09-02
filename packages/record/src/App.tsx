// The record page — the parent origin, and the only origin that owns the
// WebMCP registry. Everything a viewer needs to see this project's claim —
// that the boundary is enforced by the browser, not narrated by the app —
// lives on this one page: the masthead and phase rail, the refusal banner,
// the double-prompt bar, the split manifest per actor, the ledger tape, the
// exhibit list, the verdict panel with NO RULE CITED and the citation trace,
// and the confirm bar.
//
// Task 9 wires the tool bodies (`src/tools/impl.ts`) into the registry below
// and loads the fixed scenario fixture (`src/scenario.ts`) once FILING
// opens, so the exhibit list, docket and (once a seat reads and drafts) the
// verdict panel all have real material the instant the page comes up.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Actor, Exhibit, Fact } from './model/types';
import { ORIGIN } from './config/origins';
import { webmcpStatus } from './webmcp/env';
import { ToolRegistry, type ModelContextLike, type Manifest as ManifestData } from './webmcp/registry';
import { PhaseMachine, NEXT_PHASE } from './webmcp/phases';
import { Ledger } from './webmcp/ledger';
import { ExhibitStore } from './model/exhibits';
import { Receipts, AssessmentStore } from './model/receipts';
import { FactStore } from './model/facts';
import { DisputeStore } from './model/disputes';
import { VerdictStore } from './model/verdict';
import { ObjectionStore, type Objection } from './model/objections';
import { CaseOutcome } from './model/outcome';
import { createToolImpl } from './tools/impl';
import { loadScenario } from './scenario';
import { ACTORS, ACTOR_LABEL } from './ui/theme';
import { Masthead } from './ui/Masthead';
import { RunIt } from './ui/RunIt';
import { PhaseRail } from './ui/PhaseRail';
import { RefusalBanner } from './ui/RefusalBanner';
import { DoublePrompt } from './ui/DoublePrompt';
import { ManifestSection, Mark } from './ui/Manifest';
import { Docket, ToolHandStrip, shortTime } from './ui/Docket';
import { ExhibitList } from './ui/ExhibitList';
import { VerdictPanel } from './ui/VerdictPanel';
import { ConfirmBar } from './ui/ConfirmBar';
import { AgentCard, deriveAgentState, type AgentCardState } from './ui/AgentCard';
import { Setup } from './ui/Setup';
import { Beliefs } from './ui/Beliefs';
import { Unsupported } from './ui/Unsupported';
import { modelConfigDeliveries, type AgentConfigs } from './model/agentConfig';

/**
 * "The record" section (Task 4, finish plan, brief 4c): a shared bordered
 * grid cell around each of the three columns, matching the design's
 * `tb-cols3` treatment (the-board.dc.html, lines 417-481) — one border-top +
 * border-left on the grid itself, each cell adding its own border-right and
 * border-bottom, so the whole grid reads as one ruled table regardless of
 * which column is tallest. The heading and sub-line are copy-final.md,
 * verbatim, per column.
 */
function RecordColumn({ heading, sub, children }: { heading: string; sub: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, borderRight: '2px solid var(--tb-rule)', borderBottom: '2px solid var(--tb-rule)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{heading}</h3>
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--tb-ink-2)' }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * "Facts on the record" (design lines 436-459): no prior component rendered
 * this at all. Built straight off `FactStore.all()` — real facts, never the
 * design's fabricated `FACTS`.
 *
 * C3 fix, round 1: `f.status !== 'disputed'` used to collapse three states
 * into two, so `unopposed` (nobody has contested it YET, not "agreed") drew
 * a filled disc with `aria-label="agreed"`, and the status word was
 * suppressed exactly for `unopposed` — the one status where saying so
 * matters most. One side's unexamined claim then showed on the shared
 * record as agreed, to both sides, on the page whose entire pitch is that
 * neither side takes the other's word for anything.
 *
 * Three marks now, from copy-final.md's ruling: `conceded` is a filled disc
 * ("agreed"), `unopposed` is a hollow ring ("not yet contested"), `disputed`
 * is a hollow ring struck through ("contested"). The status word is
 * rendered for all three, never suppressed.
 *
 * Fix round 2, I3: C3 said "add a test per status," but `FactsColumn` was a
 * private, unexported function and the `fact-*` testids appeared in no test
 * file — the render was right, nothing pinned it. Exported here so
 * `App.test.tsx` (or a dedicated test file) can render it directly rather
 * than driving the whole `<App/>` through a fake WebMCP registration just to
 * reach three rows.
 */
const FACT_MARK: Record<Fact['status'], { variant: 'filled' | 'hollow' | 'struck'; ariaLabel: string; word: string }> = {
  conceded: { variant: 'filled', ariaLabel: 'agreed', word: 'agreed' },
  unopposed: { variant: 'hollow', ariaLabel: 'not yet contested', word: 'unopposed' },
  disputed: { variant: 'struck', ariaLabel: 'contested', word: 'disputed' },
};

export function FactsColumn({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, fontStyle: 'italic', color: 'var(--tb-ink-3)' }}>no facts filed yet</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {facts.map((f) => {
        const mark = FACT_MARK[f.status];
        return (
          <div key={f.id} data-testid={`fact-${f.id}`} style={{ display: 'grid', gridTemplateColumns: '13px 1fr', gap: 10, padding: '8px 0', borderTop: '1px solid var(--tb-rule-3)' }}>
            <div style={{ paddingTop: 3 }}>
              <Mark granted={mark.variant === 'filled'} variant={mark.variant} label={mark.ariaLabel} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{f.text}</span>
              <span style={{ fontSize: 11, color: 'var(--tb-ink-3)' }}>
                {ACTOR_LABEL[f.side]} — {mark.word}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Objections, under the facts they were raised about (Fable F5). The `object`
 * tool used to validate its text and throw it away, so this page could report
 * that Advocate A objected and never report what A said — a tally mark, not a
 * record. Same row styling as `FactsColumn` above, deliberately: an objection
 * sits on the record beside a fact, not in some quieter register.
 *
 * Exported for the same reason `FactsColumn` is: so a test can render it with
 * a real `ObjectionStore`'s output instead of driving the whole `<App/>`
 * through a fake WebMCP registration to reach one row.
 */
export function ObjectionsColumn({ objections }: { objections: Objection[] }) {
  if (objections.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, fontStyle: 'italic', color: 'var(--tb-ink-3)' }}>No objections.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {objections.map((o) => (
        <div key={o.id} data-testid={`objection-${o.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderTop: '1px solid var(--tb-rule-3)' }}>
          <span style={{ fontSize: 11, color: 'var(--tb-ink-3)' }}>
            {o.id} · {ACTOR_LABEL[o.by]}
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{o.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Every store, the registry and the phase machine, built once per page load
 * and kept for the case's whole lifetime — plain classes, not React state.
 * `tick` (returned alongside) is the seam: mutating one of these objects
 * does not by itself trigger a re-render, so every mutation path THIS FILE
 * INITIATES (advancing a phase, pressing confirm) calls `refresh()`
 * afterward. That is not every mutation path that exists: a panel executing
 * a tool mutates the ledger through Chrome's own cross-origin WebMCP
 * machinery, a call this file never makes and so can never follow with a
 * `refresh()` of its own (fix round 1, Critical — this comment previously
 * claimed "every mutation path," which was true of every path in this file
 * and wrong about the one that mattered). `engine.ledger.subscribe(refresh)`
 * below is what actually covers that path.
 */
function useEngine(mc: ModelContextLike, onStateChange: () => void) {
  const ledger = useRef<Ledger | undefined>(undefined);
  const registry = useRef<ToolRegistry | undefined>(undefined);
  const phaseMachine = useRef<PhaseMachine | undefined>(undefined);
  const exhibits = useRef<ExhibitStore | undefined>(undefined);
  const receipts = useRef<Receipts | undefined>(undefined);
  const facts = useRef<FactStore | undefined>(undefined);
  const assessments = useRef<AssessmentStore | undefined>(undefined);
  const disputes = useRef<DisputeStore | undefined>(undefined);
  const verdicts = useRef<VerdictStore | undefined>(undefined);
  const objections = useRef<ObjectionStore | undefined>(undefined);
  const caseOutcome = useRef<CaseOutcome | undefined>(undefined);

  if (!ledger.current) {
    ledger.current = new Ledger();
    exhibits.current = new ExhibitStore();
    receipts.current = new Receipts();
    facts.current = new FactStore();
    assessments.current = new AssessmentStore(exhibits.current, receipts.current);
    disputes.current = new DisputeStore(exhibits.current, receipts.current);
    verdicts.current = new VerdictStore(assessments.current, receipts.current, facts.current, exhibits.current);
    objections.current = new ObjectionStore();
    caseOutcome.current = new CaseOutcome();

    // `createToolImpl` needs a `PhaseMachine`, and `PhaseMachine` needs a
    // fully constructed `ToolRegistry` — which needs this whole impl map at
    // construction time. Breaking the cycle: build the registry with an
    // impl map whose `getPhaseMachine` thunk reads `phaseMachine.current`
    // lazily, at call time (only `spend_appeal` ever calls it), long after
    // the line below has filled it in. See ToolImplDeps's own comment.
    const impl = createToolImpl({
      exhibits: exhibits.current,
      facts: facts.current,
      receipts: receipts.current,
      assessments: assessments.current,
      disputes: disputes.current,
      verdicts: verdicts.current,
      objections: objections.current,
      // Task 4: the parties' own `read_board`. Reads the SAME snapshot the
      // visiting agent's read is built from (see `boardSnapshot` below), and
      // takes only the three parts a party is entitled to as a party — the
      // phase, the hands, and the ledger. The stores it also needs, it holds
      // directly. Lazy for the same reason `getPhaseMachine` is: nothing
      // below exists yet at this line.
      readBoard: () => {
        const s = boardSnapshot();
        return {
          phase: s.phase,
          agents: s.agents,
          // `at` is epoch milliseconds in the ledger; a party reading a line
          // of it needs a clock time. Formatted with the same `shortTime` the
          // docket prints, so the agent reading the board and the human
          // reading the page see one timestamp, not two renderings of it.
          // The visiting agent's payload keeps the raw number it always had.
          ledger: s.ledger.map((e) => ({ origin: e.origin, tool: e.tool, at: shortTime(e.at), ok: e.ok }))
        };
      },
      getPhaseMachine: () => {
        if (!phaseMachine.current) throw new Error('phase machine not ready yet');
        return phaseMachine.current;
      },
      // Final review, Blocker 3: `spend_appeal` defers its mutation past a
      // macrotask boundary on purpose, which puts it AFTER the render the
      // ledger subscription triggers. Without this callback the hand still
      // shows the appeal card and the ribbon still reads VERDICT until some
      // unrelated call happens to land, and at VERDICT there is no
      // next-phase button to force one. Being a race, takes would differ.
      onStateChange
    });
    registry.current = new ToolRegistry(mc, ledger.current, impl);
    phaseMachine.current = new PhaseMachine(registry.current);
  }

  /**
   * The board as it is RIGHT NOW: the phase, who was handed what, what the
   * browser refused, the ledger, and the case material.
   *
   * ONE definition, deliberately. Two readers need it — the visiting agent's
   * `read_board` (registered by `openObserver` in `App` below) and the
   * parties' own `read_board` (`createToolImpl` above) — and two object
   * literals would be two answers to "what does the board say", on a page
   * whose entire claim is that there is only one. The party's read takes a
   * subset of this; it never gets its own version of it.
   *
   * A function, not a value, for the same reason `openObserver` always took
   * one: an agent must read the board as it is now, never a picture of it
   * taken at boot. It reads through the refs at CALL time, which is also what
   * makes it safe to hand to `createToolImpl` before the registry and the
   * phase machine exist — see the cycle note above.
   */
  function boardSnapshot() {
    const registryNow = registry.current;
    const phaseNow = phaseMachine.current;
    if (!registryNow || !phaseNow) throw new Error('board not ready yet');
    return {
      phase: phaseNow.phase,
      agents: ACTORS.map((a) => {
        const m = registryNow.manifest(a);
        return { actor: a, origin: m.origin, granted: m.granted, notGranted: m.notGranted };
      }),
      visitingAgent: registryNow.observerManifest(),
      browserRefusedRegistrations: registryNow.registrationFailures(),
      ledger: ledger.current!.all(),
      exhibits: exhibits.current!.all().map((e) => ({ id: e.id, name: e.name, kind: e.kind, side: e.side })),
      facts: facts.current!.all(),
      objections: objections.current!.all(),
      // Said in the data, not only in the UI, so an agent reading this cannot
      // conclude that some tool somewhere could sign the verdict.
      confirm: 'never registered to any agent, in any phase. A person presses it.'
    };
  }

  return {
    boardSnapshot,
    ledger: ledger.current,
    registry: registry.current!,
    phaseMachine: phaseMachine.current!,
    exhibits: exhibits.current!,
    receipts: receipts.current!,
    facts: facts.current!,
    assessments: assessments.current!,
    disputes: disputes.current!,
    verdicts: verdicts.current!,
    objections: objections.current!,
    caseOutcome: caseOutcome.current!,
  };
}

function getRealModelContext(): ModelContextLike | undefined {
  const doc = document as unknown as { modelContext?: ModelContextLike };
  const nav = navigator as unknown as { modelContext?: ModelContextLike };
  return doc.modelContext ?? nav.modelContext;
}

/**
 * Passes the record's own `?code=` down to each panel iframe.
 *
 * The panel needs a room code to call its model proxy (panel/src/proxy/gate.ts).
 * Threading it through the iframe url means a judge opens ONE link —
 * `.../?code=XXXX` — and every panel inherits it, with no field to type and no
 * throwaway UI to design while the frontend is being redesigned.
 *
 * Returns '' when there is no code, so the url is byte-identical to what it was
 * before this existed. That matters: the frame assertions match on these urls,
 * and a stray `&code=` would change them for every run that never had one.
 */
function roomCodeParam(): string {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const parts: string[] = [];
    const code = q.get('code');
    if (code) parts.push(`code=${encodeURIComponent(code)}`);
    // Offline mode has to reach the panels, because that is where the agent
    // loop runs. Propagated from the record's own url so ONE link puts the
    // whole page in offline mode: /?offline=1
    if (q.get('offline') === '1') parts.push('offline=1');
    return parts.length ? `&${parts.join('&')}` : '';
  } catch {
    return '';
  }
}

export function App() {
  const status = webmcpStatus();
  // Hooks run unconditionally regardless of `status` — a no-op stand-in
  // keeps the hook order stable; it is never reachable from a real
  // registerTool call because the early return below short-circuits
  // rendering the rest of the tree whenever WebMCP is unavailable.
  const mc = useMemo<ModelContextLike>(() => getRealModelContext() ?? { registerTool: async () => {} }, []);

  // `tick`/`refresh` are declared BEFORE the engine now, because the engine's
  // one-time construction needs `refresh` to hand to `createToolImpl`'s
  // `onStateChange`. `refresh` has an empty dependency list, so it is stable
  // for the life of the page and safe to capture once.
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const engine = useEngine(mc, refresh);

  const iframeRefs = useRef<Partial<Record<Actor, HTMLIFrameElement | null>>>({});

  /**
   * Fix round 1, Critical 2: the masthead's clock used to read
   * `engine.exhibits.all()` directly — the LIVE store, which keeps growing
   * every time an agent calls `file_exhibit` (that tool stamps real
   * wall-clock time; `tools/impl.ts`'s `now()` defaults to
   * `new Date().toISOString()` and this file never overrides it). One filing
   * on camera moved the masthead's clock from the fixture's own 09:00-09:20
   * to a window that never existed, and it changed on every take — the exact
   * thing CLAUDE.md sec. 0 forbids ("fixed timestamps in the scenario...the
   * filmed run must be reproducible").
   *
   * `fixedExhibits` is captured ONCE, from `loadScenario`'s own return value,
   * the instant the fixture finishes seeding — before any live tool call can
   * possibly have happened — and never re-derived from the live store
   * afterward. `Masthead` reads only this, never `engine.exhibits.all()`.
   */
  const [fixedExhibits, setFixedExhibits] = useState<Exhibit[]>([]);

  useEffect(() => {
    if (!status.available) return;
    void engine.phaseMachine.enter('FILING').then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.available]);

  // Scenario.ts: seed the fixed case (five exhibits, seven facts, fixed ids
  // and ISO timestamps — see its own header) once, before any live tool
  // call happens. `scenarioLoaded` guards against React StrictMode's
  // double-invoke of effects in dev, which would otherwise file everything
  // twice and shift every id from E1..E5/F1..F7 to E1..E10/F1..F14.
  const scenarioLoaded = useRef(false);
  useEffect(() => {
    if (!status.available || scenarioLoaded.current) return;
    scenarioLoaded.current = true;
    // The visiting agent's grant. Opened once at boot, never closed, because
    // what an outside agent may read does not change with the phase: it may
    // always read, and it may never write. Registered WITHOUT `exposedTo`,
    // which is the documented seam (CLAUDE.md sec. 4) that makes it reachable
    // by an agent that is not one of the four panel origins.
    //
    // The snapshot is built at call time by `useEngine`'s own
    // `boardSnapshot` (Task 4), which is the only scope holding every store
    // AND the one the parties' `read_board` reads from too — one definition
    // of "what the board says", not one per reader. Passing a function
    // rather than a value is deliberate: an agent must read the board as it
    // is now, never a picture of it taken at boot.
    // Fix round 2, Minor: this used to be `void openObserver(...)` with no
    // `.then`, and `refresh()` only ran after `loadScenario` resolved below
    // — no ordering guarantee between the two async calls. On a page whose
    // first take is filmed, that left a transient frame where the observer
    // card could paint its empty state before this registration (or its
    // refusal) had actually settled. Chaining `.then(refresh)` here means a
    // re-render happens the instant THIS registration is known, not
    // whenever some unrelated effect next happens to trigger one.
    void engine.registry.openObserver(engine.boardSnapshot).then(refresh);

    void loadScenario({ exhibits: engine.exhibits, facts: engine.facts }).then((seeded) => {
      // The fixture's own return value, not `engine.exhibits.all()` — see
      // `fixedExhibits`'s own comment above. This is the ONLY place it is
      // ever set.
      setFixedExhibits(seeded.exhibits);
      refresh();
      // Panels mount with the iframes, so give them a beat to install their
      // message listener before the ids arrive.
      setTimeout(broadcastDemo, 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.available]);

  // Fix round 1, Critical: a panel executes a tool through Chrome's own
  // cross-origin WebMCP machinery — the callback that mutates the ledger and
  // the manifest call-counts runs, but nothing in THIS file calls refresh(),
  // because nothing in this file made the call in the first place. Without
  // this subscription the ledger tape, the manifest counts and the hand
  // chips all sat stale until a human clicked the advance-phase button or
  // ConfirmBar — exactly the failure mode named in review: a refusal lands
  // and the screen the video holds on shows nothing. Subscribing (not
  // polling) because the ledger already knows the instant an entry lands;
  // a poll would either lag behind that instant or spend cycles checking
  // state that usually hasn't changed.
  useEffect(() => {
    if (!status.available) return;
    return engine.ledger.subscribe(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.available]);

  const manifests = useMemo(
    () => Object.fromEntries(ACTORS.map((a) => [a, engine.registry.manifest(a)])) as Record<Actor, ManifestData>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  // Fix round 1, I2(b): `observerManifest()` already existed and nothing
  // rendered it — `read_board` is a registered capability that appeared in
  // no manifest anywhere. Recomputed on every `tick` for the same reason
  // `manifests` is: the visiting agent's own comment says it must read the
  // board as it is now, never a snapshot from boot.
  const observerManifest = useMemo(
    () => engine.registry.observerManifest(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  // Fix round 2, C1: `observerFailures` was written by `ToolRegistry` and
  // read nowhere — the visiting agent's card could show its "granted" text
  // and its "empty" text at once, with no way to tell that the empty state
  // was actually a browser REFUSAL of the no-`exposedTo` registration.
  // Recomputed on `tick` for the same reason `observerManifest` is.
  const observerFailures = useMemo(
    () => engine.registry.observerRegistrationFailures(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  // Final review, Should-fix 6: a `registerTool` the browser refuses (a
  // Permissions-Policy that does not name the origin returns NotAllowedError)
  // must never be able to pass for a working boundary. `ToolRegistry` no
  // longer counts a refused registration as a grant, so the manifest stops
  // claiming it, and this puts the refusal itself on screen, because a tool
  // quietly missing from a GRANTED column looks identical to a tool correctly
  // withheld. Normally empty.
  const registrationFailures = useMemo(
    () => engine.registry.registrationFailures(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  );

  // Final review, Should-fix 4: the split table's call-count column needs a
  // denominator, or a tool a seat never called is simply absent from the row
  // instead of showing as `0`, which is what the submission quotes that
  // table as proving ("Seat 1 called extract_text zero times"). Projected
  // from the same manifests the GRANTED column renders, so the zero can
  // never name a capability the seat does not hold.
  const grantedTools = useMemo(
    () => ({
      seat1: manifests.seat1.granted.map((g) => g.tool),
      seat2: manifests.seat2.granted.map((g) => g.tool),
    }),
    [manifests]
  );

  /**
   * Task 2a: `AgentCard`'s state chip, one per actor. `deriveAgentState`
   * (ui/AgentCard.tsx) is pure and DOM-free; this is the one place that
   * feeds it real data — how many tools this actor currently holds (from
   * the same `manifests` the manifest grid renders, so the two can never
   * disagree) and every ledger entry recorded under that actor's own
   * origin.
   *
   * Fix round 1, M9: this used to depend on `[manifests, tick]`. Redundant
   * — `manifests` (above) already carries its own `[tick]` dependency and
   * is a NEW object reference every tick (each `Row.used` count is read
   * from the ledger's own call counts, so a ledger entry landing changes
   * `manifests` too), so `[manifests]` alone already recomputes this on
   * every tick that could matter; the second dependency named the same
   * event twice.
   */
  const agentState = useMemo(() => {
    const entries = engine.ledger.all();
    return Object.fromEntries(
      ACTORS.map((actor) => {
        const origin = ORIGIN[actor];
        // `failure`, not just `ok`, now rides along — see LedgerEntry's own
        // comment (webmcp/ledger.ts) and deriveAgentState's (AgentCard.tsx):
        // without it, a crash on the filmed run would read as this
        // project's own central claim, "refused," about an event that
        // never happened.
        const forActor = entries.filter((e) => e.origin === origin).map((e) => ({ ok: e.ok, failure: e.failure }));
        return [actor, deriveAgentState(manifests[actor].granted.length, forActor)];
      })
    ) as Record<Actor, AgentCardState>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifests]);

  const bytesOf = useCallback((id: string) => engine.exhibits.bytesOf(id), [engine.exhibits]);

  function advancePhase() {
    const next = NEXT_PHASE[engine.phaseMachine.phase];
    if (!next) return;
    void engine.phaseMachine.enter(next).then(refresh);
  }

  /**
   * The ids `loadScenario` actually created, for offline mode.
   *
   * Read at send time rather than baked into the iframe url: exhibits load
   * asynchronously after mount, so putting them in the src would change it
   * once the case arrived and RELOAD every panel, wiping the transcript the
   * demo is there to show.
   */
  function demoContext() {
    return {
      exhibitId: engine.exhibits.all()[0]?.id,
      factId: engine.facts.all()[0]?.id,
    };
  }

  /**
   * Hands the same ids to all four panels, so a seat driven from its own
   * composer can run offline too. The double prompt stays A and B only —
   * that asymmetry is the thesis, not an oversight — so the ids travel on
   * their own message rather than riding it.
   */
  function broadcastDemo() {
    const demo = demoContext();
    if (!demo.exhibitId && !demo.factId) return;
    for (const actor of ACTORS) {
      iframeRefs.current[actor]?.contentWindow?.postMessage({ type: 'board:demo', demo }, ORIGIN[actor]);
    }
  }

  /**
   * `DoublePrompt` owns the input's own text state now (it used to be
   * `prompt`/`setPrompt` here); this receives the already-trimmed goal.
   */
  function broadcastPrompt(goal: string) {
    if (!goal) return;
    const demo = demoContext();
    // Storyboard component 2, "the double prompt": the SAME text, into BOTH
    // advocate panels, at the SAME instant. Never staggered, never sent to
    // one first — that is what makes the divergence in each panel's own
    // pane the proof rather than a claim.
    const sentAt = Date.now();
    for (const actor of ['A', 'B'] as const) {
      iframeRefs.current[actor]?.contentWindow?.postMessage({ type: 'board:prompt', goal, sentAt, demo }, ORIGIN[actor]);
    }
  }

  /**
   * Task 2a, Part 3 (delivery): `Setup`'s Save button calls this with the
   * hazard-gated configs it built (an actor with no key is simply absent —
   * see `agentConfig.ts`'s `buildActorConfig`) and the shared room code.
   * Same pattern as `broadcastDemo`/`broadcastPrompt` above: one
   * `postMessage` per frame, each with THAT frame's own `ORIGIN[actor]` as
   * `targetOrigin` — never `'*'`.
   *
   * Fix round 1, I11: the loop that decides `targetOrigin` used to live
   * inline here, where nothing could assert it without mocking a real
   * `HTMLIFrameElement`'s `contentWindow`. `modelConfigDeliveries`
   * (`model/agentConfig.ts`) now OWNS that decision as a pure, DOM-free
   * function — this just iterates its return value and calls
   * `postMessage`. A regression that changed the delivery plan to a
   * wildcard or a shared broadcast now breaks a test in that file, not
   * only in a browser nobody happened to check.
   */
  function broadcastModelConfig(configs: AgentConfigs, roomCode: string) {
    for (const delivery of modelConfigDeliveries(ACTORS, configs, roomCode, ORIGIN)) {
      iframeRefs.current[delivery.actor]?.contentWindow?.postMessage(delivery.message, delivery.targetOrigin);
    }
  }

  if (!status.available) {
    return <Unsupported reason={status.reason} />;
  }

  return (
    <div data-tick={tick} className="min-h-screen font-mono" style={{ background: 'var(--tb-ground)', color: 'var(--tb-ink)' }}>
      {/*
        Fix round 1, I4: this used to be four bare siblings with no
        landmark, so the <h1> and the refusal banner sat outside any region
        a screen reader's landmark navigation would stop at. <header> is the
        semantically correct wrapper for exactly this content (site identity
        + primary status), and adds no visual change — `<header>` carries no
        default browser margin/display to override.
      */}
      <header>
        <Masthead fixedExhibits={fixedExhibits} />
        {/*
          The two run paths, directly under the masthead's meta rows and above
          the phase rail. A judge arrives with the flag already on, so
          `Unsupported.tsx` never renders for them and everything it says about
          driving this with your own coding agent is invisible to the one
          person it was written for. Both paths already worked; neither was
          offered on this page. Kept to two short columns on purpose — see
          RunIt.tsx's own header — because pushing the phase rail below the
          fold would trade one missed thing for another.
        */}
        <RunIt />
        <PhaseRail phase={engine.phaseMachine.phase} onAdvance={advancePhase} />
        <RefusalBanner failures={registrationFailures} />
        <DoublePrompt onSend={broadcastPrompt} />
      </header>

      {/*
        Task 2a, Part 2: the setup form, above the manifests per its own
        brief ("2b. Setup.tsx — on the record page, above the manifests").
        `onSave` is this file's own `broadcastModelConfig` (Part 3) — Setup
        never touches `postMessage` or `ORIGIN` itself; it only decides WHAT
        to send.
      */}
      <Setup onSave={broadcastModelConfig} />

      <ManifestSection manifests={manifests} phase={engine.phaseMachine.phase} observer={observerManifest} observerFailures={observerFailures} />

      {/*
        Fix round 1, I5: the tool-hand strip used to sit inside "Record of
        steps", where the first thing under "every call any agent made, in
        order, with what came back" was four cards of what each agent
        currently HOLDS — not calls, not in order, not what came back, and a
        duplicate of the manifest grid three sections up. It belongs here
        instead: the manifest is the full catalogue, this is what is held
        right now.

        Fix round 2, I1: moving it here left it unlabelled — four cards
        repeating the four actor names from the manifest grid directly
        above, with nothing on the page saying why. Heading and sub-line
        below are copy-final.md, verbatim, and say exactly what I5's own
        justification said in the code comment but nowhere on screen.
      */}
      {/*
        The heading gets its own horizontal inset here — `ToolHandStrip`
        (Docket.tsx, not this task's file this round) already carries its
        own `clamp(16px,2.6vw,40px)` padding on its grid, so nesting it
        inside a second padded wrapper would double that inset instead of
        matching it, the exact "horizontal rhythm splits" bug fix round 1
        closed elsewhere on this page.
      */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 clamp(16px,2.6vw,40px) 12px' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-heading, Archivo), sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
          What each agent is holding right now
        </h2>
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--tb-ink-2)' }}>
          The manifest above is the whole catalogue. This is what is in each agent&rsquo;s hands at this moment, and
          it changes as phases open and close.
        </span>
      </div>
      <ToolHandStrip
        phase={engine.phaseMachine.phase}
        manifests={manifests}
        appeal={{ held: (s) => engine.phaseMachine.appealHeld(s), spent: (s) => engine.phaseMachine.appealSpent(s) }}
      />

      {/*
        The four panel frames. Task 2a ports the design's "Four agents, four
        frames" chrome around them (the-board.dc.html, lines 266-388) via
        `AgentCard`: the 4px hue bar, the name, a state chip, the role line
        and — the one that matters — `frame {origin}` in mono, printing the
        claim "each one on its own web address" instead of leaving it
        unstated. Ruling 7 (controller, finish plan) still holds: the
        design's panel is `min-height:440px`, so `AgentCard` fixes its own
        card at that height regardless of which task restyles what sits
        inside it.
      */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ padding: '16px clamp(16px,2.6vw,40px)' }}>
        {ACTORS.map((actor) => (
          <AgentCard key={actor} actor={actor} state={agentState[actor]}>
            <iframe
              ref={(el) => { iframeRefs.current[actor] = el; }}
              data-testid={`frame-${actor}`}
              src={`${ORIGIN[actor]}/?actor=${actor}${roomCodeParam()}`}
              allow="tools"
              title={`${ACTOR_LABEL[actor]} panel`}
              style={{ flex: 1, minWidth: 0, width: '100%', border: 'none' }}
            />
          </AgentCard>
        ))}
      </section>

      {/*
        Fix round 1, Minor: horizontal rhythm used to split three ways
        (`clamp(16px,2.6vw,40px)` in `ManifestSection`/`ConfirmBar`, `p-4` —
        a flat 16px — here and on the iframe section above, and `ConfirmBar`
        sitting inside THIS element's own `p-4` on top of its own clamp
        padding, compounding to 56px of left indent). `<main>` now owns no
        horizontal padding at all; every section below owns its own
        `clamp(16px,2.6vw,40px)` inset, the same value used everywhere else
        on the page.
      */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
        <div style={{ padding: '0 clamp(16px,2.6vw,40px)' }}>
          <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading, Archivo), sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            The record
          </h2>
          <div className="tb-cols3" style={{ display: 'grid', borderTop: '2px solid var(--tb-rule)', borderLeft: '2px solid var(--tb-rule)' }}>
            <RecordColumn heading="Exhibits" sub="The papers both sides argue from. Each has an id both halves quote.">
              <ExhibitList exhibits={engine.exhibits.all()} assessments={engine.assessments.all()} bytesOf={bytesOf} />
            </RecordColumn>
            <RecordColumn heading="Facts on the record" sub="Filed with file_fact. A filled disc is agreed, a hollow ring is not yet contested, a struck ring is disputed.">
              <FactsColumn facts={engine.facts.all()} />
              {/*
                F5: objections live under the facts, in the same column, because
                that is what they are about. Kept visually secondary to the facts
                above them — recorded, not adjudicated — but present in full, so
                a viewer can read what was said rather than only that something
                was said.
              */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Objections</h4>
                <ObjectionsColumn objections={engine.objections.all()} />
              </div>
            </RecordColumn>
            <RecordColumn heading="Record of steps" sub="Every call any agent made, in order, with what came back.">
              <Docket entries={engine.ledger.all()} />
            </RecordColumn>
          </div>
        </div>

        <div style={{ padding: '0 clamp(16px,2.6vw,40px)' }}>
          <VerdictPanel
            seat1={engine.verdicts.bySeat('seat1')}
            seat2={engine.verdicts.bySeat('seat2')}
            facts={engine.facts.all()}
            exhibits={engine.exhibits.all()}
            assessments={engine.assessments.all()}
            ledger={engine.ledger}
            grantedTools={grantedTools}
          />
        </div>

        <ConfirmBar
          outcome={engine.caseOutcome}
          manifests={manifests}
          onChange={() => { refresh(); if (engine.caseOutcome.state === 'confirmed') void engine.phaseMachine.enter('CONFIRMED').then(refresh); }}
        />

        {/*
          Task 6 (finish plan): the block this page has never had — a
          sentence saying what it is, after a viewer has already seen the
          record, the verdict and the confirm control it is a sentence
          about. Deliberately last: the masthead standfirst opens the
          argument, this closes it.
        */}
        <Beliefs />
      </main>
    </div>
  );
}
