// "ConfirmBar holds [confirm] and [return with note] wired directly to
// CaseOutcome, with no tool binding and no import of CaseOutcome from
// anywhere under src/tools/." CaseOutcome lives in src/model/outcome.ts, not
// under src/tools/ — importing it from there is the required wiring, not a
// violation of the constraint (the constraint guards against a hypothetical
// tool-wrapped version; see outcome.ts's own header: "Deliberately not
// importable from any tool body — the only callers are the two buttons in
// ConfirmBar.tsx"). Nothing here calls executeTool or registerTool.
import { useState } from 'react';
import { CaseOutcome } from '../model/outcome';

interface ConfirmBarProps {
  outcome: CaseOutcome;
  /** Bumps a counter in the parent so it re-renders after a mutation on this plain class instance. */
  onChange: () => void;
}

export function ConfirmBar({ outcome, onChange }: ConfirmBarProps) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const disabled = outcome.state === 'confirmed';

  function confirm() {
    setError(null);
    try {
      outcome.confirmByHuman(name);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function returnWithNote() {
    setError(null);
    try {
      outcome.returnWithNote(name, note);
      setNote('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section data-testid="confirm-bar" className="font-mono text-sm border border-neutral-800 rounded-md bg-neutral-950 p-3 flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-neutral-500">the machine never decides</span>
        <span
          data-testid="case-outcome-state"
          className={[
            'text-xs uppercase tracking-wider px-2 py-0.5 rounded border',
            outcome.state === 'confirmed' ? 'border-emerald-600 text-emerald-300' : 'border-neutral-700 text-neutral-400',
          ].join(' ')}
        >
          {outcome.state}
          {outcome.confirmedBy && ` — ${outcome.confirmedBy}`}
        </span>
      </header>

      <input
        data-testid="confirm-bar-name"
        placeholder="named person"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={disabled}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
      />
      <textarea
        data-testid="confirm-bar-note"
        placeholder="note (only used by return with note)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={disabled}
        rows={2}
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
      />

      <div className="flex gap-2">
        <button
          data-testid="confirm-bar-confirm"
          onClick={confirm}
          disabled={disabled}
          className="flex-1 border border-emerald-600 text-emerald-300 rounded px-3 py-1.5 hover:bg-emerald-950/40 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          [ confirm ]
        </button>
        <button
          data-testid="confirm-bar-return"
          onClick={returnWithNote}
          disabled={disabled}
          className="flex-1 border border-neutral-600 text-neutral-300 rounded px-3 py-1.5 hover:bg-neutral-900 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          [ return with note ]
        </button>
      </div>

      {error && <p data-testid="confirm-bar-error" className="text-red-300 text-xs">{error}</p>}

      {outcome.notes.length > 0 && (
        <ul data-testid="confirm-bar-notes" className="text-xs text-neutral-500 flex flex-col gap-0.5">
          {outcome.notes.map((n, i) => (
            <li key={i}>{n.by}: {n.note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
