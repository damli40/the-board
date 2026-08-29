// "ExhibitList renders id, side, kind, truncated SHA-256, `captured`
// provenance, and any `detectImperatives` flags beside the raw text, with
// the raw text still fully readable — never scrubbed." (task-8 brief, Plus:)
//
// detectImperatives runs on the RECORD page — this component IS that page —
// and per its own file header it shows, never strips. This component never
// calls packages/panel/src/agent/sanitize.ts; that function's job is the
// opposite one, fencing text immediately before it reaches a model. Mixing
// the two here would either launder the evidence a human needs to see, or
// leave it unfenced for a model. See detect.ts's header for the full
// argument.
import { useEffect, useState, type ReactNode } from 'react';
import type { Assessment, Exhibit } from '../model/types';
import { detectImperatives } from '../injection/detect';
import { ACTOR_ACCENT } from './theme';

function shortHash(sha256: string): string {
  return `${sha256.slice(0, 12)}…`;
}

/** Renders `text` with every flagged span highlighted in place — never removed. */
function FlaggedText({ text, flags }: { text: string; flags: ReturnType<typeof detectImperatives> }) {
  if (flags.length === 0) {
    return <pre className="whitespace-pre-wrap break-words text-neutral-300">{text}</pre>;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  flags.forEach((flag, i) => {
    if (flag.index > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, flag.index)}</span>);
    nodes.push(
      <mark key={`f${i}`} className="bg-red-500/30 text-red-200 underline decoration-red-400 decoration-dashed rounded-sm px-0.5">
        {text.slice(flag.index, flag.index + flag.matched.length)}
      </mark>
    );
    cursor = flag.index + flag.matched.length;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <pre className="whitespace-pre-wrap break-words text-neutral-300">{nodes}</pre>;
}

function ExhibitImage({ id, bytesOf }: { id: string; bytesOf: BytesOf }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    Promise.resolve(bytesOf(id)).then((bytes) => {
      if (!bytes) return;
      const objectUrl = URL.createObjectURL(new Blob([bytes]));
      revoked = objectUrl;
      setUrl(objectUrl);
    });
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [id, bytesOf]);
  if (!url) return <div className="text-neutral-600 text-xs italic">loading image…</div>;
  return <img src={url} alt={`exhibit ${id}`} className="max-h-48 rounded border border-neutral-800" />;
}

type BytesOf = (id: string) => ArrayBuffer | undefined | Promise<ArrayBuffer | undefined>;

interface ExhibitListProps {
  exhibits: Exhibit[];
  assessments: Assessment[];
  /**
   * Accepts either shape so this component doesn't care whether Step 9's
   * IndexedDB swap landed: `ExhibitStore.bytesOf` is synchronous before the
   * swap, async after it. `Promise.resolve(...)` in ExhibitImage normalises
   * either into an await.
   */
  bytesOf: BytesOf;
}

export function ExhibitList({ exhibits, assessments, bytesOf }: ExhibitListProps) {
  return (
    <section data-testid="exhibit-list" className="font-mono text-sm flex flex-col gap-3">
      {exhibits.map((e) => {
        const accent = ACTOR_ACCENT[e.side];
        const flags = e.text ? detectImperatives(e.text) : [];
        const humanChecks = assessments.filter((a) => a.exhibitId === e.id && a.verified === 'human-check');

        return (
          <article key={e.id} data-testid={`exhibit-${e.id}`} className={`border ${accent.border} rounded-md bg-neutral-950 overflow-hidden`}>
            <header className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs ${accent.bg} border-b ${accent.border}`}>
              <span className="text-neutral-100 font-semibold">{e.id}</span>
              <span className={accent.text}>side {e.side}</span>
              <span className="text-neutral-400 uppercase tracking-wider">{e.kind}</span>
              <span className="text-neutral-500" title={e.sha256}>sha256:{shortHash(e.sha256)}</span>
              {e.captured && <span className="text-neutral-500">captured: {e.captured}</span>}
              {e.sourceUrl && <span className="text-neutral-600 truncate max-w-xs">{e.sourceUrl}</span>}
              {flags.length > 0 && (
                <span data-testid={`exhibit-${e.id}-flag-count`} className="ml-auto text-red-300 bg-red-950/60 border border-red-800 rounded px-1.5 py-0.5">
                  {flags.length} imperative{flags.length === 1 ? '' : 's'} flagged
                </span>
              )}
            </header>

            <div className="p-3 flex gap-4">
              <div className="flex-1 min-w-0">
                {e.kind === 'image' ? (
                  <ExhibitImage id={e.id} bytesOf={bytesOf} />
                ) : (
                  <FlaggedText text={e.text ?? '(no extracted text)'} flags={flags} />
                )}
              </div>

              {(flags.length > 0 || humanChecks.length > 0) && (
                <aside className="w-56 shrink-0 flex flex-col gap-2 text-xs">
                  {flags.length > 0 && (
                    <div data-testid={`exhibit-${e.id}-flags`} className="border border-red-900 rounded p-2 bg-red-950/30">
                      <div className="text-red-300 uppercase tracking-wider mb-1">flagged</div>
                      <ul className="space-y-1">
                        {flags.map((f, i) => (
                          <li key={i} className="text-red-200">
                            <span className="text-red-400">{f.pattern}</span>: “{f.matched}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {humanChecks.map((a) => (
                    <div key={a.id} className="border border-neutral-700 rounded p-2 bg-neutral-900 text-neutral-300">
                      <span className="inline-block px-1.5 py-0.5 mr-1 rounded bg-neutral-800 text-neutral-200 uppercase tracking-wider text-[10px]">human check</span>
                      {a.seat}: {a.finding} — {a.because}
                    </div>
                  ))}
                </aside>
              )}
            </div>
          </article>
        );
      })}
      {exhibits.length === 0 && <p className="text-neutral-700 italic text-xs">no exhibits filed yet</p>}
    </section>
  );
}
