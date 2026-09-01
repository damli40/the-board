// Storyboard component 4: the ledger tape ("Record of steps"), plus the
// tool-hand strip that used to sit inside it.
//
// Task 3 (finish plan, Ruling 4): this file used to ALSO render the phase
// ribbon (`PhaseRibbon`, `data-testid="phase-ribbon"`/`phase-${p}`) — a
// second, independent rendering of the same phase state App.tsx's header
// drew a simpler version of, sharing no constant with it. That ribbon is
// gone; `ui/PhaseRail.tsx` is the one place the phase list renders now, in
// the masthead area.
//
// Task 4 (finish plan, brief 4c) restyled `LedgerTape` into the design's
// "Record of steps" column (the-board.dc.html, lines 461-480): a compact
// time / line / outcome row instead of the old full-width red block for a
// refusal. `ledger-row-refusal` / `ledger-row-success` and the
// `ledger-row-enter` animation are kept exactly — nothing tested or
// load-bearing about the old markup's shape, only its testids and the
// distinction it draws, survives untouched. The refusal's own thrown message
// (`e.detail`) is kept too, on its own line under the compact row: the
// design's row has no room for it, but CLAUDE.md sec. 4 is explicit that "a
// refusal IS the product" here, and dropping the message to fit the column
// would be losing the one sentence that row exists to show.
//
// Fix round 1, I5: `ToolHandStrip` used to render INSIDE this file's
// `docket` section, above the ledger tape — so the first thing under
// "Record of steps / every call any agent made, in order, with what came
// back" was four cards of what each agent currently HOLDS, not calls, not
// in order, and a duplicate of the manifest grid three sections up.
// `ToolHandStrip` is now exported on its own; `App.tsx` renders it directly
// beneath the manifest grid, where it belongs. `Docket` itself is now the
// ledger tape alone, and `docket`/`ledger-tape`/`ledger-row-*` keep their
// testids exactly.
//
// `LedgerEntry` (webmcp/ledger.ts) used to carry only `ok: boolean`, not a
// three-way refused/not-granted/broke split — Task 5's PANEL states drew
// that finer distinction from what the tool call itself returns, which this
// page never saw.
//
// Finish task: `LedgerEntry` now also carries `failure: 'refusal' | 'crash'`
// on every `!ok` entry (`webmcp/ledger.ts`'s `wrap`, decided once from
// `instanceof Refusal`). Reader-behaviour change, named explicitly per this
// task's own brief: before this, EVERY `!ok` row here rendered the word
// "REFUSED" — a crash during a filmed run would print the same word this
// project's whole pitch rests on, for an event that never happened. That is
// the identical defect `ui/AgentCard.tsx`'s `deriveAgentState` was fixed
// for; leaving this second reader unfixed would still let it happen, just
// one row lower on the same page. `outcomeOf` below draws the three-way
// split now; `VerdictPanel` (via `computeSplit`/`Ledger.countsFor`) never
// reads `.ok` or `.failure` at all, so it needed no change.
import type { Phase, Side } from '../model/types';
import { ORIGIN, type Actor } from '../model/types';
import type { Manifest } from '../webmcp/registry';
import type { LedgerEntry } from '../webmcp/ledger';
import { ACTORS, ACTOR_ACCENT, ACTOR_LABEL } from './theme';
import { AppealSocket, Hand } from './Hand';

const ORIGIN_ACTOR: Record<string, Actor> = Object.fromEntries(
  ACTORS.map((a) => [ORIGIN[a], a])
) as Record<string, Actor>;

export interface ToolHandStripProps {
  phase: Phase;
  manifests: Record<Actor, Manifest>;
  appeal: { held: (side: Side) => boolean; spent: (side: Side) => boolean };
}

/**
 * One `<Hand>` per actor, with an `<AppealSocket>` for A/B during VERDICT.
 * The design does not draw this at all — CLAUDE.md's non-negotiable list
 * keeps `hand-${actor}`, `chip-${actor}-${tool}` and both
 * `appeal-socket-*` testids alive anyway, "though untested" — so it stays,
 * unchanged in behaviour, now placed directly beneath the manifest grid
 * (`App.tsx`) rather than inside "Record of steps" (fix round 1, I5).
 */
export function ToolHandStrip({ phase, manifests, appeal }: ToolHandStripProps) {
  return (
    <div className="tb-cols4" style={{ display: 'grid', gap: 12, padding: '0 clamp(16px,2.6vw,40px) 26px' }}>
      {ACTORS.map((actor) => (
        <div
          key={actor}
          className={`${ACTOR_ACCENT[actor].border} ${ACTOR_ACCENT[actor].bg}`}
          // Fix round 1, I3: the `border` SHORTHAND resets the omitted
          // border-color longhand to `currentcolor`, and an inline style
          // always outranks a class — so combining it with the Tailwind
          // border-COLOR class above used to collapse all four agents'
          // accent borders to one identical colour. `borderWidth`/
          // `borderStyle` alone never touch border-color, so the class
          // supplies it, same bug class as Task 3's dead focus rings.
          style={{ padding: 8, borderWidth: 1, borderStyle: 'solid', borderRadius: 4 }}
        >
          <Hand manifest={manifests[actor]} />
          {(actor === 'A' || actor === 'B') && phase === 'VERDICT' && (
            <div style={{ marginTop: 6 }}>
              <AppealSocket held={appeal.held(actor as Side)} spent={appeal.spent(actor as Side)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface DocketProps {
  entries: LedgerEntry[];
}

export function Docket({ entries }: DocketProps) {
  return (
    <section data-testid="docket">
      <LedgerTape entries={entries} />
    </section>
  );
}

/**
 * `HH:MM:SS` plus the literal `Z` — the ISO 8601 "Zulu time" suffix, the
 * standard way to label a time string as UTC without spending column width
 * on the word itself. `toISOString()` already ends in `Z`; slicing the
 * `HH:MM:SS` window drops it, so it is appended back explicitly here rather
 * than left implicit (fix round 1, Minor — nothing previously said this was
 * UTC, and a viewer would read it as local time and be wrong by their own
 * offset).
 */
export function shortTime(atMs: number): string {
  return `${new Date(atMs).toISOString().slice(11, 19)}Z`;
}

/**
 * Storyboard component 4: "Successes are quiet monospace rows. Refusals are
 * the loud ones... Inverting the usual visual hierarchy is the point: here
 * the refusal is the product, not the error state." Ported to the design's
 * compact time / line / outcome row (lines 466-479): the refusal keeps its
 * distinct weight through the `--tb-never` outcome colour and the thrown
 * message kept on its own line, not through a full-width red block anymore.
 */
/**
 * The three-way split this row actually needs, from the entry's own
 * `ok`/`failure` fields — never re-derived from `detail` text. A `!ok` entry
 * with no `failure` (should not occur from the real ledger; kept only as a
 * defensive fallback for any other caller of `LedgerTape`) reads as `broke`,
 * the same under-claim-toward-crash default `AgentCard.tsx`'s
 * `deriveAgentState` uses, for the same reason.
 */
function outcomeOf(e: LedgerEntry): { testid: 'ledger-row-success' | 'ledger-row-refusal' | 'ledger-row-broke'; word: string; flagged: boolean } {
  if (e.ok) return { testid: 'ledger-row-success', word: 'ok', flagged: false };
  if (e.failure === 'refusal') return { testid: 'ledger-row-refusal', word: 'REFUSED', flagged: true };
  return { testid: 'ledger-row-broke', word: 'BROKE', flagged: true };
}

function LedgerTape({ entries }: { entries: LedgerEntry[] }) {
  // Reversed for DISPLAY (newest first — "a tape you read from the head"),
  // but keyed by each entry's position in the ORIGINAL, append-only array.
  // Fix round 1: the previous version keyed by position in the REVERSED
  // array, which shifts for every existing row on every new append (row 0
  // today is row 1 tomorrow) — that starves the enter animation below (React
  // sees every row as "changed", not just the new one) and is the wrong kind
  // of identity for a list that only ever grows at the tail.
  const rows = entries.map((e, i) => ({ e, i })).reverse();
  return (
    <div data-testid="ledger-tape" style={{ display: 'flex', flexDirection: 'column', maxHeight: 288, overflowY: 'auto' }}>
      {rows.length === 0 && (
        <p style={{ margin: 0, padding: '12px 0', fontSize: 12, fontStyle: 'italic', color: 'var(--tb-ink-3)' }}>
          the ledger is empty — nothing has been called yet
        </p>
      )}
      {rows.map(({ e, i }) => {
        const actor = ORIGIN_ACTOR[e.origin];
        const label = actor ? ACTOR_LABEL[actor] : e.origin;
        const line = `${label} · ${e.tool}`;
        const { testid, word, flagged } = outcomeOf(e);

        return (
          <div
            key={i}
            data-testid={testid}
            className="ledger-row-enter"
            style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 0', borderTop: '1px solid var(--tb-rule-3)' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr auto', gap: 10, alignItems: 'baseline' }}>
              <span title="time in UTC" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tb-ink-3)' }}>{shortTime(e.at)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, overflowWrap: 'break-word', minWidth: 0, color: 'var(--tb-ink)' }}>{line}</span>
              <span
                style={{
                  fontSize: 11.5,
                  whiteSpace: 'nowrap',
                  color: flagged ? 'var(--tb-never)' : 'var(--tb-ink-2)',
                  fontWeight: flagged ? 700 : 400,
                }}
              >
                {word}
              </span>
            </div>
            {flagged && e.detail && (
              <div style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--tb-ink-2)', paddingLeft: 64, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                {e.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
