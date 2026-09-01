// Storyboard components 5 and 6, plus the split table from the 1:59 beat.
// Both drafts render side by side; the split is computed once, from the
// ledger and the read receipts, and rendered as data — never narrated.
//
// Task 4 (finish plan, brief 4c) wraps this in the design's "draft verdict"
// chrome (the-board.dc.html, lines 483-494): a bordered box with a left-hand
// "Draft verdict" heading and the copy-final.md sub-line, verbatim. The
// design's own body inside that box is two fabricated strings, `verdictText`
// and `verdictMeta` — Global Constraint 2 names "the verdict paragraph" as
// invented data to refuse outright, so the box's CONTENT stays exactly what
// it already was: the real per-seat draft cards (outcome, basis, citation
// trace, never-opened) and the real split table, re-painted onto `--tb-*`
// tokens instead of Tailwind's neutral palette. NO RULE CITED is the one
// piece of this the design does not draw at all and must not lose —
// CLAUDE.md sec. 4: it is drawn at the SAME visual weight as a cited basis,
// deliberately not as a warning — no icon, no `role="alert"`, no warning
// colour — which is why it below still shares Basis's own bordered block
// rather than switching to `--tb-red` or `--tb-never`.
//
// Fix round 1, C1: this file painted the split table and both verdict cards
// `background: 'var(--tb-panel-2)'`. `--tb-panel-2` is a dark-CHROME token —
// `#080808` in dark, `#0f0f0f` in light — near-black in BOTH palettes on
// purpose, because the design uses it exactly once, inside the always-dark
// agent panel, next to hardcoded `#f3f2f2` text. `--tb-ink` (this file's
// text colour) flips to a near-black `#201e1d` in light, so in the light
// theme these cards were ~1.1:1 contrast — invisible, `NO RULE CITED`
// included, on the page whose whole argument is that a hole is shown, not
// silenced. `--tb-ground-2` replaces it everywhere below: it flips with the
// theme the way `--tb-panel-2` deliberately does not.
//
// Fix round 1, I3: `EmptyDraft` and `VerdictDraft` combined
// `className={accent.border}` (a Tailwind border-COLOR class) with an inline
// `border: '1px solid'` — the shorthand resets the omitted border-color
// longhand to `currentcolor`, and inline always outranks a class, so both
// seats' cards collapsed to one identical border colour instead of their own
// accent. `borderWidth`/`borderStyle` alone never touch border-color, so the
// class supplies it — same bug class as Task 3's dead focus rings.
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
    <div style={{ border: '2px solid var(--tb-rule)', padding: '18px 20px', display: 'flex', flexWrap: 'wrap', gap: '20px 28px', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 1 240px', display: 'flex', flexDirection: 'column', gap: 3, maxWidth: '34ch' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Draft verdict</h3>
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--tb-ink-2)' }}>
          Assembled with draft_verdict from both seats. Not in force until a person confirms it.
        </span>
      </div>

      <section
        data-testid="verdict-panel"
        style={{ flex: '3 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {seat1 ? <VerdictDraft verdict={seat1} facts={facts} exhibits={exhibits} assessments={assessments} /> : <EmptyDraft seat="seat1" />}
          {seat2 ? <VerdictDraft verdict={seat2} facts={facts} exhibits={exhibits} assessments={assessments} /> : <EmptyDraft seat="seat2" />}
        </div>

        {split && (
          <div
            data-testid="split-table"
            style={{ border: `1px solid ${split.split ? 'var(--tb-red)' : 'var(--tb-rule-2)'}`, background: split.split ? 'rgba(236,48,19,.1)' : 'var(--tb-ground-2)', padding: 12 }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              <span style={{ color: split.split ? 'var(--tb-broke-ink)' : 'var(--tb-ink-2)', fontWeight: split.split ? 700 : 400 }}>
                {split.split ? 'THE SEATS DISAGREE' : 'the seats agree'}
              </span>
              {split.differingInput.length > 0 && (
                <span style={{ color: 'var(--tb-ink-2)', textTransform: 'none', letterSpacing: 'normal' }}>
                  differing input: {split.differingInput.join(', ')}
                </span>
              )}
            </header>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--tb-ink-3)', textAlign: 'left' }}>
                  <th style={{ fontWeight: 400, paddingRight: 16 }}>seat</th>
                  <th style={{ fontWeight: 400, paddingRight: 16 }}>outcome</th>
                  <th style={{ fontWeight: 400 }}>calls (tool: count)</th>
                </tr>
              </thead>
              <tbody>
                {(['seat1', 'seat2'] as const).map((seat) => {
                  const v = seat === 'seat1' ? seat1 : seat2;
                  const rows = callRows(split.callCounts[seat], grantedTools?.[seat]);
                  return (
                    <tr key={seat} style={{ verticalAlign: 'top' }}>
                      <td className={ACTOR_ACCENT[seat].text} style={{ paddingRight: 16, paddingTop: 2, paddingBottom: 2 }}>{ACTOR_LABEL[seat]}</td>
                      <td style={{ paddingRight: 16, paddingTop: 2, paddingBottom: 2, color: 'var(--tb-ink)' }}>{v?.outcome ?? '—'}</td>
                      <td data-testid={`calls-${seat}`} style={{ paddingTop: 2, paddingBottom: 2, color: 'var(--tb-ink-2)' }}>
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
    </div>
  );
}

function EmptyDraft({ seat }: { seat: 'seat1' | 'seat2' }) {
  return (
    <div className={ACTOR_ACCENT[seat].border} style={{ borderWidth: 1, borderStyle: 'solid', padding: 12, color: 'var(--tb-ink-3)', fontStyle: 'italic', fontSize: 11 }}>
      {ACTOR_LABEL[seat]} has not drafted a verdict yet.
    </div>
  );
}

function VerdictDraft({ verdict, facts, exhibits, assessments }: { verdict: Verdict; facts: Fact[]; exhibits: Exhibit[]; assessments: Assessment[] }) {
  const accent = ACTOR_ACCENT[verdict.seat];
  return (
    <div data-testid={`verdict-${verdict.seat}`} className={accent.border} style={{ borderWidth: 1, borderStyle: 'solid', background: 'var(--tb-ground-2)', overflow: 'hidden' }}>
      <header className={`${accent.text} ${accent.bg}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--tb-rule-3)' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 11, fontWeight: 700 }}>{ACTOR_LABEL[verdict.seat]}</span>
        <span
          data-testid={`outcome-${verdict.seat}`}
          style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.02em', color: verdict.outcome === 'UPHELD' ? 'var(--tb-ink)' : 'var(--tb-amber)' }}
        >
          → {verdict.outcome}
        </span>
      </header>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, color: 'var(--tb-ink-2)', fontSize: 11, lineHeight: 1.6 }}>{verdict.reasoning}</p>

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
      <div data-testid={`basis-${verdict.seat}`} style={{ border: '1px solid var(--tb-rule-2)' }}>
        <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tb-ink-3)', padding: '4px 8px 0' }}>basis</div>
        <div style={{ padding: '0 8px 8px', color: 'var(--tb-ink)', fontSize: 12 }}>
          {basis.factId} → {basis.exhibitId}
          {fact && <span style={{ color: 'var(--tb-ink-3)' }}> — “{fact.text}”</span>}
        </div>
      </div>
    );
  }
  return (
    <div data-testid={`basis-${verdict.seat}`} style={{ border: '1px solid var(--tb-rule-2)' }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tb-ink-3)', padding: '4px 8px 0' }}>basis</div>
      <div
        data-testid={`no-rule-cited-${verdict.seat}`}
        style={{
          margin: '0 8px 8px',
          padding: '12px 0',
          textAlign: 'center',
          border: '1px dashed var(--tb-rule-2)',
          color: 'var(--tb-ink)',
          letterSpacing: '.2em',
          fontSize: 12,
          fontWeight: 700,
        }}
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
    return <p style={{ margin: 0, color: 'var(--tb-ink-3)', fontStyle: 'italic', fontSize: 11 }}>cited nothing</p>;
  }
  return (
    <div data-testid={`citations-${verdict.seat}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tb-ink-3)' }}>citation trace</div>
      {verdict.cited.map((factId) => {
        const fact = facts.find((f) => f.id === factId);
        const assessment = assessments.find((a) => a.seat === verdict.seat && a.factId === factId);
        if (!fact || !assessment) {
          return (
            <div key={factId} style={{ fontSize: 11, color: 'var(--tb-ink-3)' }}>
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
          <div key={factId} data-testid={`citation-${verdict.seat}-${factId}`} style={{ fontSize: 11, borderLeft: '2px solid var(--tb-rule-3)', paddingLeft: 8 }}>
            <div style={{ color: 'var(--tb-ink-2)' }}>
              {factId} ⟶ <span style={{ color: 'var(--tb-ink)' }}>{assessment.exhibitId}</span>{' '}
              <span style={{ color: 'var(--tb-ink-3)' }}>({locatorLabel})</span>
            </div>
            {assessment.verified === 'human-check' || !trace?.match ? (
              <div style={{ marginTop: 2, display: 'inline-block', padding: '1px 6px', background: 'var(--tb-ground-3)', color: 'var(--tb-ink-2)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                human check
              </div>
            ) : (
              <div style={{ marginTop: 2, color: 'var(--tb-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                “{trace.scoped.slice(0, trace.match.start)}
                <mark style={{ background: 'rgba(238,163,61,.28)', color: 'var(--tb-ink)', padding: '0 2px' }}>
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
    <div data-testid={`never-opened-${verdict.seat}`} style={{ fontSize: 11 }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tb-ink-3)', marginBottom: 2 }}>never opened</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {verdict.neverOpened.map((id) => {
          const exhibit = exhibits.find((e) => e.id === id);
          return (
            <span key={id} style={{ padding: '1px 6px', border: '1px solid var(--tb-rule-3)', color: 'var(--tb-ink-3)' }}>
              {id}{exhibit ? ` · ${exhibit.name}` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
