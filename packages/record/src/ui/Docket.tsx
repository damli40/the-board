// Storyboard components 3 and 4, sharing one file because they read as one
// timeline: the phase ribbon across the top with tool chips docked beneath
// the active phase, and the ledger tape scrolling beneath that.
import type { Phase, Side } from '../model/types';
import { ORIGIN, type Actor } from '../model/types';
import type { Manifest } from '../webmcp/registry';
import type { LedgerEntry } from '../webmcp/ledger';
import { ACTORS, ACTOR_ACCENT, ACTOR_LABEL } from './theme';
import { AppealSocket, Hand } from './Hand';

const PHASES: Phase[] = ['FILING', 'REVIEW', 'VERDICT', 'CONFIRMED'];

const ORIGIN_ACTOR: Record<string, Actor> = Object.fromEntries(
  ACTORS.map((a) => [ORIGIN[a], a])
) as Record<string, Actor>;

interface DocketProps {
  phase: Phase;
  manifests: Record<Actor, Manifest>;
  appeal: { held: (side: Side) => boolean; spent: (side: Side) => boolean };
  entries: LedgerEntry[];
}

export function Docket({ phase, manifests, appeal, entries }: DocketProps) {
  return (
    <section data-testid="docket" className="bg-neutral-950 border border-neutral-800 rounded-md font-mono">
      <PhaseRibbon phase={phase} manifests={manifests} appeal={appeal} />
      <LedgerTape entries={entries} />
    </section>
  );
}

function PhaseRibbon({ phase, manifests, appeal }: Omit<DocketProps, 'entries'>) {
  const activeIndex = PHASES.indexOf(phase);
  return (
    <div className="border-b border-neutral-800">
      <div data-testid="phase-ribbon" className="flex text-xs uppercase tracking-widest">
        {PHASES.map((p, i) => (
          <div
            key={p}
            data-testid={`phase-${p}`}
            data-active={p === phase}
            className={[
              'flex-1 text-center py-2 border-r last:border-r-0 border-neutral-800',
              p === phase ? 'text-neutral-50 bg-neutral-900' : 'text-neutral-600',
              i < activeIndex ? 'text-neutral-700 line-through decoration-neutral-700' : '',
            ].join(' ')}
          >
            {p}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 p-3">
        {ACTORS.map((actor) => (
          <div key={actor} className={`p-2 rounded border ${ACTOR_ACCENT[actor].border} ${ACTOR_ACCENT[actor].bg}`}>
            <Hand manifest={manifests[actor]} />
            {(actor === 'A' || actor === 'B') && phase === 'VERDICT' && (
              <div className="mt-1.5">
                <AppealSocket held={appeal.held(actor as Side)} spent={appeal.spent(actor as Side)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Storyboard component 4: "Successes are quiet monospace rows. Refusals are
 * the loud ones — full-width, distinct treatment, with the thrown message
 * rendered verbatim... Inverting the usual visual hierarchy is the point:
 * here the refusal is the product, not the error state."
 */
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
    <div data-testid="ledger-tape" className="max-h-72 overflow-y-auto divide-y divide-neutral-900">
      {rows.length === 0 && (
        <p className="text-neutral-700 italic text-xs p-3">the ledger is empty — nothing has been called yet</p>
      )}
      {rows.map(({ e, i }) => {
        const actor = ORIGIN_ACTOR[e.origin];
        const accent = actor ? ACTOR_ACCENT[actor] : undefined;
        const label = actor ? ACTOR_LABEL[actor] : e.origin;
        const at = new Date(e.at).toISOString();

        if (!e.ok) {
          return (
            <div
              key={i}
              data-testid="ledger-row-refusal"
              // ledger-row-enter: fix round 1, "the storyboard requires a
              // visible beat when a receipt lands" — a plain CSS keyframe
              // that plays once on mount (see styles.css), so a genuinely
              // new row announces itself instead of just appearing.
              className="ledger-row-enter w-full px-3 py-2.5 bg-red-950/40 border-l-4 border-red-500 text-red-200"
            >
              <div className="flex items-baseline justify-between text-xs uppercase tracking-wider">
                <span className={accent?.text ?? 'text-red-300'}>{label}</span>
                <span className="text-red-400/70">{at}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="font-semibold">REFUSED</span> · <span className="opacity-90">{e.tool}</span>
              </div>
              <div className="text-sm mt-0.5 text-red-100/90 whitespace-pre-wrap break-words">{e.detail}</div>
            </div>
          );
        }

        return (
          <div key={i} data-testid="ledger-row-success" className="ledger-row-enter w-full px-3 py-1 text-xs text-neutral-400 flex items-center gap-2">
            <span className={accent?.text ?? 'text-neutral-500'}>{label}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-300">{e.tool}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-600">ok</span>
            <span className="ml-auto text-neutral-700 tabular-nums">{at}</span>
          </div>
        );
      })}
    </div>
  );
}
