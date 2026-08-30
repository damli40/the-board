// Storyboard components 5 and 6, plus the split table from the 1:59 beat.
// Both drafts render side by side; the split is computed once, from the
// ledger and the read receipts, and rendered as data — never narrated.
import type { Assessment, Exhibit, Fact, Seat, Verdict } from '../model/types';
import type { Ledger } from '../webmcp/ledger';
import { computeSplit } from '../model/verdict';
import { resolveCitation } from './citation';
import { ACTOR_ACCENT, ACTOR_LABEL } from './theme';

interface VerdictPanelProps {
  seat1?: Verdict;
  seat2?: Verdict;
  facts: Fact[];
  exhibits: Exhibit[];
  assessments: Assessment[];
  ledger: Ledger;
  /**
   * The tools each seat currently holds, projected from the registry (see
   * `grantedTools` in App.tsx). Used only to decide which rows the call-count
   * column has to draw. See `callRows` below for why it needs them.
   */
  grantedTools?: Record<Seat, string[]>;
}

/**
 * Final review, Should-fix 4. `Ledger.countsFor` only holds keys for tools
 * that were actually called, so a tool a seat never touched was OMITTED from
 * this column rather than shown as `0`. The submission quotes this exact
 * table as the place the project renders an absence, "Seat 1 called
 * `extract_text` zero times", and it was rendering a silence instead: the
 * viewer had to notice a missing row and know it should have been there.
 *
 * Unioning the counts over the tools that seat currently HOLDS makes the zero
 * real, and it is this project's own thesis pointed at its own UI: the
 * denominator is the grant, so an uncalled capability is drawn, not dropped.
 * `Manifest.tsx` has always done this for the NOT GRANTED column; this is the
 * same move, one table over.
 *
 * The union also keeps every tool that WAS called even after its lifetime has
 * closed and the grant is gone, so the history never disappears from the
 * table. With no grant list supplied, this degrades to exactly the old
 * behaviour: the tools actually called, and nothing else.
 */
function callRows(counts: Record<string, number>, granted: string[] | undefined): [string, number][] {
  const names = new Set([...Object.keys(counts), ...(granted ?? [])]);
  return [...names].sort().map((tool) => [tool, counts[tool] ?? 0]);
}

export function VerdictPanel({ seat1, seat2, facts, exhibits, assessments, ledger, grantedTools }: VerdictPanelProps) {
  const split = seat1 && seat2 ? computeSplit(seat1, seat2, ledger) : undefined;

  return (
    <section data-testid="verdict-panel" className="font-mono text-sm flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {seat1 ? <VerdictDraft verdict={seat1} facts={facts} exhibits={exhibits} assessments={assessments} /> : <EmptyDraft seat="seat1" />}
        {seat2 ? <VerdictDraft verdict={seat2} facts={facts} exhibits={exhibits} assessments={assessments} /> : <EmptyDraft seat="seat2" />}
      </div>

      {split && (
        <div data-testid="split-table" className={`border rounded-md p-3 ${split.split ? 'border-red-700 bg-red-950/20' : 'border-neutral-800 bg-neutral-950'}`}>
          <header className="flex items-center justify-between text-xs uppercase tracking-wider mb-2">
            <span className={split.split ? 'text-red-300 font-semibold' : 'text-neutral-400'}>
              {split.split ? 'THE SEATS DISAGREE' : 'the seats agree'}
            </span>
            {split.differingInput.length > 0 && (
              <span className="text-neutral-400 lowercase tracking-normal">differing input: {split.differingInput.join(', ')}</span>
            )}
          </header>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-500 text-left">
                <th className="font-normal pr-4">seat</th>
                <th className="font-normal pr-4">outcome</th>
                <th className="font-normal">calls (tool: count)</th>
              </tr>
            </thead>
            <tbody>
              {(['seat1', 'seat2'] as const).map((seat) => {
                const v = seat === 'seat1' ? seat1 : seat2;
                const rows = callRows(split.callCounts[seat], grantedTools?.[seat]);
                return (
                  <tr key={seat} className="align-top">
                    <td className={`pr-4 py-0.5 ${ACTOR_ACCENT[seat].text}`}>{ACTOR_LABEL[seat]}</td>
                    <td className="pr-4 py-0.5 text-neutral-200">{v?.outcome ?? '—'}</td>
                    <td data-testid={`calls-${seat}`} className="py-0.5 text-neutral-500">
                      {rows.length === 0 ? 'none' : rows.map(([t, n]) => `${t} ${n}`).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyDraft({ seat }: { seat: 'seat1' | 'seat2' }) {
  return (
    <div className={`border ${ACTOR_ACCENT[seat].border} rounded-md p-3 text-neutral-600 italic text-xs`}>
      {ACTOR_LABEL[seat]} has not drafted a verdict yet.
    </div>
  );
}

function VerdictDraft({ verdict, facts, exhibits, assessments }: { verdict: Verdict; facts: Fact[]; exhibits: Exhibit[]; assessments: Assessment[] }) {
  const accent = ACTOR_ACCENT[verdict.seat];
  return (
    <div data-testid={`verdict-${verdict.seat}`} className={`border ${accent.border} rounded-md bg-neutral-950 overflow-hidden`}>
      <header className={`flex items-center justify-between px-3 py-2 ${accent.bg} border-b ${accent.border}`}>
        <span className={`uppercase tracking-widest text-xs font-semibold ${accent.text}`}>{ACTOR_LABEL[verdict.seat]}</span>
        <span
          data-testid={`outcome-${verdict.seat}`}
          className={`text-sm font-bold tracking-wide ${verdict.outcome === 'UPHELD' ? 'text-neutral-100' : 'text-orange-300'}`}
        >
          → {verdict.outcome}
        </span>
      </header>

      <div className="p-3 flex flex-col gap-3">
        <p className="text-neutral-300 text-xs leading-relaxed">{verdict.reasoning}</p>

        <Basis verdict={verdict} facts={facts} />

        <CitationTrace verdict={verdict} facts={facts} exhibits={exhibits} assessments={assessments} />

        <NeverOpened verdict={verdict} exhibits={exhibits} />
      </div>
    </div>
  );
}

/**
 * Storyboard component 5: "when a verdict names no filed rule, the page
 * draws that absence at the same weight as the outcome itself — full width,
 * in the space the reason would occupy, not a footnote or a warning icon...
 * Do not soften it into a warning banner. A hole is showable; a warning is
 * dismissable." This is why NO RULE CITED below is a full-width block with
 * the SAME border/background treatment as a cited basis would use — never a
 * ⚠ icon, never `role="alert"`, never a colour reserved for warnings.
 */
function Basis({ verdict, facts }: { verdict: Verdict; facts: Fact[] }) {
  const basis = verdict.basis;
  if (basis.cited) {
    const fact = facts.find((f) => f.id === basis.factId);
    return (
      <div data-testid={`basis-${verdict.seat}`} className="border border-neutral-700 rounded">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500 px-2 pt-1">basis</div>
        <div className="px-2 pb-2 text-neutral-200 text-sm">
          {basis.factId} → {basis.exhibitId}
          {fact && <span className="text-neutral-500"> — “{fact.text}”</span>}
        </div>
      </div>
    );
  }
  return (
    <div data-testid={`basis-${verdict.seat}`} className="border border-neutral-700 rounded">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500 px-2 pt-1">basis</div>
      <div
        data-testid={`no-rule-cited-${verdict.seat}`}
        className="mx-2 mb-2 py-3 text-center border border-dashed border-neutral-600 rounded text-neutral-200 tracking-[0.2em] text-sm font-semibold"
      >
        NO RULE CITED
      </div>
    </div>
  );
}

/**
 * Storyboard component 6: each cited fact draws a line to its exhibit, opens
 * it at the locator, and highlights the exact matched substring — resolved
 * via the assessment this seat actually recorded for that fact, since that
 * is where the quote and locator live.
 */
function CitationTrace({ verdict, facts, exhibits, assessments }: { verdict: Verdict; facts: Fact[]; exhibits: Exhibit[]; assessments: Assessment[] }) {
  if (verdict.cited.length === 0) {
    return <p className="text-neutral-600 italic text-xs">cited nothing</p>;
  }
  return (
    <div data-testid={`citations-${verdict.seat}`} className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">citation trace</div>
      {verdict.cited.map((factId) => {
        const fact = facts.find((f) => f.id === factId);
        const assessment = assessments.find((a) => a.seat === verdict.seat && a.factId === factId);
        if (!fact || !assessment) {
          return (
            <div key={factId} className="text-xs text-neutral-500">
              {factId} — no assessment on record
            </div>
          );
        }
        const exhibit = exhibits.find((e) => e.id === assessment.exhibitId);
        const trace = exhibit ? resolveCitation(exhibit, assessment.locator, assessment.quote) : undefined;
        const locatorLabel = assessment.locator.page !== undefined
          ? `p.${assessment.locator.page}`
          : assessment.locator.lines
            ? `L${assessment.locator.lines[0]}–${assessment.locator.lines[1]}`
            : 'whole document';

        return (
          <div key={factId} data-testid={`citation-${verdict.seat}-${factId}`} className="text-xs border-l-2 border-neutral-700 pl-2">
            <div className="text-neutral-300">
              {factId} ⟶ <span className="text-neutral-200">{assessment.exhibitId}</span>{' '}
              <span className="text-neutral-500">({locatorLabel})</span>
            </div>
            {assessment.verified === 'human-check' || !trace?.match ? (
              <div className="mt-0.5 inline-block px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px] uppercase tracking-wider">
                human check
              </div>
            ) : (
              <div className="mt-0.5 text-neutral-500 truncate">
                “{trace.scoped.slice(0, trace.match.start)}
                <mark className="bg-emerald-500/30 text-emerald-100 rounded-sm px-0.5">
                  {trace.scoped.slice(trace.match.start, trace.match.end)}
                </mark>
                {trace.scoped.slice(trace.match.end)}”
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The absence half of the citation trace: what this seat never opened at all. */
function NeverOpened({ verdict, exhibits }: { verdict: Verdict; exhibits: Exhibit[] }) {
  if (verdict.neverOpened.length === 0) return null;
  return (
    <div data-testid={`never-opened-${verdict.seat}`} className="text-xs">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">never opened</div>
      <div className="flex flex-wrap gap-1">
        {verdict.neverOpened.map((id) => {
          const exhibit = exhibits.find((e) => e.id === id);
          return (
            <span key={id} className="px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-500">
              {id}{exhibit ? ` · ${exhibit.name}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
