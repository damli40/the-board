// The record page — the parent origin, and the only origin that owns the
// WebMCP registry. Everything a viewer needs to see this project's claim —
// that the boundary is enforced by the browser, not narrated by the app —
// lives on this one page: the split manifest per actor, the phase ribbon and
// ledger tape, the exhibit list, the verdict panel with NO RULE CITED and
// the citation trace, and the confirm bar.
//
// Task 9 wires the tool bodies (`src/tools/impl.ts`) into the registry below
// and loads the fixed scenario fixture (`src/scenario.ts`) once FILING
// opens, so the exhibit list, docket and (once a seat reads and drafts) the
// verdict panel all have real material the instant the page comes up.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Actor, Phase } from './model/types';
import { ORIGIN } from './config/origins';
import { webmcpStatus } from './webmcp/env';
import { ToolRegistry, type ModelContextLike, type Manifest as ManifestData } from './webmcp/registry';
import { PhaseMachine } from './webmcp/phases';
import { Ledger } from './webmcp/ledger';
import { ExhibitStore } from './model/exhibits';
import { Receipts, AssessmentStore } from './model/receipts';
import { FactStore } from './model/facts';
import { DisputeStore } from './model/disputes';
import { VerdictStore } from './model/verdict';
import { CaseOutcome } from './model/outcome';
import { createToolImpl } from './tools/impl';
import { loadScenario } from './scenario';
import { ACTORS, ACTOR_LABEL, ACTOR_ACCENT } from './ui/theme';
import { Manifest } from './ui/Manifest';
import { Docket } from './ui/Docket';
import { ExhibitList } from './ui/ExhibitList';
import { VerdictPanel } from './ui/VerdictPanel';
import { ConfirmBar } from './ui/ConfirmBar';

const NEXT_PHASE: Partial<Record<Phase, Phase>> = { FILING: 'REVIEW', REVIEW: 'VERDICT' };

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
  const caseOutcome = useRef<CaseOutcome | undefined>(undefined);

  if (!ledger.current) {
    ledger.current = new Ledger();
    exhibits.current = new ExhibitStore();
    receipts.current = new Receipts();
    facts.current = new FactStore();
    assessments.current = new AssessmentStore(exhibits.current, receipts.current);
    disputes.current = new DisputeStore(exhibits.current, receipts.current);
    verdicts.current = new VerdictStore(assessments.current, receipts.current, facts.current, exhibits.current);
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

  return {
    ledger: ledger.current,
    registry: registry.current!,
    phaseMachine: phaseMachine.current!,
    exhibits: exhibits.current!,
    receipts: receipts.current!,
    facts: facts.current!,
    assessments: assessments.current!,
    disputes: disputes.current!,
    verdicts: verdicts.current!,
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

  const [prompt, setPrompt] = useState('');
  const iframeRefs = useRef<Partial<Record<Actor, HTMLIFrameElement | null>>>({});

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
    // The snapshot is built HERE, at call time, because this is the only
    // scope holding every store. Passing a function rather than a value is
    // deliberate: an agent must read the board as it is now, never a picture
    // of it taken at boot.
    void engine.registry.openObserver(() => ({
      phase: engine.phaseMachine.phase,
      agents: ACTORS.map((a) => {
        const m = engine.registry.manifest(a);
        return { actor: a, origin: m.origin, granted: m.granted, notGranted: m.notGranted };
      }),
      visitingAgent: engine.registry.observerManifest(),
      browserRefusedRegistrations: engine.registry.registrationFailures(),
      ledger: engine.ledger.all(),
      exhibits: engine.exhibits.all().map((e) => ({ id: e.id, name: e.name, kind: e.kind, side: e.side })),
      facts: engine.facts.all(),
      // Said in the data, not only in the UI, so an agent reading this cannot
      // conclude that some tool somewhere could sign the verdict.
      confirm: 'never registered to any agent, in any phase. A person presses it.'
    }));

    void loadScenario({ exhibits: engine.exhibits, facts: engine.facts }).then(() => {
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

  function broadcastPrompt() {
    const goal = prompt.trim();
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

  if (!status.available) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 font-mono p-6 flex items-center justify-center">
        <div className="max-w-lg border border-amber-700 bg-amber-950/20 rounded p-4">
          <p className="text-amber-300 text-sm">{status.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-tick={tick} className="min-h-screen bg-neutral-950 text-neutral-200 font-mono">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h1 className="text-sm uppercase tracking-[0.3em] text-neutral-400">The Board</h1>
        <div className="flex items-center gap-2 text-xs">
          {(['FILING', 'REVIEW', 'VERDICT', 'CONFIRMED'] as const).map((p) => (
            <span key={p} className={p === engine.phaseMachine.phase ? 'text-neutral-100' : 'text-neutral-700'}>
              {p}
            </span>
          ))}
          {NEXT_PHASE[engine.phaseMachine.phase] && (
            <button
              data-testid="advance-phase"
              onClick={advancePhase}
              className="ml-3 border border-neutral-700 rounded px-2 py-1 text-neutral-300 hover:bg-neutral-900"
            >
              advance → {NEXT_PHASE[engine.phaseMachine.phase]}
            </button>
          )}
        </div>
      </header>

      <main className="p-4 flex flex-col gap-4">
        {registrationFailures.length > 0 && (
          <section
            data-testid="registration-failures"
            className="border border-amber-500 bg-amber-950/30 rounded-md p-3 text-sm text-amber-100"
          >
            <h2 className="uppercase tracking-widest text-xs text-amber-300 font-semibold mb-1">
              the browser refused {registrationFailures.length} registration{registrationFailures.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-amber-200/80 mb-2">
              These tools were asked for and not granted. They are absent from every manifest below, so a
              GRANTED column that omits one is showing this failure, not a withheld capability.
            </p>
            <ul className="flex flex-col gap-0.5 text-xs font-mono">
              {registrationFailures.map((f) => (
                <li key={`${f.lifetime}:${f.origin}:${f.tool}`} data-testid={`registration-failure-${f.tool}`}>
                  {f.tool} · {f.origin} · {f.lifetime} · {f.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex gap-2">
          <input
            data-testid="double-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') broadcastPrompt(); }}
            placeholder="one instruction, into both advocate panels at once"
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm placeholder:text-neutral-600"
          />
          <button
            data-testid="double-prompt-send"
            onClick={broadcastPrompt}
            className="border border-neutral-600 rounded px-4 text-sm hover:bg-neutral-900"
          >
            send to A + B
          </button>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {ACTORS.map((actor) => (
            <div key={actor} className="flex flex-col gap-2">
              <Manifest manifest={manifests[actor]} />
              <iframe
                ref={(el) => { iframeRefs.current[actor] = el; }}
                data-testid={`frame-${actor}`}
                src={`${ORIGIN[actor]}/?actor=${actor}${roomCodeParam()}`}
                allow="tools"
                title={`${ACTOR_LABEL[actor]} panel`}
                className={`h-64 rounded border ${ACTOR_ACCENT[actor].border} bg-black`}
              />
            </div>
          ))}
        </section>

        <Docket
          phase={engine.phaseMachine.phase}
          manifests={manifests}
          appeal={{ held: (s) => engine.phaseMachine.appealHeld(s), spent: (s) => engine.phaseMachine.appealSpent(s) }}
          entries={engine.ledger.all()}
        />

        <ExhibitList exhibits={engine.exhibits.all()} assessments={engine.assessments.all()} bytesOf={bytesOf} />

        <VerdictPanel
          seat1={engine.verdicts.bySeat('seat1')}
          seat2={engine.verdicts.bySeat('seat2')}
          facts={engine.facts.all()}
          exhibits={engine.exhibits.all()}
          assessments={engine.assessments.all()}
          ledger={engine.ledger}
          grantedTools={grantedTools}
        />

        <ConfirmBar outcome={engine.caseOutcome} onChange={() => { refresh(); if (engine.caseOutcome.state === 'confirmed') void engine.phaseMachine.enter('CONFIRMED').then(refresh); }} />
      </main>
    </div>
  );
}
