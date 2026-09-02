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
  // No `advanceLabel` here, deliberately. `NEXT_PHASE` (webmcp/phases.ts) has
  // no VERDICT entry, because the move into CONFIRMED is a person's signature
  // and never a phase button — so the advance control below does not render in
  // this phase at all, and any label written on this line is dead
  // configuration that cannot reach the screen. This line used to read
  // `advanceLabel: 'Hand to a person'`, which looked like a real control in
  // every document that quoted this table, and sent people hunting on the rail
  // for a button that cannot exist. What renders in that slot now is the sign
  // link below: it moves the page, not the phase.
  VERDICT: { label: 'Draft verdict', sub: 'seats write, nothing is in force' },
  CONFIRMED: { label: 'Confirmed', sub: 'a person signed it' },
};

interface PhaseRailProps {
  phase: Phase;
  onAdvance: () => void;
}

export function PhaseRail({ phase, onAdvance }: PhaseRailProps) {
  const activeIndex = PHASES.indexOf(phase);
  const next = NEXT_PHASE[phase];

  // The one thing that stands in the advance button's slot at VERDICT, where
  // there is no next phase to advance to. It moves the PAGE, never the case:
  // `confirm` in ConfirmBar is still the only thing that reaches CONFIRMED,
  // and it is still a person pressing it. Without this the rail simply went
  // quiet in the last phase, which read as a broken control rather than as
  // the deliberate absence of one.
  //
  // A DOM lookup rather than a callback prop, on purpose: the whole action is
  // "scroll this page, focus that input", which is a DOM operation however it
  // is routed, and threading it up through App.tsx would add a prop that can
  // only ever do this one thing. `preventScroll` because the smooth scroll is
  // already running — focusing without it snaps the page instantly and undoes
  // the animation.
  function goToSignature() {
    const input = document.getElementById('confirm-bar-name-input');
    const target = input ?? document.querySelector('[data-testid="confirm-bar"]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (input instanceof HTMLInputElement) input.focus({ preventScroll: true });
  }

  return (
    <div
      data-testid="phase-rail"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', borderBottom: '2px solid var(--tb-rule)' }}
    >
      <div
        data-testid="phase-ribbon"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          // Basis is 560px, not 640px, and that 80px is load-bearing. The rail
          // wraps, and the advance button's label changes length by phase:
          // 'Open review' measures 147px, 'Ask the seats to draft' 208px. At an
          // 843px viewport a 640px basis leaves room for the first and not the
          // second, so pressing 'Open review' in the top-right corner moved the
          // next control 654px left and 101px down onto a row of its own, under
          // a cursor that had not moved. Measured on the deployed record, 2 Sep
          // 2026. 560 + the button's 216px minimum + 42px of wrapper padding =
          // 818px, so every phase's control keeps the ribbon's row and corner.
          flex: '1 1 560px',
        }}
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
      {(next || phase === 'VERDICT') && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px clamp(16px,2.6vw,40px) 10px 20px' }}>
          {!next ? (
            <button
              type="button"
              data-testid="go-to-signature"
              onClick={goToSignature}
              className="tb-focus-amber"
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                minHeight: 44,
                // Same 216px box as the advance button it replaces, so the rail
                // does not reflow on the way into this phase.
                minWidth: 216,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 18px',
                color: 'var(--tb-ink)',
                fontFamily: 'var(--font-body, Archivo), sans-serif',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ flex: 'none' }} aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
              <span>Sign it below</span>
            </button>
          ) : (
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
              // Sized to the longest label ('Ask the seats to draft', 208px) so
              // the box is identical in every phase and the centre of the
              // control does not drift between one click and the next.
              // `space-between` pins the arrow to the right edge of that fixed
              // box instead of stranding it mid-button on the shorter labels.
              minWidth: 216,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
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
          )}
        </div>
      )}
    </div>
  );
}
