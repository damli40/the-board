// One line in the panel's log. Task 5's actual product: five distinct
// states, ported from the design (the-board.dc.html, lines ~285-357).
//
// Fix round 1, C1/C2: `kind` is no longer re-derived here or in App.tsx from
// a string — it arrives already decided, from loop.ts's `AgentEntry`, at
// the exact point an exception was caught or a call resolved. This
// component only lays it out. See loop.ts's own header comment and
// AgentEntry's doc comment for the full reasoning.
//
// Fix round 1, M3: with structured entries, `tool` and `arg` are REAL for
// an `ok` entry (the call's own name and arguments), so the grid the design
// draws — tool name + argument line on the left, outcome on the right — is
// now built from real data instead of collapsed into one plain line. `tool`
// is also real for `refused`/`notgranted`/a per-call `broke` now (loop.ts
// knows which call it was about at the point it classifies the failure) —
// only a whole-turn `broke` (WebMCP unavailable, the model unreachable) has
// no tool to show, because it isn't about any one call.
import type { ReactNode } from 'react';
import {
  BROKE_CHIP,
  BROKE_NOTE_HAD_PRIOR_SUCCESS,
  BROKE_NOTE_NO_PRIOR_SUCCESS,
  BROKE_RETRY_ANYWAY_LABEL,
  BROKE_RETRY_LABEL,
  NOTGRANTED_CHIP,
  REFUSED_CHIP,
  REFUSED_NOTE,
  STOP_LABEL,
} from './copy';

/** Fix round 2: `info` added alongside the five product states — a notice
 *  about the TURN itself (today, only the no-key fallback line), never a
 *  tool outcome. See loop.ts's `EntryKind` doc comment for why it must
 *  never be folded into `ok`. */
export type LineKind = 'ok' | 'info' | 'run' | 'refused' | 'notgranted' | 'broke';

export interface LogLineData {
  kind: LineKind;
  /** ok: the raw result/message text. run: the goal being worked. refused/broke: the failure message. notgranted: a factual one-line restatement. */
  text: string;
  /** Real whenever the entry is about one specific call — every kind except a model's own closing message (ok, no call) and a whole-turn broke. */
  tool?: string;
  /** ok only: the call's own arguments, JSON-stringified. */
  arg?: string;
  /** broke only (fix round 1, I1): did an EARLIER entry in this same turn
   *  already succeed? Drives which of the two honest retry variants shows —
   *  retrying always restarts the whole goal from step 0, so a turn that
   *  already wrote something must say so before offering to run it again. */
  hadPriorSuccess?: boolean;
}

interface LogLineProps {
  index: number;
  line: LogLineData;
  onStop?: () => void;
  onRetry?: () => void;
  /** Fix round 1, I10: disable Retry while another turn is already running,
   *  so a click here can never start a second concurrent turn. */
  retryDisabled?: boolean;
}

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
/** The panel is always dark, in either site theme (theme.css: "the panels
 *  stay dark in light mode... they read as machinery embedded in a
 *  document"). Its own ink must therefore stay a fixed light color rather
 *  than `var(--tb-ink)`, which flips to a DARK color in light mode and
 *  would go invisible against this always-dark panel. The design makes the
 *  same choice — every panel-internal text color below is its literal
 *  #f3f2f2/rgba(243,242,242,x), never the token, and that is deliberate,
 *  not an oversight (see theme.css's own comment on --tb-panel).
 *
 *  Fix round 1, I9: this constant is exactly what BrokeLine's left border
 *  now uses instead of `var(--tb-broke-ink)` — that token flips to
 *  `#201e1d` in light mode and was the one place in this file that broke
 *  its own rule above, at about 1.05:1 contrast against this always-dark
 *  panel. */
const PANEL_INK = '#f3f2f2';

function ChipRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>;
}

function ToolName({ tool }: { tool: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'break-word', color: PANEL_INK }}>{tool}</span>;
}

function OkLine({ tool, arg, text }: { tool?: string; arg?: string; text: string }) {
  // No tool: the model's own closing message, not a call. One plain line.
  if (!tool) {
    return (
      <div style={{ padding: '5px 0', borderBottom: '1px solid rgba(243,242,242,.12)' }}>
        {/* Fix round 2, N9: a raw multi-line tool result (search hits, a
            multi-paragraph extracted page) used to collapse into one
            run-on line — normal white-space collapses \n into a space.
            pre-wrap keeps real line breaks while still wrapping long
            lines, on every text-bearing element in this file. */}
        <span style={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'break-word', whiteSpace: 'pre-wrap', color: PANEL_INK }}>{text}</span>
      </div>
    );
  }
  // A real call: the design's grid, ported with real fields (fix round 1, M3).
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
        alignItems: 'baseline',
        padding: '5px 0',
        borderBottom: '1px solid rgba(243,242,242,.12)',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ToolName tool={tool} />
        {arg && <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(243,242,242,.5)', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{arg}</span>}
      </div>
      <span style={{ fontSize: 11.5, color: 'rgba(243,242,242,.56)', overflowWrap: 'break-word', whiteSpace: 'pre-wrap', textAlign: 'right' }}>{text}</span>
    </div>
  );
}

/**
 * Fix round 2: a notice about the turn itself (today, only the no-key
 * fallback line), rendered plainly — no chip, no tool/arg/outcome grid,
 * because it is not a tool outcome and must not look like one. Italic and
 * a touch dimmer than `ok`'s own plain line is the whole visual
 * distinction: enough that a reader can tell "this is the panel talking
 * about itself" from "this is what a call returned", without inventing a
 * sixth state the brief never asked for.
 */
function InfoLine({ text }: { text: string }) {
  return (
    <div style={{ padding: '5px 0', borderBottom: '1px solid rgba(243,242,242,.12)' }}>
      <span
        style={{
          fontFamily: 'var(--font-body, Archivo), sans-serif',
          fontStyle: 'italic',
          fontSize: 12.5,
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          color: 'rgba(243,242,242,.65)',
        }}
      >
        {text}
      </span>
    </div>
  );
}

function RunLine({ text, onStop }: { text: string; onStop?: () => void }) {
  return (
    <div
      style={{
        border: '1px solid rgba(238,163,61,.5)',
        padding: '9px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tb-amber)' }}>
          Running
        </span>
        <button
          type="button"
          onClick={onStop}
          className="tb-hover-stop tb-focus-amber"
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            border: '1px solid var(--tb-amber)',
            color: 'var(--tb-amber)',
            padding: '3px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          {STOP_LABEL}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'rgba(243,242,242,.9)' }}>
        {text}
        <span style={{ animation: 'tb-caret 1s steps(1) infinite', color: 'var(--tb-amber)' }}>_</span>
      </p>
      <div
        aria-hidden="true"
        style={{
          height: 3,
          backgroundImage: 'repeating-linear-gradient(90deg,var(--tb-amber) 0 8px,transparent 8px 24px)',
          animation: 'tb-run .8s linear infinite',
        }}
      />
    </div>
  );
}

function RefusedLine({ tool, text }: { tool?: string; text: string }) {
  return (
    <div
      style={{
        borderTop: '2px solid var(--tb-amber)',
        borderBottom: '2px solid var(--tb-amber)',
        padding: '10px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <ChipRow>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            background: 'var(--tb-amber)',
            color: '#191919',
            padding: '3px 7px',
          }}
        >
          {REFUSED_CHIP}
        </span>
        {tool && <ToolName tool={tool} />}
      </ChipRow>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'rgba(243,242,242,.86)' }}>{text}</p>
      <span style={{ fontSize: 11.5, color: 'var(--tb-amber)', fontWeight: 600 }}>{REFUSED_NOTE}</span>
    </div>
  );
}

function NotGrantedLine({ tool, text }: { tool?: string; text: string }) {
  return (
    <div
      style={{
        border: '1px dashed rgba(243,242,242,.42)',
        padding: '10px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <ChipRow>
        <svg width="11" height="11" viewBox="0 0 22 22" style={{ color: 'rgba(243,242,242,.78)', flex: 'none' }} aria-hidden="true">
          <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'rgba(243,242,242,.78)' }}>
          {NOTGRANTED_CHIP}
        </span>
        {tool && <ToolName tool={tool} />}
      </ChipRow>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'rgba(243,242,242,.72)' }}>{text}</p>
    </div>
  );
}

function BrokeLine({
  tool,
  text,
  hadPriorSuccess,
  onRetry,
  retryDisabled,
}: {
  tool?: string;
  text: string;
  hadPriorSuccess: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  // Fix round 1, I1: retrying always restarts the WHOLE goal from step 0,
  // so a turn that already wrote something before breaking will repeat
  // that write if retried. Two honest variants, never one that overclaims.
  const note = hadPriorSuccess ? BROKE_NOTE_HAD_PRIOR_SUCCESS : BROKE_NOTE_NO_PRIOR_SUCCESS;
  const retryLabel = hadPriorSuccess ? BROKE_RETRY_ANYWAY_LABEL : BROKE_RETRY_LABEL;
  return (
    <div
      style={{
        background: 'rgba(243,242,242,.09)',
        // Fix round 1, I9: PANEL_INK, not var(--tb-broke-ink) — that token
        // flips dark in light mode and goes ~invisible on this always-dark
        // panel. See PANEL_INK's own comment.
        borderLeft: `4px solid ${PANEL_INK}`,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <ChipRow>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: PANEL_INK, flex: 'none' }} aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: PANEL_INK }}>{BROKE_CHIP}</span>
        {tool && <ToolName tool={tool} />}
      </ChipRow>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'rgba(243,242,242,.86)' }}>{text}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="tb-hover-retry tb-focus-amber"
          style={{
            all: 'unset',
            cursor: retryDisabled ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            background: PANEL_INK,
            color: '#191919',
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 700,
            opacity: retryDisabled ? 0.6 : 1,
          }}
        >
          {retryLabel}
        </button>
        <span style={{ fontSize: 11.5, color: 'rgba(243,242,242,.6)' }}>{note}</span>
      </div>
    </div>
  );
}

export function LogLine({ index, line, onStop, onRetry, retryDisabled }: LogLineProps) {
  return (
    <div data-testid={`panel-line-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div data-testid={`panel-state-${line.kind}`}>
        {line.kind === 'ok' && <OkLine tool={line.tool} arg={line.arg} text={line.text} />}
        {line.kind === 'info' && <InfoLine text={line.text} />}
        {line.kind === 'run' && <RunLine text={line.text} onStop={onStop} />}
        {line.kind === 'refused' && <RefusedLine tool={line.tool} text={line.text} />}
        {line.kind === 'notgranted' && <NotGrantedLine tool={line.tool} text={line.text} />}
        {line.kind === 'broke' && (
          <BrokeLine
            tool={line.tool}
            text={line.text}
            hadPriorSuccess={line.hadPriorSuccess ?? false}
            onRetry={onRetry}
            retryDisabled={retryDisabled}
          />
        )}
      </div>
    </div>
  );
}
