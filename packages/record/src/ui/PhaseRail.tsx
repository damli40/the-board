// The record's one phase indicator.
//
// Task 3 (finish plan, Ruling 4): this used to exist in TWO places sharing no
// constant — App.tsx's inline header row and Docket.tsx's `PhaseRibbon` — and
// could silently disagree with each other. This component is now the only
// one; `Docket.tsx` no longer renders a phase list at all (see that file's
// own header comment on what it kept).
//
// Ported from the design (docs/design/claude-design/the-board.dc.html, lines
// 112-137) with real data: `PHASES` and `NEXT_PHASE` come from the real phase
// machine (`webmcp/phases.ts`), and the label / sub-line / advance-button
// wording is copy-final.md's phase table, mapped onto those real ids by
// position — never invented, per copy-final.md's own footnote on that table.
//
// Testids are the ones `PhaseRibbon` carried, kept so nothing that reads them
// breaks: `phase-ribbon` on the per-phase-item grid, `phase-${id}` per phase
// (the same uppercase ids), and `data-active`. The advance button is
// `advance-phase` — the task brief's own first draft wrote `phase-advance`,
// which does not exist anywhere in this codebase and was a drafting error,
// corrected before this task started. `phase-rail` (fix round 1, M6) is on
// the OUTER wrapper below, one level up from `phase-ribbon`: the brief's own
// testid list named both, and only `phase-ribbon` had a home until this fix.
//
// The per-phase items below are plain `<div>`s, not the design's `<button>`:
// the design marks them up as buttons with an `onClick` template slot, but
// the only real phase transition this app has is the single "advance"
// control on the right, which walks the real `NEXT_PHASE` chain one step at
// a time — jumping straight to an arbitrary phase is not a thing the real
// phase machine supports, and inventing that here would be exactly the kind
// of unrequested feature CLAUDE.md's method warns against. A `<button>` with
// no real action is worse than no button: it is a focusable, keyboard- and
// screen-reader-reachable control that silently does nothing on activation.
// `<div aria-current="step">` is the same WAI-ARIA pattern breadcrumb/stepper
// components already use for a non-interactive "you are here" item, so this
// keeps the design's visual language (and the previous `PhaseRibbon`'s own
// non-button markup) without the dead affordance. The advance button on the
// right IS a real `<button>`, because it does something.
import { PHASES, NEXT_PHASE } from '../webmcp/phases';
import type { Phase } from '../model/types';

const PHASE_META: Record<Phase, { label: string; sub: string; advanceLabel?: string }> = {
  FILING: { label: 'Filing', sub: 'advocates put their case in', advanceLabel: 'Open review' },
  REVIEW: { label: 'Review', sub: 'seats read both cases', advanceLabel: 'Ask the seats to draft' },
  VERDICT: { label: 'Draft verdict', sub: 'seats write, nothing is in force', advanceLabel: 'Hand to a person' },
  CONFIRMED: { label: 'Confirmed', sub: 'a person signed it' },
};

interface PhaseRailProps {
  phase: Phase;
  onAdvance: () => void;
}

export function PhaseRail({ phase, onAdvance }: PhaseRailProps) {
  const activeIndex = PHASES.indexOf(phase);
  const next = NEXT_PHASE[phase];

  return (
    <div
      data-testid="phase-rail"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: '2px solid var(--tb-rule)' }}
    >
      <div
        data-testid="phase-ribbon"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', flex: '1 1 640px' }}
      >
        {PHASES.map((p, i) => {
          const meta = PHASE_META[p];
          const current = p === phase;
          const done = i < activeIndex;
          const filled = done || current;

          return (
            <div
              key={p}
              data-testid={`phase-${p}`}
              data-active={p === phase}
              aria-current={current ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                padding: '15px 20px 14px',
                borderRight: '1px solid var(--tb-rule-3)',
                background: 'none',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                {filled ? (
                  <svg width="11" height="11" viewBox="0 0 22 22" style={{ flex: 'none', color: 'var(--tb-ink)' }} aria-hidden="true">
                    <circle cx="11" cy="11" r="10" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 22 22" style={{ flex: 'none', color: 'var(--tb-ink-3)' }} aria-hidden="true">
                    <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {meta.label}
                </span>
                {current && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      background: 'var(--tb-ink)',
                      color: 'var(--tb-ground)',
                      padding: '2px 6px',
                    }}
                  >
                    now
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13, color: 'var(--tb-ink-2)' }}>{meta.sub}</span>
            </div>
          );
        })}
      </div>
      {next && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px clamp(16px,2.6vw,40px) 10px 20px' }}>
          <button
            type="button"
            data-testid="advance-phase"
            onClick={onAdvance}
            className="tb-hover-ink2 tb-focus-amber"
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--tb-ink)',
              color: 'var(--tb-ground)',
              padding: '11px 18px',
              fontFamily: 'var(--font-body, Archivo), sans-serif',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <span>{PHASE_META[phase].advanceLabel}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ flex: 'none' }} aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
