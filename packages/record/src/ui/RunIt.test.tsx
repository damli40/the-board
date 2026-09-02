// The block a judge reads first. Two things it must never do: hide one of the
// two run paths, and ship a dead video link while `VIDEO_URL` is still empty
// (the same guard `Unsupported.test.tsx` keeps over the other page).
//
// The commands are asserted as whole strings, not as fragments, because a
// judge copies them. A half-right command that still matches `/agent\.sh/`
// would pass a looser test and fail on their machine.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunIt, offlineHref } from './RunIt';
import { VIDEO_URL, REPO_URL } from './Unsupported';
import { PROD_PARENT_ORIGIN, PROD_ORIGINS } from '../config/origins';

describe('RunIt', () => {
  it('renders the block under its own testid', () => {
    render(<RunIt />);
    expect(screen.getByTestId('run-it')).toBeInTheDocument();
  });

  it('offers both paths, running-it first and watching-it second', () => {
    render(<RunIt />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Run it with your own agent');
    expect(headings).toContain('Or watch it run with no setup');
    expect(headings.indexOf('Run it with your own agent')).toBeLessThan(
      headings.indexOf('Or watch it run with no setup')
    );
  });

  it('carries all four steps of the your-own-agent path, in order', () => {
    render(<RunIt />);
    const steps = Array.from(screen.getByTestId('run-it-steps').querySelectorAll('li')).map(
      (li) => li.textContent ?? ''
    );
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain(`git clone ${REPO_URL} && cd the-board && npm install`);
    expect(steps[1]).toContain('scripts/agents/chrome.sh');
    expect(steps[1]).toContain('throwaway Chrome');
    expect(steps[2]).toContain('scripts/agents/agent.sh A');
    expect(steps[3]).toContain('files as Advocate A');
  });

  it('gives Codex the whole registration command, with the origins config supplies', () => {
    render(<RunIt />);
    const codex = Array.from(screen.getByTestId('run-it-steps').querySelectorAll('li'))[2].textContent ?? '';
    expect(codex).toContain(
      'codex mcp add the-board-a -- node "$PWD/packages/external-agent/src/cli.mjs" ' +
        `--actor A --record-url ${PROD_PARENT_ORIGIN} ` +
        `--panel-url ${PROD_ORIGINS.A} --cdp http://127.0.0.1:9222`
    );
  });

  it('states the two things that path needs, and the one it does not', () => {
    render(<RunIt />);
    expect(screen.getByText('Needs Node 22 or newer. No provider key.')).toBeInTheDocument();
  });

  it('links the no-setup run at this page own origin, with ?offline=1 and no room code', () => {
    render(<RunIt />);
    // The judge ARRIVES with a code in the URL — that is the whole demo link.
    // Without this line jsdom's location never had a `code=` to drop, so the
    // assertion below could not fail however `offlineHref()` behaved.
    globalThis.history.replaceState(null, '', '/?code=not-a-real-code');
    const href = screen.getByTestId('run-it-offline-link').getAttribute('href') ?? '';
    expect(href).toBe(`${globalThis.location.origin}${globalThis.location.pathname}?offline=1`);
    expect(href.endsWith('?offline=1')).toBe(true);
    // The room code a judge may have arrived with is dropped on purpose:
    // offline mode never calls the model proxy, and a code rendered into an
    // href is a code in every screenshot of this page.
    expect(href).not.toMatch(/code=/);
    expect(href).not.toContain('not-a-real-code');
  });

  it('offlineHref falls back to a relative query when there is no location', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', { value: undefined, configurable: true });
    try {
      expect(offlineHref()).toBe('?offline=1');
    } finally {
      if (real) Object.defineProperty(globalThis, 'location', real);
    }
  });

  // The claim has to stop exactly where packages/panel/src/agent/scripted.ts
  // stops. That file scripts the decision and the example arguments; loop.ts
  // then runs the result through `getTools({fromOrigins})` and `executeTool()`
  // like any other turn. So: the boundary is real, the choice is not.
  it('says plainly what offline mode fakes and what it does not', () => {
    render(<RunIt />);
    const caveat = screen.getByTestId('run-it-offline-caveat').textContent ?? '';
    expect(caveat).toMatch(/browser’s own API/);
    expect(caveat).toMatch(/per-origin scoping is real/);
    expect(caveat).toMatch(/refusal is a real refusal/);
    expect(caveat).toMatch(/which tool each panel reaches for next and the example arguments/);
    // Never call it a demo mode, and never claim more than the code does.
    expect(caveat).not.toMatch(/demo/i);
    expect(caveat).not.toMatch(/simulat/i);
  });

  it('links the repository', () => {
    render(<RunIt />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain(REPO_URL);
  });

  // Branches on the constant rather than pinning it. Pinned to '' this test
  // went red the moment the video existed, which is the one day it had to stay
  // green; either way what it actually guards is the same — the page never
  // ships a link with no href behind it.
  it('shows a video link once VIDEO_URL is set, and no video row at all while it is empty', () => {
    render(<RunIt />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    if (VIDEO_URL === '') {
      expect(screen.queryByText(/video/i)).toBeNull();
    } else {
      expect(links).toContain(VIDEO_URL);
    }
    expect(links.every((href) => href.length > 0)).toBe(true);
  });
});
