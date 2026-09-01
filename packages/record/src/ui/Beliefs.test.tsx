// Task 6 (finish plan): the block that finally says what this page is,
// tested the way copy-final.md and CLAUDE.md sec. 0 actually make claims
// about it — not just "it renders something."
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Beliefs } from './Beliefs';

describe('Beliefs', () => {
  it('renders the outer block under its own testid', () => {
    render(<Beliefs />);
    expect(screen.getByTestId('beliefs-block')).toBeInTheDocument();
  });

  it('renders both headings, "What this is" before "What we believe"', () => {
    render(<Beliefs />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    const texts = headings.map((h) => h.textContent);
    expect(texts).toContain('What this is');
    expect(texts).toContain('What we believe');
    expect(texts.indexOf('What this is')).toBeLessThan(texts.indexOf('What we believe'));
  });

  // copy-final.md, "The beliefs block (Task 6)" — this is the approved copy
  // and the source; the string below is byte-checked against that file (see
  // the task report), not retyped from memory.
  it('renders the "What this is" paragraph verbatim', () => {
    render(<Beliefs />);
    expect(
      screen.getByText(
        'Four agents, in four separate frames, each one on its own web address. One page in the middle holds the case file and hands out the tools. That handing out is WebMCP — the browser API a page uses to declare which tools an agent may call, and from which addresses. An agent can only call what the browser handed to its frame — not what the page politely asks it to stick to, and not what it promises in a prompt. Everything any of them does lands on one record both sides can read.'
      )
    ).toBeInTheDocument();
  });

  // 1 Sep fix: the page never named WebMCP anywhere a reader can see it —
  // every `webmcp` occurrence in packages/record/src was an import path or a
  // code comment. copy-final.md's "The product name, 1 Sep" section adds one
  // sentence here. Assert on the visible string, not a variable holding it,
  // so an edit that quietly drops the word back out fails this test.
  it('names WebMCP in the "What this is" paragraph', () => {
    render(<Beliefs />);
    expect(screen.getByText(/That handing out is WebMCP/)).toBeInTheDocument();
  });

  it('renders all four belief claims, in copy-final.md\'s order', () => {
    render(<Beliefs />);
    const claims = [1, 2, 3, 4].map((n) => screen.getByTestId(`belief-${n}`).textContent ?? '');

    expect(claims[0]).toContain('People are already sending agents to act for them, and that is not going to stop.');
    expect(claims[1]).toContain(
      'So the useful question stops being whether an agent behaves, and becomes what an agent is able to do in the first place.'
    );
    expect(claims[2]).toContain(
      'Asking an agent to behave is a policy. Asking the browser is a boundary. Only one of them holds when the agent is wrong.'
    );
    expect(claims[3]).toContain(
      "A process two sides disagree about is the hardest case, which is why it is the one worth building for. Neither side should have to take the other's word for how it was settled."
    );

    // Order matters here — brief 6's own numbering — so assert position in
    // the DOM, not just presence.
    const list = screen.getByTestId('beliefs-claims');
    const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent ?? '');
    expect(items[0]).toContain('already sending agents');
    expect(items[1]).toContain('useful question');
    expect(items[2]).toContain('policy');
    expect(items[3]).toContain('two sides disagree');
  });

  // CLAUDE.md sec. 3's own closing paragraph — quoted there and nowhere
  // else in this file's sibling App.tsx; this is its one home on the page.
  it('renders the honest-limit line, set apart from the four claims', () => {
    render(<Beliefs />);
    const limit = screen.getByTestId('beliefs-honest-limit');
    expect(limit.textContent).toBe(
      'The Board does not stop an agent from being fooled. It stops a fooled agent from being consequential, and it makes the attempt part of the record.'
    );
  });

  it('points at the two harder limitations (built-in agent, DOM-level access) without spelling both out here', () => {
    render(<Beliefs />);
    const pointer = screen.getByTestId('beliefs-limit-pointer').textContent ?? '';
    const whatThisIs = screen.getByText(/^Four agents, in four separate frames/).textContent ?? '';
    expect(pointer).toMatch(/built-in agent/);
    expect(pointer).toMatch(/README/);
    // The full two-paragraph explanation belongs in the README, not here —
    // this line must stay one sentence-pair, not a summary of both
    // limitations. A real ceiling, not an arbitrary one: shorter than "What
    // this is" above it, which is the block's own shortest paragraph.
    expect(pointer.length).toBeLessThan(whatThisIs.length);
  });

  // CLAUDE.md sec. 0: "the pitch must survive deleting the origin story...
  // Delete every first-person sentence into a scratch copy; the argument
  // must still stand." There is no origin story in this block to delete,
  // and this proves it structurally rather than trusting the comment above:
  // no singular first-person pronoun ("I", "my", "me") appears anywhere in
  // the block's rendered text. "What we believe" is the one mandated,
  // verbatim heading that uses a pronoun at all, and it is the institutional
  // "we" of a mission statement, not an autobiographical "I" — CLAUDE.md's
  // own worked argument (sec. 7) is written the same way ("we already depend
  // on this", sec. 3) without being an origin story.
  it('contains no singular first-person sentence — the argument stands with no origin story to delete', () => {
    render(<Beliefs />);
    const text = screen.getByTestId('beliefs-block').textContent ?? '';
    expect(text).not.toMatch(/\bI\b/);
    expect(text).not.toMatch(/\bmy\b/i);
    expect(text).not.toMatch(/\bme\b/i);
  });
});
