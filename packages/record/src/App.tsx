// The record page — the parent origin, and the only origin that owns the
// WebMCP registry. Everything a viewer needs to see this project's claim —
// that the boundary is enforced by the browser, not narrated by the app —
// lives on this one page: the split manifest per actor, the phase ribbon and
// ledger tape, the exhibit list, the verdict panel with NO RULE CITED and
// the citation trace, and the confirm bar.
//
// Step 9 (task 9) replaces the empty `impl` map below with real tool bodies
// (`src/tools/impl.ts`) and loads a fixed scenario fixture
// (`src/scenario.ts`) — this task explicitly does not create either file.
// Until then, any tool a panel calls throws `${name} not implemented`, which
// the Ledger still records as a genuine refusal: the refusal-surfacing
// pipeline (registry -> ledger -> Docket's ledger tape) is real and
// demonstrable today, even though the SPECIFIC scripted refusals the video
// needs (a bad quote, an uncited assessment, the injection attempt reaching
// for `confirm`) only exist once Task 9's fixture is loaded.
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
function useEngine(mc: ModelContextLike) {
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
    // Task 9 supplies the real tool bodies (src/tools/impl.ts) — see file
    // header. An empty map here means every call throws "not implemented",
    // which the ledger still records as a real (if generic) refusal.
    registry.current = new ToolRegistry(mc, ledger.current, {});
    phaseMachine.current = new PhaseMachine(registry.current);
    exhibits.current = new ExhibitStore();
    receipts.current = new Receipts();
    facts.current = new FactStore();
    assessments.current = new AssessmentStore(exhibits.current, receipts.current);
    disputes.current = new DisputeStore(exhibits.current, receipts.current);
    verdicts.current = new VerdictStore(assessments.current, receipts.current, facts.current, exhibits.current);
    caseOutcome.current = new CaseOutcome();
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

export function App() {
  const status = webmcpStatus();
  // Hooks run unconditionally regardless of `status` — a no-op stand-in
  // keeps the hook order stable; it is never reachable from a real
  // registerTool call because the early return below short-circuits
  // rendering the rest of the tree whenever WebMCP is unavailable.
  const mc = useMemo<ModelContextLike>(() => getRealModelContext() ?? { registerTool: async () => {} }, []);
  const engine = useEngine(mc);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [prompt, setPrompt] = useState('');
  const iframeRefs = useRef<Partial<Record<Actor, HTMLIFrameElement | null>>>({});

  useEffect(() => {
    if (!status.available) return;
    void engine.phaseMachine.enter('FILING').then(refresh);
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

  const bytesOf = useCallback((id: string) => engine.exhibits.bytesOf(id), [engine.exhibits]);

  function advancePhase() {
    const next = NEXT_PHASE[engine.phaseMachine.phase];
    if (!next) return;
    void engine.phaseMachine.enter(next).then(refresh);
  }

  function broadcastPrompt() {
    const goal = prompt.trim();
    if (!goal) return;
    // Storyboard component 2, "the double prompt": the SAME text, into BOTH
    // advocate panels, at the SAME instant. Never staggered, never sent to
    // one first — that is what makes the divergence in each panel's own
    // pane the proof rather than a claim.
    const sentAt = Date.now();
    for (const actor of ['A', 'B'] as const) {
      iframeRefs.current[actor]?.contentWindow?.postMessage({ type: 'board:prompt', goal, sentAt }, ORIGIN[actor]);
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
                src={`${ORIGIN[actor]}/?actor=${actor}`}
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
        />

        <ConfirmBar outcome={engine.caseOutcome} onChange={() => { refresh(); if (engine.caseOutcome.state === 'confirmed') void engine.phaseMachine.enter('CONFIRMED').then(refresh); }} />
      </main>
    </div>
  );
}
