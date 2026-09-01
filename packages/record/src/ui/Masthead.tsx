// The record's masthead: the lockup, the title, the positioning paragraph,
// real page metadata, and a theme toggle.
//
// Ported from the design (docs/design/claude-design/the-board.dc.html, lines
// 88-110). The lockup SVG, the "The Board" h1 and the standfirst paragraph
// are verbatim per copy-final.md — this is the positioning the whole session
// was about, so it is not paraphrased.
//
// The right-hand metadata column keeps the design's slots but fills them
// with real values, and DROPS a slot rather than fabricate one (Ruling 5,
// finish plan): `scenario.ts` has no case-id field anywhere — `Case.ids` is
// exhibit ids, not a case number — so the design's "case 2026-0830-04" row
// never renders; inventing one would be the same CLAUDE.md section 0
// violation as a fabricated timestamp.
//
// The "clock" row DOES have a real source: every exhibit's `filedAt` is a
// fixed, non-`Date.now()` ISO string (scenario.ts's own header) — but ONLY
// for the seeded fixture. Fix round 1, Critical 2: this component used to be
// handed `engine.exhibits.all()`, the LIVE, still-growing store — a live
// `file_exhibit` call stamps real wall-clock time (`tools/impl.ts`'s `now()`
// defaults to `new Date().toISOString()`), so one filing on camera moved
// this row from the fixture's own 09:00-09:20 to a window that never
// existed, and it changed on every take. The prop below is named
// `fixedExhibits`, not `exhibits`, on purpose: `App.tsx` passes it the
// snapshot `loadScenario()` itself returns, captured once and never
// re-derived from the live store (see App.tsx's own comment on
// `fixedExhibits`) — this component has no way to enforce that from its own
// side, only to make the contract impossible to miss by naming. The row is
// simply absent before that snapshot has arrived (nothing to show yet, not
// an invented value).
//
// The theme toggle is new UI (the design has none — the design's own
// `data-theme` lives on a local wrapper div driven by a prototype-only
// `themeAttr` variable that nothing sets). This one writes `data-theme` on
// `document.documentElement`, per the task brief and per this file's own
// theme.css: dark is `:root`'s default, an explicit `data-theme="dark"` is a
// no-op override of that same default, an explicit `data-theme="light"`
// always wins over the OS preference, and no attribute at all falls back to
// the `prefers-color-scheme` media query — see theme.css's header comment.
//
// Fix round 1, I3/M10: `record/index.html` now carries a small blocking
// `<script>` that reads `board:theme` and sets `data-theme` on `<html>`
// before the page's first paint, which is the actual fix for the flash a
// pinned-Light/OS-dark viewer used to see (CSS paints before this
// component's JS module graph even parses, so applying the attribute from
// inside React was always at least one frame too late for the FIRST paint,
// however early in the component lifecycle it ran). `ThemeToggle` no longer
// applies the theme as a side effect of computing its initial state — doing
// DOM work inside a `useState` initializer runs during render, which is
// exactly the kind of side effect `StrictMode`'s double-invoke exists to
// catch — it only reads the stored value now; the `useEffect` below is the
// one place that calls `applyTheme`, on mount (harmlessly re-applying what
// the blocking script already set) and on every later change.
import { useEffect, useState } from 'react';
import type { Exhibit } from '../model/types';
import { PARENT_ORIGIN } from '../config/origins';

const THEME_STORAGE_KEY = 'board:theme';
type ThemePref = 'system' | 'dark' | 'light';
const THEME_OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

function isThemePref(v: unknown): v is ThemePref {
  return v === 'system' || v === 'dark' || v === 'light';
}

/** Mirrors `roomCodeHeader()` in panel/src/agent/loop.ts: storage access can
 *  throw outright in a locked-down embed, and a theme preference is not
 *  worth failing the page over — fall back to System. */
function readStoredTheme(): ThemePref {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (isThemePref(stored)) return stored;
  } catch {
    // Storage blocked. System is the safe, silent default.
  }
  return 'system';
}

function applyTheme(pref: ThemePref): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

function ThemeToggle() {
  // Reads only — no DOM write here. `record/index.html`'s blocking script
  // already applied whatever this reads before first paint; this just needs
  // to agree with it so the toggle's own displayed state (which button is
  // "pressed") matches what the page is actually showing.
  const [pref, setPref] = useState<ThemePref>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  function choose(next: ThemePref) {
    setPref(next);
    try {
      globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisting is a smaller loss than throwing: the next visit just
      // re-defaults to System, and a theme preference is not a secret.
    }
  }

  return (
    <div data-testid="theme-toggle" role="group" aria-label="Theme" style={{ display: 'flex', gap: 4 }}>
      {THEME_OPTIONS.map((opt) => {
        const active = pref === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            data-testid={`theme-toggle-${opt.id}`}
            aria-pressed={active}
            onClick={() => choose(opt.id)}
            className="tb-focus-amber"
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              padding: '4px 8px',
              border: '1px solid var(--tb-rule-2)',
              background: active ? 'var(--tb-ink)' : 'none',
              color: active ? 'var(--tb-ground)' : 'var(--tb-ink-3)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * The real min/max of whatever exhibits it is given, or undefined when
 * there is nothing to compute a range from. This function has no way to
 * tell a "fixed" exhibit from a "live" one — it trusts its input completely
 * — which is exactly why the caller (`Masthead`, and in turn `App.tsx`)
 * must never pass it the live store. See this file's header comment.
 */
function formatClock(exhibits: Exhibit[]): string | undefined {
  if (exhibits.length === 0) return undefined;
  const times = exhibits.map((e) => new Date(e.filedAt).getTime());
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  return `${fmtDate(min)}, ${fmtTime(min)} to ${fmtTime(max)}`;
}

interface MastheadProps {
  /** The scenario's own fixed snapshot — NEVER the live exhibit store. See
   *  this file's header comment and App.tsx's `fixedExhibits` state. */
  fixedExhibits: Exhibit[];
}

export function Masthead({ fixedExhibits }: MastheadProps) {
  // Same defensive read `config/origins.ts` uses for its own prod/dev split:
  // `import.meta.env.PROD` is only reliably populated inside Vite's own
  // module graph (the app bundle and the Vite dev server), not under vitest,
  // so this requires an explicit `=== true` rather than trusting the type.
  const envLabel = import.meta.env?.PROD === true ? 'production, netlify' : 'dev, localhost';
  const clock = formatClock(fixedExhibits);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 32,
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: 'clamp(20px,3vw,32px) clamp(16px,2.6vw,40px) 20px',
        borderBottom: '2px solid var(--tb-rule)',
      }}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', minWidth: 'min(100%, 420px)', flex: '1 1 520px' }}>
        <svg width="30" height="62" viewBox="0 0 34 70" style={{ flex: 'none', marginTop: 5, color: 'var(--tb-ink)' }} aria-hidden="true">
          <circle cx="17" cy="17" r="16" fill="currentColor" />
          <circle cx="17" cy="53" r="14.6" fill="none" stroke="currentColor" strokeWidth="2.88" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading, Archivo), sans-serif',
              fontSize: 'clamp(30px,3.4vw,44px)',
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            The Board
          </h1>
          <p style={{ margin: 0, maxWidth: '64ch', fontSize: 'clamp(15px,1.15vw,16.5px)', lineHeight: 1.45, textWrap: 'pretty' }}>
            People are starting to send AI agents to act for them. The Board is what happens when my
            agent and your agent want opposite things: both get a seat, both work from the same file,
            and every move either one makes is written down here where the other side can read it.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <ThemeToggle />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--tb-ink-3)',
          }}
        >
          <div data-testid="masthead-record">record &nbsp;&nbsp;&nbsp;{PARENT_ORIGIN}</div>
          <div data-testid="masthead-build">build &nbsp;&nbsp;&nbsp;&nbsp;{envLabel}</div>
          {clock && <div data-testid="masthead-clock">clock &nbsp;&nbsp;&nbsp;&nbsp;{clock}</div>}
        </div>
      </div>
    </div>
  );
}
