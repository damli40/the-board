// The two ways into this project, on the page itself.
//
// WHY IT EXISTS. A judge arrives with a WebMCP-enabled browser, so
// `Unsupported.tsx` (the flagless page) never renders for them, and every
// sentence it carries about how to drive this thing with your own coding
// agent is invisible to exactly the person it was written for. What they met
// instead was the masthead, the phase rail, and a form asking for an API key.
// Both run paths already worked; neither was offered here.
//
// PLACEMENT. Directly under the masthead's meta rows and above the phase
// rail, so it is the first thing after the introduction. It has to stay
// short: pushing the phase rail below the fold on a laptop would trade one
// missed thing for another. Two columns from ~380px each (`auto-fit` with a
// `min()` floor, so it needs no media query and no new class in theme.css),
// and every command sits in a one-line scrolling `<code>` rather than
// wrapping to three, which is what actually holds the height down.
//
// COPY RULES. Judge-facing prose: no em dashes, active voice, specifics.
// The offline caveat below is checked against the code it describes, not
// against a summary of it — `packages/panel/src/agent/scripted.ts` scripts
// the DECISION and the example arguments, and `loop.ts` then runs that
// decision through `getTools({fromOrigins})` and `executeTool()` like any
// other turn, so the browser's scoping and every refusal are real. "Which
// tool it reaches for" alone would have understated it: the arguments are
// canned too, which is why they are named here.
//
// NO ROOM CODE, EVER. `offlineHref()` rebuilds the URL from `origin` +
// `pathname` and drops the existing query on purpose. A judge who arrived
// through a `?code=` link would otherwise have that code rendered into an
// href, in the DOM, in any screenshot of this page. Offline mode never calls
// the model proxy, so it needs no code to work.
import type { CSSProperties, ReactNode } from 'react';
import { PROD_PARENT_ORIGIN, PROD_ORIGINS } from '../config/origins';
import { VIDEO_URL, REPO_URL } from './Unsupported';

/** The repo URL without its scheme, for the links line. Derived, never retyped. */
const REPO_LABEL = REPO_URL.replace(/^https:\/\//, '');

const CLONE = `git clone ${REPO_URL} && cd the-board && npm install`;
const CHROME = 'scripts/agents/chrome.sh';
const CLAUDE_CMD = 'scripts/agents/agent.sh A';
// The PROD origins, not the resolved ones. `scripts/agents/chrome.sh` opens
// the deployed record by default (`BOARD_RECORD_URL` overrides it), so a
// command naming `localhost` here would point the bridge at a different page
// than the one the judge just opened. Read from config/origins.ts either way:
// this repo keeps origin strings in that one file.
const CODEX_CMD =
  'codex mcp add the-board-a -- node "$PWD/packages/external-agent/src/cli.mjs" ' +
  `--actor A --record-url ${PROD_PARENT_ORIGIN} ` +
  `--panel-url ${PROD_ORIGINS.A} --cdp http://127.0.0.1:9222`;

/**
 * This same page with `?offline=1`, built from wherever it is actually
 * served, so the link works on localhost and on the deployed record without
 * either origin being written here. Falls back to a relative query string
 * when there is no `location` (a test renderer, a server render).
 */
export function offlineHref(): string {
  try {
    const loc = globalThis.location;
    if (!loc?.origin) return '?offline=1';
    return `${loc.origin}${loc.pathname}?offline=1`;
  } catch {
    return '?offline=1';
  }
}

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-heading, Archivo), sans-serif',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const proseStyle: CSSProperties = { margin: 0, fontSize: 12.5, lineHeight: 1.45, color: 'var(--tb-ink-2)' };

const codeStyle: CSSProperties = {
  display: 'block',
  overflowX: 'auto',
  whiteSpace: 'pre',
  fontFamily: 'var(--font-mono)',
  fontSize: 11.5,
  lineHeight: 1.5,
  color: 'var(--tb-ink)',
};

const linkStyle: CSSProperties = { color: 'var(--tb-link)' };

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr)', gap: 8 }}>
      <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--tb-ink-3)', paddingTop: 1 }}>
        {n}
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </li>
  );
}

export function RunIt() {
  return (
    <section
      data-testid="run-it"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
        gap: '18px clamp(20px,3vw,44px)',
        alignItems: 'start',
        padding: '14px clamp(16px,2.6vw,40px) 16px',
        borderBottom: '2px solid var(--tb-rule)',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={headingStyle}>Run it with your own agent</h2>
        <ol data-testid="run-it-steps" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Step n={1}>
            <code style={codeStyle}>{CLONE}</code>
          </Step>
          <Step n={2}>
            <code style={codeStyle}>{CHROME}</code>
            <span style={proseStyle}>Opens a throwaway Chrome with WebMCP switched on and this page loaded. Work in that window from here on. This tab will not update.</span>
          </Step>
          <Step n={3}>
            <code style={codeStyle}>
              <span style={{ color: 'var(--tb-ink-3)', userSelect: 'none' }}>Claude Code: </span>
              {CLAUDE_CMD}
            </code>
            <code style={codeStyle}>
              <span style={{ color: 'var(--tb-ink-3)', userSelect: 'none' }}>Codex: </span>
              {CODEX_CMD}
            </code>
          </Step>
          <Step n={4}>
            <span style={proseStyle}>
              Tell your agent what happened. It files as Advocate A. The phase button, the shared prompt and Connect
              the agents stay yours, and confirm is a signature no agent holds.
            </span>
          </Step>
        </ol>
        <p style={{ ...proseStyle, color: 'var(--tb-ink-3)' }}>Needs Node 22 or newer. No provider key.</p>
      </div>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={headingStyle}>Or watch it run with no setup</h2>
        <p style={proseStyle}>
          Open{' '}
          <a data-testid="run-it-offline-link" href={offlineHref()} style={linkStyle}>
            this page with <code style={{ fontFamily: 'var(--font-mono)' }}>?offline=1</code>
          </a>, type anything into the box at the top of this page and press Send to both. Both advocate panels then
          run a fixed script. Each seat runs when you type into its own box.
        </p>
        <p data-testid="run-it-offline-caveat" style={proseStyle}>
          Every call still goes through the browser&rsquo;s own API, the per-origin scoping is real, and a refusal is a
          real refusal. What a script decides is which tool each panel reaches for next and the example arguments it
          carries.
        </p>
        <p style={{ ...proseStyle, color: 'var(--tb-ink-3)' }}>
          Code:{' '}
          <a href={REPO_URL} style={linkStyle}>
            {REPO_LABEL}
          </a>
          {VIDEO_URL && (
            <>
              {'. Video: '}
              <a href={VIDEO_URL} style={linkStyle}>
                watch the run
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
