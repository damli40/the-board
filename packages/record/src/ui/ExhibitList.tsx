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
//
// Task 4 (finish plan, brief 4c) moves this component's chrome from Tailwind
// neutral/red palette classes to the `--tb-*` tokens so it stays legible
// under the light/dark toggle Task 3 added, and seats it as the "Exhibits"
// column of "the record" grid — the heading and sub-line from the design
// (the-board.dc.html, lines 419-423), copy-final.md verbatim, are rendered
// once by `App.tsx`'s `RecordColumn` wrapper around every column, rather
// than duplicated inside each column's own component. The design itself does
// not draw this component's rich body (image support, flagged-text
// highlighting, the human-check aside), so that inner structure is kept
// exactly as it worked before, just re-painted.
//
// Fix round 1, three findings:
// - C1: the exhibit card's background was `var(--tb-panel-2)`, a dark-CHROME
//   token that stays near-black in BOTH the dark and light palette on
//   purpose (it belongs to the always-dark agent panel). Against `--tb-ink`
//   text, which DOES flip, that was ~1.1:1 contrast in light mode — the
//   evidence itself unreadable. `--tb-ground-2` replaces it: it flips with
//   the theme.
// - I3: the accent border was dropped entirely when this file moved off
//   Tailwind, so an exhibit no longer showed at a glance which side filed
//   it. Restored below via `className={accent.border}` — paired with
//   `borderWidth`/`borderStyle` (never the `border` shorthand, which resets
//   the omitted colour longhand to `currentcolor` and would silently
//   override the class again, the same bug class as Task 3's dead focus
//   rings).
// - Minor: the body/aside flex row did not wrap, so between roughly 1100px
//   and 1440px — where `tb-cols3` gives this column a third of the page but
//   the aside kept a fixed 200px — the exhibit text was squeezed to
//   100-190px. Both sides are now flexible with a wrap point instead of a
//   fixed aside width, so the aside drops below the text under that
//   threshold rather than crushing it.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Assessment, Exhibit } from '../model/types';
import { detectImperatives } from '../injection/detect';
import { ACTOR_ACCENT } from './theme';

function shortHash(sha256: string): string {
  return `${sha256.slice(0, 12)}…`;
}

/** Renders `text` with every flagged span highlighted in place — never removed. */
function FlaggedText({ text, flags }: { text: string; flags: ReturnType<typeof detectImperatives> }) {
  const pre: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', color: 'var(--tb-ink-2)', margin: 0, fontFamily: 'inherit' };
  if (flags.length === 0) {
    return <pre style={pre}>{text}</pre>;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  flags.forEach((flag, i) => {
    if (flag.index > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, flag.index)}</span>);
    nodes.push(
      <mark key={`f${i}`} style={{ background: 'rgba(236,48,19,.28)', color: 'var(--tb-ink)', textDecoration: 'underline dashed var(--tb-red)', padding: '0 2px' }}>
        {text.slice(flag.index, flag.index + flag.matched.length)}
      </mark>
    );
    cursor = flag.index + flag.matched.length;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <pre style={pre}>{nodes}</pre>;
}

function ExhibitImage({ id, bytesOf }: { id: string; bytesOf: BytesOf }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // Fix round 1, Minor: the previous version only revoked a URL that had
    // already been created by the time cleanup ran. If this component
    // unmounts BEFORE `bytesOf(id)` resolves, `revoked` was still null at
    // cleanup time — then the promise resolves anyway (nothing cancels a
    // promise), creates an object URL, and calls `setUrl` on an unmounted
    // component; that URL is now created but never revoked. `cancelled`
    // stops the URL from being created at all once this effect has torn
    // down, so there is nothing left over to leak.
    let cancelled = false;
    let createdUrl: string | null = null;
    Promise.resolve(bytesOf(id)).then((bytes) => {
      if (cancelled || !bytes) return;
      createdUrl = URL.createObjectURL(new Blob([bytes]));
      setUrl(createdUrl);
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id, bytesOf]);
  if (!url) return <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--tb-ink-3)' }}>loading image…</div>;
  return <img src={url} alt={`exhibit ${id}`} style={{ maxHeight: 192, border: '1px solid var(--tb-rule-3)' }} />;
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
    <section
      data-testid="exhibit-list"
      style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 13 }}
    >
      {exhibits.map((e) => {
        const accent = ACTOR_ACCENT[e.side];
        const flags = e.text ? detectImperatives(e.text) : [];
        const humanChecks = assessments.filter((a) => a.exhibitId === e.id && a.verified === 'human-check');

        return (
          <article
            key={e.id}
            data-testid={`exhibit-${e.id}`}
            className={accent.border}
            style={{ borderWidth: 1, borderStyle: 'solid', background: 'var(--tb-ground-2)', overflow: 'hidden' }}
          >
            <header
              className={accent.text}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '8px 12px', fontSize: 11, borderBottom: '1px solid var(--tb-rule-3)', background: 'var(--tb-ground-2)' }}
            >
              <span style={{ color: 'var(--tb-ink)', fontWeight: 600 }}>{e.id}</span>
              <span>side {e.side}</span>
              <span style={{ color: 'var(--tb-ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{e.kind}</span>
              <span style={{ color: 'var(--tb-ink-3)' }} title={e.sha256}>sha256:{shortHash(e.sha256)}</span>
              {e.captured && <span style={{ color: 'var(--tb-ink-3)' }}>captured: {e.captured}</span>}
              {e.sourceUrl && <span style={{ color: 'var(--tb-ink-3)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sourceUrl}</span>}
              {flags.length > 0 && (
                <span
                  data-testid={`exhibit-${e.id}-flag-count`}
                  style={{ marginLeft: 'auto', color: 'var(--tb-broke-ink)', background: 'rgba(236,48,19,.18)', border: '1px solid var(--tb-red)', padding: '2px 6px' }}
                >
                  {flags.length} imperative{flags.length === 1 ? '' : 's'} flagged
                </span>
              )}
            </header>

            <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '3 1 240px', minWidth: 0 }}>
                {e.kind === 'image' ? (
                  <ExhibitImage id={e.id} bytesOf={bytesOf} />
                ) : (
                  <FlaggedText text={e.text ?? '(no extracted text)'} flags={flags} />
                )}
              </div>

              {(flags.length > 0 || humanChecks.length > 0) && (
                <aside style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                  {flags.length > 0 && (
                    <div data-testid={`exhibit-${e.id}-flags`} style={{ border: '1px solid var(--tb-red)', padding: 8, background: 'rgba(236,48,19,.1)' }}>
                      <div style={{ color: 'var(--tb-broke-ink)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>flagged</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {flags.map((f, i) => (
                          <li key={i} style={{ color: 'var(--tb-ink-2)' }}>
                            <span style={{ color: 'var(--tb-red)' }}>{f.pattern}</span>: “{f.matched}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {humanChecks.map((a) => (
                    <div key={a.id} style={{ border: '1px solid var(--tb-rule-3)', padding: 8, background: 'var(--tb-ground-2)', color: 'var(--tb-ink-2)' }}>
                      <span style={{ display: 'inline-block', padding: '1px 5px', marginRight: 4, background: 'var(--tb-ground-3)', color: 'var(--tb-ink)', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 9.5 }}>
                        human check
                      </span>
                      {a.seat}: {a.finding} — {a.because}
                    </div>
                  ))}
                </aside>
              )}
            </div>
          </article>
        );
      })}
      {exhibits.length === 0 && (
        <p style={{ margin: 0, fontStyle: 'italic', fontSize: 12, color: 'var(--tb-ink-3)' }}>no exhibits filed yet</p>
      )}
    </section>
  );
}
