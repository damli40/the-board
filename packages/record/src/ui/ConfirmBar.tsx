// "ConfirmBar holds [confirm] and [return with note] wired directly to
// CaseOutcome, with no tool binding and no import of CaseOutcome from
// anywhere under src/tools/." CaseOutcome lives in src/model/outcome.ts, not
// under src/tools/ — importing it from there is the required wiring, not a
// violation of the constraint (the constraint guards against a hypothetical
// tool-wrapped version; see outcome.ts's own header: "Deliberately not
// importable from any tool body — the only callers are the two buttons in
// ConfirmBar.tsx"). Nothing here calls executeTool or registerTool.
//
// Task 4 (finish plan, brief 4b) ports the design's confirm block
// (the-board.dc.html, lines 344-370): heading and paragraph verbatim from
// copy-final.md, and a right-hand "Registry check for confirm" column.
//
// Fix round 1, Minor: this used to carry `borderBottom: '2px solid
// var(--tb-rule)'` on its outer wrapper, but it is the last thing on the
// page — a full-width rule under nothing. Dropped.
//
// That column is a LIVE check, not a decorative claim: `manifests` is the
// same `Record<Actor, Manifest>` App.tsx already projects from
// `ToolRegistry.manifest(actor)` every render, and each row here reads
// straight off it — `manifests[actor].granted.some(g => g.tool === 'confirm')`
// — rather than printing the string "not registered" four times as a
// literal. `confirm` is in `NEVER_GRANTED` (webmcp/tools.ts) and is never
// registered for any actor, so this will always resolve to `false` today —
// but it resolves to `false` BECAUSE the registry says so, and if that ever
// changed the row would say "registered", which is exactly the point: a
// hardcoded string cannot go wrong in a way that shows up on screen, and
// that silence is worse than an honest check that happens to always pass.
import { useState } from 'react';
import type { Actor } from '../model/types';
import type { Manifest as ManifestData } from '../webmcp/registry';
import { CaseOutcome } from '../model/outcome';
import { ACTORS } from './theme';

interface ConfirmBarProps {
  outcome: CaseOutcome;
  /** The same live registry projection App.tsx already builds for the manifests grid. */
  manifests: Record<Actor, ManifestData>;
  /** Bumps a counter in the parent so it re-renders after a mutation on this plain class instance. */
  onChange: () => void;
}

export function ConfirmBar({ outcome, manifests, onChange }: ConfirmBarProps) {
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
    <div style={{ padding: '26px clamp(16px,2.6vw,40px) 30px', background: 'var(--tb-ground-2)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px 48px', alignItems: 'flex-start' }}>
        <section data-testid="confirm-bar" style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading, Archivo), sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
            The one control no agent can reach
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, maxWidth: '60ch' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5 }}>confirm</span> is not in the registry for any
            agent, in any phase. It is not withheld and it is not refused. It was never written down as something an
            agent could call. A person presses it.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              data-testid="case-outcome-state"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                padding: '2px 8px',
                border: `1px solid ${outcome.state === 'confirmed' ? 'var(--tb-amber)' : 'var(--tb-rule-2)'}`,
                color: outcome.state === 'confirmed' ? 'var(--tb-amber)' : 'var(--tb-ink-2)',
              }}
            >
              {outcome.state}
              {outcome.confirmedBy && ` — ${outcome.confirmedBy}`}
            </span>
          </div>

          <label htmlFor="confirm-bar-name-input" style={{ fontSize: 12, color: 'var(--tb-ink-2)' }}>
            named person
            <input
              id="confirm-bar-name-input"
              data-testid="confirm-bar-name"
              placeholder="named person"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled}
              className="tb-focus-amber"
              style={{
                display: 'block',
                marginTop: 4,
                width: '100%',
                boxSizing: 'border-box',
                border: '2px solid var(--tb-rule)',
                background: 'var(--tb-field)',
                color: 'var(--tb-ink)',
                padding: '9px 11px',
                fontFamily: 'var(--font-body, Archivo), sans-serif',
                fontSize: 13,
                opacity: disabled ? 0.5 : 1,
              }}
            />
          </label>
          <label htmlFor="confirm-bar-note-input" style={{ fontSize: 12, color: 'var(--tb-ink-2)' }}>
            note (only used by return with note)
            <textarea
              id="confirm-bar-note-input"
              data-testid="confirm-bar-note"
              placeholder="note (only used by return with note)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={disabled}
              rows={2}
              className="tb-focus-amber"
              style={{
                display: 'block',
                marginTop: 4,
                width: '100%',
                boxSizing: 'border-box',
                border: '2px solid var(--tb-rule)',
                background: 'var(--tb-field)',
                color: 'var(--tb-ink)',
                padding: '9px 11px',
                fontFamily: 'var(--font-body, Archivo), sans-serif',
                fontSize: 13,
                opacity: disabled ? 0.5 : 1,
              }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 4 }}>
            <button
              type="button"
              data-testid="confirm-bar-confirm"
              onClick={confirm}
              aria-disabled={disabled}
              disabled={disabled}
              className="tb-focus-amber"
              style={{
                all: 'unset',
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                background: disabled ? 'var(--tb-ground-3)' : 'var(--tb-amber)',
                color: disabled ? 'var(--tb-ink-3)' : 'var(--tb-amber-ink)',
                border: '2px solid var(--tb-rule)',
                padding: '13px 22px',
                fontSize: 15,
                fontWeight: 700,
                textAlign: 'left',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              [ confirm ]
            </button>
            <button
              type="button"
              data-testid="confirm-bar-return"
              onClick={returnWithNote}
              disabled={disabled}
              className="tb-focus-amber"
              style={{
                all: 'unset',
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxSizing: 'border-box',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                background: 'transparent',
                color: disabled ? 'var(--tb-ink-3)' : 'var(--tb-ink)',
                border: '2px solid var(--tb-rule-2)',
                padding: '11px 20px',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'left',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              [ return with note ]
            </button>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--tb-ink-2)', maxWidth: '34ch' }}>
              No tool signs this. A named person does, right here.
            </span>
          </div>

          {error && (
            <p data-testid="confirm-bar-error" style={{ margin: 0, fontSize: 12, color: 'var(--tb-red)' }}>
              {error}
            </p>
          )}

          {outcome.notes.length > 0 && (
            <ul data-testid="confirm-bar-notes" style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--tb-ink-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {outcome.notes.map((n, i) => (
                <li key={i}>{n.by}: {n.note}</li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ flex: '1 1 300px', minWidth: 0, borderLeft: '2px solid var(--tb-rule)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tb-ink-2)' }}>
            Registry check for confirm
          </h3>
          {ACTORS.map((actor) => {
            const registered = manifests[actor].granted.some((g) => g.tool === 'confirm');
            return (
              <div
                key={actor}
                data-testid={`confirm-registry-check-${actor}`}
                style={{ display: 'grid', gridTemplateColumns: '13px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--tb-rule-3)' }}
              >
                <svg width="11" height="11" viewBox="0 0 22 22" style={{ color: 'var(--tb-ink-3)' }} aria-hidden="true">
                  <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{manifests[actor].origin}</span>
                <span style={{ fontSize: 12, color: 'var(--tb-ink-2)', whiteSpace: 'nowrap' }}>
                  {registered ? 'registered' : 'not registered'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
