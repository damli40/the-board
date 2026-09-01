// The record page has never had a sentence saying what it is. Every other
// block on this page is machinery — a manifest, a ledger, a confirm control —
// and a viewer who lands here has had to infer the argument from a tool
// catalogue. This is that sentence, and the four that follow it.
//
// Task 6 (finish plan): heading text and body copy are copy-final.md's
// "The beliefs block" section, verbatim — this file renders that copy, it
// does not draft new copy of its own. The argument itself is not new either:
// it is CLAUDE.md sec. 7's "generalized argument" (the numbered five-point
// list under "The generalized argument, which must appear before any
// first-person material"), restated here in the design's own voice for a
// reader of the page rather than a reader of the rules file.
//
// Two placement notes:
// - Below "The record" / the verdict panel / `ConfirmBar` — the last thing
//   on the page, not the first. The masthead standfirst (`Masthead.tsx`)
//   already opens the argument ("People are starting to send AI agents to
//   act for them..."); this closes it, after a viewer has seen the
//   machinery the argument is about, not before.
// - CLAUDE.md sec. 0's naming rule binds this file specifically: "the pitch
//   must survive deleting the origin story." There is no origin story here
//   to delete — every sentence below is drawn from copy-final.md and
//   CLAUDE.md sec. 7/3, and none of it is written in the singular first
//   person. `Beliefs.test.tsx` pins that as a real assertion, not a claim in
//   a comment nobody checks.
//
// The honest-limit line is CLAUDE.md sec. 3's own closing paragraph, quoted
// there and in this file's sibling `App.tsx` nowhere — this is its one home
// on the page, set apart in the accent per copy-final.md's own instruction
// ("Set apart, in the accent, as the honest limit").
//
// The two sharper edges of the origin boundary — that it says nothing about
// a browser's own built-in agent, and that it scopes tool calls rather than
// the page itself — are deliberately NOT explained in full here. Spelling
// both out at this size would bury the four claims under two paragraphs of
// caveat, which is its own kind of dishonesty (a true statement that reads
// as noise stops functioning as a statement). They are explained in full in
// README.md's Limitations section instead; this block carries one line
// pointing there, not a summary that could drift out of sync with it.
import type { CSSProperties } from 'react';

const WHAT_THIS_IS =
  'Four agents, in four separate frames, each one on its own web address. One page in the middle holds the case file and hands out the tools. That handing out is WebMCP — the browser API a page uses to declare which tools an agent may call, and from which addresses. An agent can only call what the browser handed to its frame — not what the page politely asks it to stick to, and not what it promises in a prompt. Everything any of them does lands on one record both sides can read.';

const BELIEFS: string[] = [
  'People are already sending agents to act for them, and that is not going to stop.',
  'So the useful question stops being whether an agent behaves, and becomes what an agent is able to do in the first place.',
  'Asking an agent to behave is a policy. Asking the browser is a boundary. Only one of them holds when the agent is wrong.',
  "A process two sides disagree about is the hardest case, which is why it is the one worth building for. Neither side should have to take the other's word for how it was settled.",
];

const HONEST_LIMIT =
  'The Board does not stop an agent from being fooled. It stops a fooled agent from being consequential, and it makes the attempt part of the record.';

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-heading, Archivo), sans-serif',
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.01em',
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  lineHeight: 1.55,
  maxWidth: '68ch',
};

export function Beliefs() {
  return (
    <section
      data-testid="beliefs-block"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        padding: '32px clamp(16px,2.6vw,40px) 40px',
        borderTop: '2px solid var(--tb-rule)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={headingStyle}>What this is</h2>
        <p style={bodyStyle}>{WHAT_THIS_IS}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={headingStyle}>What we believe</h2>
        <ol
          data-testid="beliefs-claims"
          style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '68ch' }}
        >
          {BELIEFS.map((claim, i) => (
            <li
              key={i}
              data-testid={`belief-${i + 1}`}
              style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10 }}
            >
              <span
                aria-hidden="true"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--tb-ink-3)', paddingTop: 2 }}
              >
                {i + 1}
              </span>
              <span style={bodyStyle}>{claim}</span>
            </li>
          ))}
        </ol>
      </div>

      <blockquote
        data-testid="beliefs-honest-limit"
        style={{
          margin: 0,
          borderLeft: '3px solid var(--tb-amber)',
          paddingLeft: 16,
          color: 'var(--tb-amber)',
          fontSize: 14.5,
          fontWeight: 600,
          lineHeight: 1.5,
          maxWidth: '64ch',
        }}
      >
        {HONEST_LIMIT}
      </blockquote>

      <p data-testid="beliefs-limit-pointer" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--tb-ink-3)', maxWidth: '64ch' }}>
        Two harder edges of that boundary — what it says about a browser&rsquo;s own built-in agent,
        and what it says about an agent that simply drives the page the way a person would — are not
        smoothed over here. They are stated in full in this project&rsquo;s README, under Limitations.
      </p>
    </section>
  );
}
