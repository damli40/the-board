// The signature image (storyboard component 1), rendered to the Claude Design
// pass ("The Board.dc.html").
//
// ONE list per actor, not two columns. Every tool in the registry appears
// once, marked either handed over (filled) or not handed over (hollow). Both
// marks come from ONE registry call (`ToolRegistry.manifest(actor)`), so the
// two halves still cannot disagree — the withheld half remains a projection
// of the same registry and is never a hard-coded list.
//
// WHY THE MERGE IS AN IMPROVEMENT, not just a restyle. The two-column layout
// had a measured budget problem: the GRANTED table needed 180px inside a
// 157px column, roughly 15% over at 1470px, and every pixel-level fix traded
// one artefact for another until the type came down to 12px with no headroom.
// A single full-width list gives each name the whole column, so the longest
// strings in the catalogue fit at a readable size with room to spare.
//
// Ruling 3 (controller, task 8) still applies and is why the merged list is
// sorted by name: `registry.registered()` builds `granted` from Map insertion
// order of opened lifetimes then TOOLS declaration order, NOT alphabetically,
// while Chrome's own `getTools()` guarantees alphabetical (CLAUDE.md sec. 1).
// Sorting here matches that expectation and stops the signature image
// reshuffling between takes.
//
// Colour is never the only signal. Handed over and not handed over differ by
// SHAPE (filled disc vs hollow ring) before they differ by anything else, and
// the withheld rows carry screen-reader text. A viewer who cannot separate
// the two colours still reads the manifest correctly.
import type { Manifest as ManifestData } from '../webmcp/registry';
import { ACTOR_ACCENT, ACTOR_LABEL } from './theme';

type Row = {
  tool: string;
  granted: boolean;
  used: number;
  lends: boolean;
};

/**
 * One row per tool in the registry, granted and withheld interleaved, sorted
 * by name.
 *
 * Sorting the MERGED list keeps each group internally alphabetical too, which
 * is what the manifest tests assert and what the camera needs.
 */
function rows(manifest: ManifestData): Row[] {
  const merged: Row[] = [
    ...manifest.granted.map((g) => ({ tool: g.tool, granted: true, used: g.used, lends: g.lends })),
    ...manifest.notGranted.map((t) => ({ tool: t, granted: false, used: 0, lends: false })),
  ];
  return merged.sort((a, b) => a.tool.localeCompare(b.tool));
}

function Mark({ granted }: { granted: boolean }) {
  return granted ? (
    <svg width="11" height="11" viewBox="0 0 22 22" className="block" aria-hidden>
      <circle cx="11" cy="11" r="10" fill="currentColor" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 22 22" className="block" aria-hidden>
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Manifest({ manifest }: { manifest: ManifestData }) {
  const accent = ACTOR_ACCENT[manifest.actor];
  const list = rows(manifest);
  const heldCount = manifest.granted.length;

  return (
    <section
      data-testid={`manifest-${manifest.actor}`}
      className="flex flex-col h-full"
      style={{
        background: 'var(--color-bg)',
        borderRight: '2px solid var(--color-divider)',
        borderBottom: '2px solid var(--color-divider)',
        padding: 'var(--space-4) var(--space-4) var(--space-2)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2.5 h-2.5 flex-none ${accent.bg}`} aria-hidden />
        <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {ACTOR_LABEL[manifest.actor]}
        </span>
      </div>
      <div
        className="mb-3 break-all"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-neutral-600)' }}
      >
        {manifest.origin}
      </div>

      {/*
        Deliberate emptiness must not read as accidental emptiness. A seat
        during FILING holds nothing BY DESIGN, and saying so is the difference
        between "the product is working" and "the page is broken".
      */}
      {heldCount === 0 && (
        <div
          className="mb-3"
          style={{
            background: 'var(--color-surface)',
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--color-text)',
          }}
        >
          Nothing has been handed to this agent yet. That is the design, not a fault.
        </div>
      )}

      <div className="flex flex-col">
        {list.map((r) => (
          <div
            key={r.tool}
            data-testid={r.granted ? `row-${r.tool}` : `notgranted-${r.tool}`}
            className="grid items-start"
            style={{
              gridTemplateColumns: '13px 1fr auto',
              gap: 9,
              padding: '6px 0',
              borderBottom: '1px solid var(--color-neutral-300)',
            }}
          >
            <div
              style={{
                paddingTop: 3,
                color: r.granted ? 'var(--color-text)' : 'var(--color-neutral-400)',
              }}
            >
              <Mark granted={r.granted} />
            </div>

            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  overflowWrap: 'break-word',
                  color: r.granted ? 'var(--color-text)' : 'var(--color-neutral-600)',
                }}
              >
                {r.tool}
              </span>
              {r.lends && (
                <span
                  className="self-start"
                  style={{
                    fontSize: 10.5,
                    lineHeight: 1.3,
                    padding: '1px 5px',
                    border: '1px solid var(--color-neutral-400)',
                    color: 'var(--color-neutral-700)',
                  }}
                >
                  page lends
                </span>
              )}
              {/*
                The strikethrough and the hollow ring carry nothing to a screen
                reader. These words are the only thing that does, and they are
                why the row is still legible with no colour and no shape.
              */}
              {!r.granted && <span className="sr-only"> NOT GRANTED</span>}
            </div>

            {r.granted && (
              <span
                data-testid={`used-${r.tool}`}
                className="tabular-nums"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-neutral-600)' }}
              >
                {r.used}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
