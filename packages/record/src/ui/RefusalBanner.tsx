// The browser-refusal banner: the one place red runs as a field.
//
// This already existed, as a plain amber `<section>` inline in App.tsx (see
// the survey). Task 3 restyles it to the design (docs/design/claude-design/
// the-board.dc.html, lines 140-151) and keeps the exact behaviour it already
// had: rendered only when `engine.registry.registrationFailures()` is
// non-empty, and never hidden or suppressed beyond that condition — CLAUDE.md
// section 4's own invariant is "refusals go on the ledger... never swallow a
// refusal", and this banner is that same rule applied to the page a viewer
// actually looks at instead of the ledger tape.
//
// The design's own refusal rows are INVENTED data: two hardcoded origins and
// a fabricated `14:02:11` timestamp, both forbidden by Global Constraint 2 and
// CLAUDE.md section 0's naming rule (a fabricated timestamp is exactly what
// that rule exists to stop). This renders the real `RegistrationFailure[]`
// instead — one row per tool/origin/lifetime/reason the browser actually
// refused, using the `{tool} · {origin} · {lifetime} · {reason}` text the
// pre-restyle version used, per copy-final.md ("keep the existing rows and
// their real text"). Because that list can hold any number of rows (the
// design's fixed two-line `<p>` with one hardcoded `<br>` cannot), each
// failure is its own list item rather than a literal line-for-line port of
// that one element.
//
// Fix round 1, I5 (copy ruling): the approved copy assumed exactly two
// refused frames — "Two agents", "two frames" — but the banner's own
// condition fires on ONE OR MORE failures. copy-final.md is corrected to
// count-driven wording; both sources now say the same thing. `frameCount` is
// the number of DISTINCT origins in `failures`, not the number of failure
// rows — one frame can have several tools refused, and the sentence is about
// frames, not tools.
//
// Fix round 1, M7: `registration-failure-${tool}` was not unique — the exact
// case the design's own example illustrates (`register(seat1)` /
// `register(seat2)` both refusing the same tool) puts two DOM nodes under one
// testid, and `getByTestId` throws instead of finding either. Renamed to
// `registration-failure-${tool}-${origin}`, which is unique per row by
// construction. Any doc that named the old id (`docs/evidence/hand-run.md`)
// is updated in the same commit.
import type { RegistrationFailure } from '../webmcp/registry';

interface RefusalBannerProps {
  failures: RegistrationFailure[];
}

export function RefusalBanner({ failures }: RefusalBannerProps) {
  if (failures.length === 0) return null;

  const frameCount = new Set(failures.map((f) => f.origin)).size;

  return (
    <div
      role="status"
      data-testid="registration-failures"
      style={{
        // Fix round 1, M11: this field, not the chip (that stays --tb-red —
        // see theme.css's own comment on why the two are scoped separately).
        background: 'var(--tb-red-deep)',
        color: '#fff',
        padding: '20px clamp(16px,2.6vw,40px)',
        borderBottom: '2px solid var(--tb-rule)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'start' }}>
        <span
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '.1em',
            background: '#fff',
            color: 'var(--tb-red)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          BROWSER REFUSED A HANDOVER
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
            Agents may be holding no tools at all. Do not read this page as a boundary working.
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: '100ch' }}>
            The record tried to hand tools to {frameCount} {frameCount === 1 ? 'frame' : 'frames'} and
            the browser would not complete the handover. Refused is not the same as not handed over:
            not handed over means the record kept a tool back on purpose, refused means the browser
            blocked a handover the record intended.
          </p>
          <ul
            style={{
              margin: 0,
              listStyle: 'none',
              padding: 0,
              paddingTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            {failures.map((f) => (
              <li key={`${f.lifetime}:${f.origin}:${f.tool}`} data-testid={`registration-failure-${f.tool}-${f.origin}`}>
                {f.tool} · {f.origin} · {f.lifetime} · {f.reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
