// The agent panel: one of four cross-origin iframes (A, B, seat1, seat2)
// embedded by the record app. Its whole job on camera is storyboard
// component 2, "the double prompt" — the record app fans the SAME text into
// every advocate panel's window at the SAME instant via postMessage, and
// each panel runs its own `runAgentTurn` against its own grant. "Never film
// the two panels in separate shots — the split screen is the proof."
//
// Task 5 (finish plan): restyled to match the design
// (docs/design/claude-design/the-board.dc.html, lines 262-342) and its
// script logic (EXAMPLES, the `panels` derivation, lines ~528-577 and
// ~819-886).
//
// Fix round 1, C3: the record's own chrome around this iframe (hue bar,
// name, state chip, role line, origin line) does not exist yet — both this
// task and the record's own App.tsx deferred it to the other. This file
// does not build that chrome (it has been assigned elsewhere), but it DOES
// carry a one-line, always-visible readout of this frame's own origin —
// "each one on its own web address" is the claim the whole page rests on,
// and it must not depend on the record's chrome ever landing.
//
// Fix round 1, C1/C2: `runAgentTurn` now returns STRUCTURED entries
// (`AgentEntry[]`, from loop.ts), and this file renders exactly what it is
// given — there is no `classify()` here anymore, and there never should be
// one again. Re-deriving a line's kind from its text was C2: a party's own
// exhibit text could contain a line reading "REFUSED: ..." and forge a fake
// refusal card on the reader's panel. With `kind` decided once, upstream,
// by code the counterparty cannot reach, that forgery is closed by
// construction, not by a rule someone has to remember.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { PARENT_ORIGIN } from '../../record/src/config/origins';
import type { Actor } from '../../record/src/model/types';
import { webmcpStatus } from '../../record/src/webmcp/env';
import { getGrantedTools, onToolsChanged, redactStoredKey, runAgentTurn, type AgentEntry } from './agent/loop';
// Fix round 1, I3: ONE actor-resolution site, shared with loop.ts. This
// file used to have its own `actorFromQuery` that validated `?actor=`
// against ACTORS while loop.ts's copy did not, so on `?actor=` (empty) or
// `?actor=bogus` this component stored the delivered config under 'A' and
// showed a provider, while loop.ts looked somewhere else, found nothing,
// and ran every turn scripted saying no key existed. See actor.ts.
import { panelActor } from './actor';
// Task 2b, part 1 — the contract this file consumes but never edits (see
// that file's own header comment): the config shape, the storage keys, and
// the message shape `record/src/App.tsx`'s `broadcastModelConfig` already
// sends. `loadConfigs`/`saveConfigs` already degrade a `SecurityError` (a
// browser with site data blocked) to a no-op — this file leans on that
// rather than re-implementing it, matching `loop.ts`'s `roomCodeHeader()`.
import {
  loadConfigs,
  saveConfigs,
  ROOM_CODE_STORAGE_KEY,
  type AgentModelConfig,
  type ModelConfigMessage,
} from '../../record/src/model/agentConfig';
import { LogLine, type LineKind } from './ui/LogLine';
import {
  ACTOR_NAME,
  BROKE_CHIP,
  EMPTY_LINE_DEFAULT,
  EMPTY_LINE_ZERO_TOOLS,
  EXAMPLES,
  NOTGRANTED_CHIP,
  REFUSED_CHIP,
  RUN_LABEL,
  STOPPED_FINISHED_ANYWAY,
  TOOL_COUNT_UNAVAILABLE,
  composerPlaceholder,
  jumpLabel,
  toolCountLabel,
} from './ui/copy';

interface PromptMessage {
  type: 'board:prompt';
  goal: string;
  /** Echoed back so a log line can show which broadcast a run answers, without a network round trip. */
  sentAt: number;
  /**
   * Ids the record actually created in `loadScenario`, for offline mode.
   * Exhibit and fact ids are generated, never literals, so a scripted run
   * that invented them would prove nothing. Absent in a live run.
   */
  demo?: { exhibitId?: string; factId?: string };
}

type DemoIds = { exhibitId?: string; factId?: string };

/** One rendered row. `goal` and `run` are the panel's own bookkeeping, not
 *  one of the five product states — see LogLine.tsx. `retryGoal`/`retryDemo`
 *  /`hadPriorSuccess` are only ever set on a `broke` entry: the first two so
 *  its Retry button can resend the exact instruction that failed, the third
 *  (fix round 1, I1) so the card can tell the truth about whether retrying
 *  will repeat a step that already reached the record. */
interface LogEntry {
  id: number;
  kind: 'goal' | LineKind;
  text: string;
  tool?: string;
  arg?: string;
  retryGoal?: string;
  retryDemo?: DemoIds;
  hadPriorSuccess?: boolean;
}

const NEAR_BOTTOM_PX = 100;
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  margin: 0,
};

function isPromptMessage(data: unknown): data is PromptMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === 'board:prompt' &&
    // Fix round 1, M5: without this, a malformed parent message rendered
    // "» undefined" and called runAgentTurn(undefined).
    typeof (data as { goal?: unknown }).goal === 'string'
  );
}


function isModelConfigMessage(data: unknown): data is ModelConfigMessage {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'board:model-config';
}

/**
 * Fix round 1, M4: the config a broadcast carries, kept only if it is
 * actually shaped like one.
 *
 * `isModelConfigMessage` above checks the message's `type` and nothing
 * else, so a payload of `{ provider: 'openai' }` with no key used to be
 * stored verbatim — after which the readout below said a provider was
 * configured while every run went scripted saying no key existed. The two
 * halves of the panel disagreed about the same object.
 *
 * Per-field string checks, the same shape the record side applies to its
 * own form values. Anything that fails is treated as `undefined` — i.e. as
 * a revocation — rather than stored: a half-config is not a config, and
 * silently keeping the previous one would leave a key in place that the
 * record believes it just replaced.
 *
 * `key` is required and must be non-blank; `provider` is required because
 * a config with no provider cannot name where it goes; `model` and
 * `baseUrl` are optional but must be strings when present. Note what this
 * deliberately does NOT do: reject a key with a line break. That is
 * loop.ts's `sendableModelConfig` to judge, at the moment of sending, so a
 * bad paste produces a log line that says what is wrong instead of
 * vanishing silently here.
 */
function validModelConfig(config: unknown): AgentModelConfig | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const c = config as Record<string, unknown>;
  if (typeof c.key !== 'string' || c.key.trim() === '') return undefined;
  if (typeof c.provider !== 'string' || c.provider === '') return undefined;
  if (c.model !== undefined && typeof c.model !== 'string') return undefined;
  if (c.baseUrl !== undefined && typeof c.baseUrl !== 'string') return undefined;
  return config as AgentModelConfig;
}

/**
 * Task 2b, part 3 (the room code): true when THIS frame's own iframe url
 * already carries a `?code=`. Used by the `board:model-config` handler
 * below to decide whether a broadcast's own roomCode is even worth storing
 * — see the comment at that call site for the full precedence rule and why.
 */
function urlHasRoomCode(): boolean {
  try {
    return !!new URLSearchParams(globalThis.location?.search ?? '').get('code');
  } catch {
    return false;
  }
}

/**
 * Writes THIS actor's own config into this frame's own sessionStorage,
 * reusing `loadConfigs`/`saveConfigs` (and, through them, `CONFIG_STORAGE_KEY`)
 * from record/src/model/agentConfig.ts — the SAME storage key name the
 * record's own Setup form reads and writes, never a second one invented
 * here. sessionStorage is per-origin, so this frame's own copy under that
 * name can never collide with the record's own copy on ITS origin
 * (agentConfig.ts's own comment on ROOM_CODE_STORAGE_KEY makes the identical
 * point about that key; the same reasoning applies here).
 *
 * `config: undefined` DELETES this actor's own entry rather than storing an
 * `undefined` value under it — deliberate, per agentConfig.ts's own header
 * comment: "A message carrying config: undefined clears any stored config
 * for this actor." That is how the setup form revokes a key.
 */
function saveActorModelConfig(actor: Actor, config: AgentModelConfig | undefined) {
  const configs = loadConfigs();
  if (config) configs[actor] = config;
  else delete configs[actor];
  saveConfigs(configs);
}

/**
 * Turns one turn's `AgentEntry[]` (already classified by loop.ts) into
 * rendered `LogEntry` rows, tracking whether an EARLIER entry in this same
 * turn already succeeded — fix round 1, I1: a retry always restarts the
 * whole goal from step 0, so a `broke` card must say honestly whether
 * retrying will repeat a step that already reached the record.
 */
function toLogEntries(entries: AgentEntry[], retryGoal: string, retryDemo: DemoIds, makeId: () => number): LogEntry[] {
  let sawSuccess = false;
  return entries.map((e) => {
    if (e.kind === 'ok') {
      sawSuccess = true;
      return { id: makeId(), kind: 'ok', text: e.text, tool: e.tool, arg: e.arg };
    }
    if (e.kind === 'broke') {
      return { id: makeId(), kind: 'broke', text: e.text, tool: e.tool, retryGoal, retryDemo, hadPriorSuccess: sawSuccess };
    }
    return { id: makeId(), kind: e.kind, text: e.text, tool: e.tool };
  });
}

/** The live region announces a COMPLETED sentence only, never a partial one
 *  — satisfied structurally here, not just cosmetically: every entry this
 *  reads already arrived as finished text (loop.ts resolves with a whole
 *  entry, never a fragment), so there is no partial-word case to guard
 *  against. `run` and `goal` entries are excluded by the caller — they are
 *  not completed outcomes. */
function sentenceFor(entry: LogEntry): string {
  switch (entry.kind) {
    case 'refused':
      return `${REFUSED_CHIP}. ${entry.text}`;
    case 'notgranted':
      return `${NOTGRANTED_CHIP}. ${entry.text}`;
    case 'broke':
      return `${BROKE_CHIP}. ${entry.text}`;
    case 'ok':
    case 'info':
      return entry.text;
    default:
      return '';
  }
}

/**
 * Fix round 1, C3 / fix round 2, N4: a one-line, always-visible readout of
 * this frame's own origin — "each one on its own web address" is the claim
 * the whole page rests on, and it must not depend on the record's card
 * chrome (still unbuilt) OR on WebMCP being available. Rendered in BOTH of
 * `App`'s return branches (the unavailable-reason screen and the real
 * panel body) from this one component, so the two can never drift apart —
 * the exact defect N4 found: the unavailable branch used to render nothing
 * here at all, which is precisely the moment a viewer most needs to know
 * which frame they're looking at.
 */
function OriginLine() {
  return (
    <div
      data-testid="panel-origin"
      style={{
        padding: '5px 16px',
        borderBottom: '1px solid rgba(243,242,242,.18)',
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: '.02em',
        color: 'rgba(243,242,242,.55)',
        overflowWrap: 'break-word',
      }}
    >
      ⌁ this frame: {window.location.origin}
    </div>
  );
}

export function App() {
  const actor = panelActor();
  const status = webmcpStatus();

  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [manualGoal, setManualGoal] = useState('');
  // Fix round 1, I4 + fix round 2, N5: a genuine tri-state. `undefined`
  // (the initial value) means "not read yet" — first paint, before the
  // first getGrantedTools() call has resolved either way. `null` means a
  // read was ATTEMPTED and failed. `number` is the real, known count.
  // Starting at `undefined` rather than `null` means first paint never
  // claims "could not be read" about a read that hasn't happened yet — the
  // same category error I4 fixed one state earlier (never a placeholder
  // "0 tools in hand" either).
  const [toolCount, setToolCount] = useState<number | null | undefined>(undefined);
  const [atBottom, setAtBottom] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [announced, setAnnounced] = useState('');
  // Task 2b, part 1: this actor's own model config, as last delivered by a
  // `board:model-config` broadcast (or, on first mount, whatever this frame's
  // own sessionStorage already held from an earlier broadcast in the same
  // tab — sessionStorage survives a reload, only the tab closing clears it).
  // `loop.ts`'s network layer does NOT read this state — it re-reads
  // sessionStorage fresh on every request (see its own `actorModelConfig()`
  // comment on why) — so this exists for THIS component's own rendering,
  // never as the source of truth the headers are built from.
  const [modelConfig, setModelConfig] = useState<AgentModelConfig | undefined>(() => loadConfigs()[actor]);

  const demoRef = useRef<DemoIds>({});
  const logRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(0);
  const makeId = useCallback(() => nextId.current++, []);
  const atBottomRef = useRef(true);
  /** Fix round 1, I2: `pendingCount` is DERIVED fresh from the current log
   *  every time, never accumulated with `n => n + delta`. The old
   *  accumulator counted an entry's arrival but never subtracted it again
   *  when it was later REMOVED (the `run` placeholder always is, once its
   *  real outcome lands) — so the total quietly over-reported by exactly
   *  one per instruction. Recomputing `log.filter(id not in seenIdsRef)`
   *  cannot drift that way: a removed entry simply stops appearing in
   *  `log` and stops being counted, with no ledger of past counts to
   *  correct. */
  const seenIdsRef = useRef<Set<number>>(new Set());
  /** Separate from `seenIdsRef` on purpose: this tracks what has ever been
   *  ANNOUNCED (independent of scroll position — an entry announces once,
   *  the moment it lands, whether or not the reader is at the bottom),
   *  while `seenIdsRef` tracks what the reader has visually caught up to. */
  const announcedIdsRef = useRef<Set<number>>(new Set());
  const announceSeqRef = useRef(0);
  /** Fix round 1, I10: a monotonic token per `runGoal` call. A turn's own
   *  `finally` only touches `busy` state if it is still the CURRENT token —
   *  Stop bumps the token so a stopped turn's eventual settlement can never
   *  re-disable a composer a fresh turn is already using. */
  const activeTokenRef = useRef(0);
  /** Fix round 1, I7: run ids the user asked to stop watching. Checked once
   *  the turn settles — see runGoal's own comment. */
  const stoppedRunIdsRef = useRef<Set<number>>(new Set());
  /** A ref mirror of `busy` so `runGoal` (declared with an empty dep array,
   *  so its identity stays stable for the message-listener effect below)
   *  can read the CURRENT busy state without becoming a new function every
   *  render. */
  const busyRef = useRef(false);

  // `sentAt` (fix round 1, Minor, prior round): the timestamp the record
  // page attached when it broadcast the double prompt into every advocate
  // panel at once. Shown on the goal line rather than dropped, because it
  // is the one piece of evidence that actually PROVES "same instant"
  // instead of just asserting it.
  const runGoal = useCallback(async (goal: string, sentAt?: number, demo?: DemoIds) => {
    // Fix round 1, I10: two board:prompt messages in flight, or a retry
    // clicked mid-turn, must not start a second concurrent turn.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const myToken = ++activeTokenRef.current;

    const sentLabel = sentAt !== undefined ? `  [sent ${new Date(sentAt).toISOString()}]` : '';
    const goalId = makeId();
    const runId = makeId();
    const effectiveDemo = demo ?? demoRef.current;
    setLog((prev) => [
      ...prev,
      { id: goalId, kind: 'goal', text: `» ${goal}${sentLabel}` },
      { id: runId, kind: 'run', text: goal },
    ]);

    function finishStopped() {
      stoppedRunIdsRef.current.delete(runId);
      setLog((prev) => [...prev.filter((l) => l.id !== runId), { id: makeId(), kind: 'ok', text: STOPPED_FINISHED_ANYWAY }]);
    }

    try {
      // `runAgentTurn` resolves in every case it reasonably can now (fix
      // round 1, C1/C2) — a rejection here is a genuine, unanticipated bug
      // in this file's own wiring, not an ordinary turn failure. Kept as a
      // defensive fallback so a truly unexpected throw is still surfaced
      // rather than silently hanging the composer.
      const entries = await runAgentTurn(goal, effectiveDemo);
      if (stoppedRunIdsRef.current.has(runId)) {
        finishStopped();
      } else {
        setLog((prev) => [...prev.filter((l) => l.id !== runId), ...toLogEntries(entries, goal, effectiveDemo, makeId)]);
      }
    } catch (err) {
      if (stoppedRunIdsRef.current.has(runId)) {
        finishStopped();
      } else {
        // Redacted for the same reason loop.ts's own catch is (fix round 1,
        // C1): this is a message on its way to the screen, and nothing
        // guarantees a runtime's error text does not quote what it was
        // handed.
        const message = redactStoredKey(err instanceof Error ? err.message : String(err));
        setLog((prev) => [
          ...prev.filter((l) => l.id !== runId),
          { id: makeId(), kind: 'broke', text: message, retryGoal: goal, retryDemo: effectiveDemo, hadPriorSuccess: false },
        ]);
      }
    } finally {
      if (activeTokenRef.current === myToken) {
        busyRef.current = false;
        setBusy(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fix round 1, I7: Stop hides the running card and frees the composer
  // immediately. It does NOT cancel the underlying call — Chrome's WebMCP
  // gives this panel no way to abort an in-flight executeTool call without
  // threading an AbortSignal through loop.ts, outside this task's file
  // list — and it does NOT pretend otherwise. When the stopped turn
  // eventually settles, `runGoal`'s own check on `stoppedRunIdsRef` renders
  // exactly one honest entry (STOPPED_FINISHED_ANYWAY) instead of a
  // confusing broke-with-retry card for a turn the user already ended, or a
  // silent swallow of whatever it actually did.
  const handleStop = useCallback((id: number) => {
    stoppedRunIdsRef.current.add(id);
    setLog((prev) => prev.filter((l) => l.id !== id));
    // Bump the token BEFORE flipping busy off, so this run's own eventual
    // `finally` (its captured `myToken` is now stale) cannot re-touch busy
    // state after a fresh turn has taken over.
    activeTokenRef.current++;
    busyRef.current = false;
    setBusy(false);
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance <= NEAR_BOTTOM_PX;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);

  const handleJump = useCallback(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
    for (const e of log) seenIdsRef.current.add(e.id);
    setPendingCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  // Auto-scroll only when the reader was already within 100px of the
  // bottom; otherwise recompute the jump control's pending count fresh
  // from the current log (fix round 1, I2 — see seenIdsRef's own comment on
  // why this must be a recomputation, not an accumulator). Never moves
  // focus — only ever touches `scrollTop`.
  //
  // Same pass drives the polite live region: for each newly-landed SETTLED
  // entry (fix round 1, I3a — this reads whole `AgentEntry` objects now,
  // never a split string, so there is no fragment-mid-sentence case to
  // guard against structurally), announce its sentence.
  useEffect(() => {
    const newlyAnnounced = log.filter((e) => !announcedIdsRef.current.has(e.id));
    for (const e of log) announcedIdsRef.current.add(e.id);

    const sentences = newlyAnnounced
      .filter((e) => e.kind === 'ok' || e.kind === 'info' || e.kind === 'refused' || e.kind === 'notgranted' || e.kind === 'broke')
      .map(sentenceFor)
      .filter(Boolean);
    if (sentences.length > 0) {
      // Fix round 1, I3b: `setAnnounced` with a value `Object.is`-equal to
      // the current state is a no-op render — React bails out, the DOM's
      // text node never changes, and a screen reader's aria-live observer
      // (which fires on an actual mutation) never sees a second identical
      // outcome. A trailing zero-width space, toggled by parity, keeps the
      // rendered STRING different across consecutive identical
      // announcements while adding nothing audible or visible.
      announceSeqRef.current += 1;
      const suffix = announceSeqRef.current % 2 === 0 ? '​' : '';
      setAnnounced(sentences.join(' ') + suffix);
    }

    const el = logRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      for (const e of log) seenIdsRef.current.add(e.id);
      setPendingCount(0);
      el.scrollTop = el.scrollHeight;
    } else {
      setPendingCount(log.filter((e) => !seenIdsRef.current.has(e.id)).length);
    }
  }, [log]);

  // Fix round 1, M7: reads the SAME feature-detect loop.ts's own
  // `getGrantedTools` uses, rather than a second hand-rolled copy of
  // `document.modelContext ?? navigator.modelContext`. `onToolsChanged`
  // subscribes to WebMCP's own `toolchange` event where the browser
  // supports it (immediate refresh); the interval stays as a fallback,
  // since Chrome's coverage of that event for a cross-origin `exposedTo`
  // grant is unverified.
  useEffect(() => {
    if (!status.available) return;
    let cancelled = false;
    async function refresh() {
      try {
        const tools = await getGrantedTools();
        if (!cancelled) setToolCount(tools.length);
      } catch {
        // Fix round 1, I4: a failed read must render as "unavailable", not
        // silently keep (or fall back to) a confident "0".
        if (!cancelled) setToolCount(null);
      }
    }
    void refresh();
    const unsubscribe = onToolsChanged(() => void refresh());
    const interval = setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
    };
  }, [status.available]);

  useEffect(() => {
    // The double prompt arrives here: the record app posts the same
    // { type: 'board:prompt', goal } to every advocate panel's window at
    // once. Only accepted from PARENT_ORIGIN — never a hardcoded literal,
    // imported from config/origins.ts (ruling 5).
    function onMessage(event: MessageEvent) {
      if (event.origin !== PARENT_ORIGIN) return;
      // The record hands every panel the ids it actually created, so a run
      // driven from this panel's own composer can use them too.
      if ((event.data as { type?: unknown })?.type === 'board:demo') {
        demoRef.current = (event.data as { demo?: DemoIds }).demo ?? {};
        return;
      }
      if (isModelConfigMessage(event.data)) {
        // Validated, not trusted (fix round 1, M4). A malformed or partial
        // config reads as `undefined` here, which is the revoke path — so
        // storage and this component's own state always agree, and both
        // agree with what loop.ts will find when it next builds headers.
        const config = validModelConfig(event.data.config);
        saveActorModelConfig(actor, config);
        setModelConfig(config);

        // Task 2b, part 3 — the room code, and why the url wins.
        //
        // This panel now learns a room code TWO ways: baked into its own
        // iframe url (record/src/App.tsx's roomCodeParam()) and carried on
        // this broadcast. The url wins whenever both exist: it is what the
        // record actually put on THIS frame's own address (RUNNING.md
        // Section 4's "one link, nothing typed" path, and Section 7a's
        // shared demo password) — a value this frame was loaded from — not
        // a value some other component's form state happened to hold at the
        // moment Save was clicked. The record's own Setup form has a known
        // bug where its room-code FIELD can display a different value than
        // the code actually in the record's own url (being fixed
        // separately, not here); preferring the url over this broadcast
        // keeps that bug from ever reaching this frame's own outgoing
        // requests, rather than inheriting it.
        //
        // Stored below only when the url has NO code of its own — into the
        // exact sessionStorage key loop.ts's roomCodeHeader() already falls
        // back to. That function re-reads the url first on EVERY request,
        // not once at mount, so even an unconditional write here could never
        // actually override a url-supplied code on any later call; the
        // guard just keeps a write that would never matter from happening
        // at all, so a reader of this file alone can see the precedence
        // without also having to read loop.ts to be sure of it.
        if (typeof event.data.roomCode === 'string' && event.data.roomCode && !urlHasRoomCode()) {
          try {
            globalThis.sessionStorage?.setItem(ROOM_CODE_STORAGE_KEY, event.data.roomCode);
          } catch {
            // Best-effort, same trade Setup.tsx's own room-code save makes.
          }
        }
        return;
      }
      if (!isPromptMessage(event.data)) return;
      void runGoal(event.data.goal, event.data.sentAt, event.data.demo);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runGoal, actor]);

  if (!status.available) {
    return (
      <div
        style={{
          minHeight: '100vh',
          boxSizing: 'border-box',
          background: 'var(--tb-panel)',
          color: '#f3f2f2',
          fontFamily: 'var(--font-body, Archivo), sans-serif',
          fontSize: 13,
        }}
      >
        {/* Fix round 2, N4: the origin line used to render ONLY in the
            available branch, so a reader hitting the WebMCP-unavailable
            message — exactly when they most need to know which frame
            they're looking at — saw nothing at all. C3's whole point was
            that this line must not depend on anything else landing; it
            must not depend on WebMCP being available either. */}
        <OriginLine />
        <p style={{ margin: 0, padding: 16, color: 'var(--tb-amber)' }}>{status.reason}</p>
      </div>
    );
  }

  const actorName = ACTOR_NAME[actor];
  const isEmpty = log.length === 0;
  // Fix round 1, I5: phase-neutral, ALWAYS — the panel has no channel to
  // learn the record's current phase, so it must never infer one from a
  // tool count (the exact defect this ruling corrects: a seat panel
  // printing "Tools arrive at review" after review has already ended).
  // Keyed purely off the tool count's own tri-state. `undefined` (not read
  // yet, fix round 2, N5) falls through to the same DEFAULT line as a
  // known-nonzero count, on purpose: before the first read resolves, this
  // panel has no honest claim to make about whether it holds anything, so
  // it says nothing definite rather than guessing at "unavailable" or "zero".
  const emptyLine = toolCount === null ? TOOL_COUNT_UNAVAILABLE : toolCount === 0 ? EMPTY_LINE_ZERO_TOOLS : EMPTY_LINE_DEFAULT;
  const logLabelId = `tb-log-${actor}`;
  const composerId = `tb-c-${actor}`;

  return (
    // No border of its own — the record's own card chrome (hue bar, name,
    // state chip, role line) is assigned elsewhere and does not exist yet
    // (fix round 1, C3). This is just the body: `var(--tb-panel)`
    // background, panel ink (#f3f2f2, fixed — see LogLine.tsx on why this
    // is never `var(--tb-ink)`), plus the one line C3 says must not wait on
    // that chrome: this frame's own origin.
    <div style={{ minHeight: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: 'var(--tb-panel)', color: '#f3f2f2' }}>
      <OriginLine />

      {/*
        Task 2b, part 1: a visually-hidden, test-and-DevTools-only readout of
        WHETHER this actor has a model config right now, and from which
        provider — never the key, never any of it "in full" (the
        non-negotiable this whole task is built around). The provider name
        alone identifies nothing secret; the key stays in sessionStorage and
        in the outgoing request header, never in the DOM.
      */}
      <div data-testid="panel-model-config" style={VISUALLY_HIDDEN}>
        {modelConfig ? `model config: ${modelConfig.provider}` : 'model config: none'}
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h2 id={logLabelId} style={VISUALLY_HIDDEN}>
          {actorName} transcript
        </h2>
        <div
          data-testid="panel-log"
          role="log"
          aria-live="off"
          aria-labelledby={logLabelId}
          tabIndex={0}
          ref={logRef}
          onScroll={handleScroll}
          className="tb-focus-amber-inset"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {isEmpty && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'rgba(243,242,242,.8)' }}>{emptyLine}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {EXAMPLES[actor].map((text, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`panel-example-${i}`}
                    onClick={() => setManualGoal(text)}
                    className="tb-hover-example tb-focus-amber"
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      border: '1px solid rgba(243,242,242,.28)',
                      padding: '9px 11px',
                      fontFamily: 'var(--font-body, Archivo), sans-serif',
                      fontSize: 12.5,
                      lineHeight: 1.4,
                      color: '#f3f2f2',
                      textAlign: 'left',
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {log.map((entry) =>
            entry.kind === 'goal' ? (
              <div key={entry.id} data-testid={`panel-line-${entry.id}`} style={{ fontSize: 12.5, color: 'var(--tb-amber)', opacity: 0.9 }}>
                {entry.text}
              </div>
            ) : (
              <LogLine
                key={entry.id}
                // Fix round 1, M6: keyed on the entry's own stable id, not
                // its transient array position — an array index shifts
                // whenever an earlier entry (the `run` placeholder) is
                // removed, so the same testid used to point at a different
                // line before and after a turn resolved.
                index={entry.id}
                line={{ kind: entry.kind, text: entry.text, tool: entry.tool, arg: entry.arg, hadPriorSuccess: entry.hadPriorSuccess }}
                onStop={entry.kind === 'run' ? () => handleStop(entry.id) : undefined}
                onRetry={entry.kind === 'broke' ? () => void runGoal(entry.retryGoal ?? '', undefined, entry.retryDemo) : undefined}
                retryDisabled={entry.kind === 'broke' ? busy : undefined}
              />
            )
          )}
        </div>

        {!atBottom && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <button
              type="button"
              data-testid="panel-jump"
              onClick={handleJump}
              className="tb-hover-amber-dark tb-focus-panel-ink"
              style={{
                all: 'unset',
                cursor: 'pointer',
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                minHeight: 44,
                background: 'var(--tb-amber)',
                color: '#191919',
                padding: '6px 14px',
                fontSize: 11.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
              <span>{jumpLabel(pendingCount)}</span>
            </button>
          </div>
        )}

        <div data-testid="panel-live-region" role="status" aria-live="polite" aria-atomic="false" style={VISUALLY_HIDDEN}>
          {announced}
        </div>
      </div>

      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid rgba(243,242,242,.18)', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const goal = manualGoal.trim();
            if (!goal) return;
            void runGoal(goal);
            setManualGoal('');
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
        >
          <label htmlFor={composerId} style={VISUALLY_HIDDEN}>
            {`Instruction for ${actorName}`}
          </label>
          <input
            id={composerId}
            data-testid="panel-composer"
            type="text"
            value={manualGoal}
            onChange={(e) => setManualGoal(e.target.value)}
            placeholder={composerPlaceholder(actorName)}
            className="tb-focus-amber"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--tb-panel-2)',
              border: '1px solid rgba(243,242,242,.32)',
              padding: '9px 10px',
              fontFamily: 'var(--font-body, Archivo), sans-serif',
              fontSize: 12.5,
              color: '#f3f2f2',
              borderRadius: 0,
            }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="submit"
              data-testid="panel-run"
              disabled={busy || !manualGoal.trim()}
              className="tb-hover-amber-dark tb-focus-panel-ink"
              style={{
                all: 'unset',
                cursor: busy || !manualGoal.trim() ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--tb-amber)',
                color: '#191919',
                padding: '7px 18px',
                fontSize: 12,
                fontWeight: 700,
                opacity: busy || !manualGoal.trim() ? 0.6 : 1,
              }}
            >
              {RUN_LABEL}
            </button>
            <span data-testid="panel-toolcount" style={{ fontSize: 11, color: 'rgba(243,242,242,.5)' }}>
              {toolCountLabel(toolCount)}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
