// The agent panel: one of four cross-origin iframes (A, B, seat1, seat2)
// embedded by the record app. Its whole job on camera is storyboard
// component 2, "the double prompt" — the record app fans the SAME text into
// every advocate panel's window at the SAME instant via postMessage, and
// each panel runs its own `runAgentTurn` against its own grant. "Never film
// the two panels in separate shots — the split screen is the proof."
import { useCallback, useEffect, useState } from 'react';
import { PARENT_ORIGIN } from '../../record/src/config/origins';
import type { Actor } from '../../record/src/model/types';
import { ACTOR_ACCENT, ACTOR_LABEL, ACTORS } from '../../record/src/ui/theme';
import { webmcpStatus } from '../../record/src/webmcp/env';
import { runAgentTurn } from './agent/loop';

interface PromptMessage {
  type: 'board:prompt';
  goal: string;
  /** Echoed back so a log line can show which broadcast a run answers, without a network round trip. */
  sentAt: number;
}

function isPromptMessage(data: unknown): data is PromptMessage {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'board:prompt';
}

function actorFromQuery(): Actor {
  const value = new URLSearchParams(window.location.search).get('actor');
  return (ACTORS as string[]).includes(value ?? '') ? (value as Actor) : 'A';
}

type LogLine = { at: number; text: string; kind: 'goal' | 'refused' | 'notgranted' | 'ok' | 'error' };

function classify(text: string): LogLine['kind'] {
  if (text.startsWith('REFUSED:')) return 'refused';
  if (text.startsWith('NOT GRANTED:')) return 'notgranted';
  return 'ok';
}

export function App() {
  const actor = actorFromQuery();
  const accent = ACTOR_ACCENT[actor];
  const status = webmcpStatus();
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [manualGoal, setManualGoal] = useState('');

  // `sentAt` (fix round 1, Minor): the timestamp the record page attached
  // when it broadcast the double prompt into every advocate panel at once.
  // Shown on the goal line rather than dropped, because it is the one piece
  // of evidence that actually PROVES "same instant" instead of just
  // asserting it — put the two panels' goal lines side by side on camera and
  // the timestamps should read identical (or a handful of ms apart from
  // event-loop scheduling, not a human-driven gap).
  const runGoal = useCallback(async (goal: string, sentAt?: number) => {
    setBusy(true);
    const sentLabel = sentAt !== undefined ? `  [sent ${new Date(sentAt).toISOString()}]` : '';
    setLog((prev) => [...prev, { at: Date.now(), text: `» ${goal}${sentLabel}`, kind: 'goal' }]);
    try {
      const result = await runAgentTurn(goal);
      const lines = result.split('\n').filter(Boolean);
      setLog((prev) => [...prev, ...lines.map((text) => ({ at: Date.now(), text, kind: classify(text) }))]);
    } catch (err) {
      // Fix round 1, Important 1: a transport failure (the model proxy
      // erroring, or the fetch itself rejecting) used to throw straight out
      // of this function with no catch — an unhandled rejection that leaves
      // the panel showing the goal line and then nothing, forever, which
      // reads as a hang on camera. Rendered the same LOUD way a tool refusal
      // is: this is a failure the product surfaces, not swallows.
      const message = err instanceof Error ? err.message : String(err);
      setLog((prev) => [...prev, { at: Date.now(), text: `TRANSPORT ERROR: ${message}`, kind: 'error' }]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // The double prompt arrives here: the record app posts the same
    // { type: 'board:prompt', goal } to every advocate panel's window at
    // once. Only accepted from PARENT_ORIGIN — never a hardcoded literal,
    // imported from config/origins.ts (ruling 5).
    function onMessage(event: MessageEvent) {
      if (event.origin !== PARENT_ORIGIN) return;
      if (!isPromptMessage(event.data)) return;
      void runGoal(event.data.goal, event.data.sentAt);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runGoal]);

  if (!status.available) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-300 font-mono text-sm p-4">
        <p className="text-amber-300">{status.reason}</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-neutral-950 text-neutral-200 font-mono text-xs flex flex-col border-4 ${accent.border}`}>
      <header className={`flex items-center justify-between px-3 py-2 ${accent.bg} border-b ${accent.border}`}>
        <span className={`uppercase tracking-widest font-semibold ${accent.text}`}>{ACTOR_LABEL[actor]}</span>
        <span className="text-neutral-500">⌁ frame: {window.location.origin}</span>
      </header>

      <div data-testid="panel-log" className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
        {log.length === 0 && <p className="text-neutral-700 italic">waiting for an instruction…</p>}
        {log.map((line, i) => {
          if (line.kind === 'refused' || line.kind === 'notgranted' || line.kind === 'error') {
            const treatment =
              line.kind === 'refused'
                ? 'border-red-500 bg-red-950/40 text-red-200'
                : line.kind === 'notgranted'
                  ? 'border-orange-500 bg-orange-950/30 text-orange-200'
                  : 'border-amber-500 bg-amber-950/30 text-amber-200';
            return (
              <div key={i} className={`w-full px-2 py-1.5 rounded border-l-4 ${treatment}`}>
                {line.text}
              </div>
            );
          }
          if (line.kind === 'goal') {
            return <div key={i} className={`${accent.text} opacity-90`}>{line.text}</div>;
          }
          return <div key={i} className="text-neutral-400">{line.text}</div>;
        })}
        {busy && <div className="text-neutral-600 italic">thinking…</div>}
      </div>

      <form
        className="flex gap-2 p-2 border-t border-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (!manualGoal.trim()) return;
          void runGoal(manualGoal.trim());
          setManualGoal('');
        }}
      >
        <input
          value={manualGoal}
          onChange={(e) => setManualGoal(e.target.value)}
          placeholder="(standalone testing only — the demo drives this panel from the double prompt)"
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 placeholder:text-neutral-700"
        />
        <button type="submit" disabled={busy} className="border border-neutral-600 rounded px-2 py-1 disabled:opacity-40">
          run
        </button>
      </form>
    </div>
  );
}
