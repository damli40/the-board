// The page a visitor sees when the browser has no WebMCP. Until now that was
// one amber sentence (App.tsx, the `!status.available` branch), which read as
// a broken deploy to anyone on Safari, Firefox, or an unflagged Chrome. This
// carries what that visitor needs: the name, what it does, why the flag is
// needed, the two ways to turn it on, the video, and the repo. Nothing here
// touches document.modelContext, so it renders anywhere.
//
// Naming rule: nothing on this page names the dispute behind the project.
//
// One deviation from the drafted copy, on purpose: the amber heading uses
// `--tb-never` rather than `--tb-amber`. `--tb-amber` (#eea33d) is deliberately
// NOT redefined in the light theme (theme.css, the light block's own comment),
// so amber text on the light ground computes near 2:1 and fails WCAG AA for a
// 15px heading. `--tb-never` is the theme-aware member of the same family
// (#e5aa5e dark, #8a4a06 light). The border keeps `--tb-amber`, where a border
// carries no contrast requirement.

import { PARENT_ORIGIN } from '../config/origins';

/** Set before the final deploy. Empty hides the row; never ship a placeholder. */
// Typed `string`, not left to infer the literal. Both test files branch on
// `VIDEO_URL === ''` so they stay green whether or not a video exists yet;
// without the annotation TypeScript narrows this to its own literal type and
// calls those comparisons unreachable, which fails `npm run typecheck` while
// every test still passes. The tests were the thing being protected here, so
// the constant gives way, not them.
export const VIDEO_URL: string = 'https://youtu.be/q-K2zzgY3aQ';
export const REPO_URL = 'https://github.com/damli40/the-board';
const RUNBOOK_URL =
  `${REPO_URL}#how-a-judge-runs-this-path-c-be-advocate-a-with-your-own-claude-code-or-codex`;
const FLAG = 'chrome://flags/#enable-webmcp-testing';

export function Unsupported({ reason }: { reason?: string }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        background: 'var(--tb-ground)',
        color: 'var(--tb-ink)',
        fontFamily: 'var(--font-body, Archivo), sans-serif',
        padding: 'clamp(24px,4vw,56px) clamp(16px,4vw,48px)',
      }}
    >
      <div style={{ maxWidth: '66ch', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <svg width="30" height="62" viewBox="0 0 34 70" style={{ flex: 'none', marginTop: 5, color: 'var(--tb-ink)' }} aria-hidden="true">
            <circle cx="17" cy="17" r="16" fill="currentColor" />
            <circle cx="17" cy="53" r="14.6" fill="none" stroke="currentColor" strokeWidth="2.88" />
          </svg>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-heading, Archivo), sans-serif', fontSize: 'clamp(30px,3.4vw,44px)', lineHeight: 1, fontWeight: 700, letterSpacing: '-0.02em' }}>
              The Board
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.45 }}>
              Two people who disagree each send their own AI agent to argue one case on a shared page.
              The browser decides which tools each agent may call. A named person presses confirm, and
              no agent holds a tool that can.
            </p>
          </div>
        </div>

        <section style={{ border: '1px solid var(--tb-amber)', borderRadius: 4, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, color: 'var(--tb-never)' }}>This browser has WebMCP switched off</h2>
          <p style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
            The Board registers its tools through WebMCP, the browser API that lets a page hand tools
            to an AI agent and choose, per origin, who may call them. Chrome 149 and later ships it
            behind a flag. Your browser exposes no <code>document.modelContext</code>, so this page can
            register nothing and shows nothing else.
          </p>
          <p style={{ margin: '12px 0 4px', fontWeight: 600 }}>Turn it on, either way:</p>
          <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.6 }}>
            <li>
              In Chrome 149 or later, open <code>{FLAG}</code>, set it to <b>Enabled</b>, then quit
              and relaunch Chrome. A tab reload does not apply the flag.
            </li>
            <li>
              Clone the repo and run <code>scripts/agents/chrome.sh</code>. It opens a throwaway Chrome
              profile with the flag on and loads this page.
            </li>
          </ol>
          <p style={{ margin: '12px 0 0' }}>Then open this URL again.</p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          {VIDEO_URL && (
            <p style={{ margin: 0 }}>
              <b>No flag?</b> The <a href={VIDEO_URL} style={{ color: 'var(--tb-ink)' }}>video</a> records
              one full case on this same site: two agents file, a click withdraws their filing tools
              mid-session, and a person confirms. No flagless mode of this page exists.
            </p>
          )}
          <p style={{ margin: VIDEO_URL ? '8px 0 0' : 0 }}>
            <b>Code:</b> <a href={REPO_URL} style={{ color: 'var(--tb-ink)' }}>github.com/damli40/the-board</a>.
            With Claude Code or Codex you can <a href={RUNBOOK_URL} style={{ color: 'var(--tb-ink)' }}>argue a side of the case yourself</a>,
            on these live sites, with no key and no room code.
          </p>
        </section>

        <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--tb-ink-3)' }}>
          record &nbsp;{PARENT_ORIGIN}
          {reason ? <><br />{reason}</> : null}
        </p>
      </div>
    </main>
  );
}
