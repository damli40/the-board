# What makes an agent app feel finished

A NotebookLM source. Written for The Board, but nothing here is specific to it.

The question this answers: *why does Claude or ChatGPT feel considered, and a
self-built agent panel feel like a school project, when both are a text box and
some output?*

The short answer is that almost none of it is visual flair. It is four things:
text you can read without effort, turns you can tell apart, progress you can
see, and machine work shown as something you can inspect instead of something
you must trust.

---

## 1. Type: the single biggest lever, and the cheapest

**Use a sans-serif for prose and a monospace only for identifiers.** Monospace
everywhere is the most common self-built tell. Monospace exists to make
character positions comparable — that is useful for a tool name, a hash, an
origin, a line number. It is actively worse for a sentence, because every
character occupies the same width and the eye loses the word shapes it uses to
read quickly.

The rule that follows: **if a human reads it as language, set it in a sans. If a
human compares it to another string, set it in mono.**

**Numbers that matter:**

| Property | Value | What it decides |
|---|---|---|
| Body size | 15–16px | Below 14px people lean in. That lean is what "unfinished" feels like. |
| Line height | 1.5–1.6 | Under 1.4, lines visually merge and scanning collapses. |
| Measure (line length) | 60–75 characters | Past ~90 the eye loses its place returning to the left edge. |
| Small/meta text | 12–13px, never below 11 | Timestamps, origins, counts. |
| Weight contrast | 400 body / 600 headings | Two weights is enough. Three reads as noise. |

**Never centre body text.** Centre a heading if you like. Centred prose forces
the eye to hunt for a new left edge on every line.

---

## 2. Turns: the reader must never wonder who is speaking

A chat interface is a transcript. Its one hard requirement is that the boundary
between one turn and the next is unmistakable, and that each turn is attributed.

Three mechanisms, in order of strength:

1. **Vertical space.** The gap *between* turns should be roughly double the gap
   *inside* a turn. This alone carries most of the structure.
2. **Alignment or indentation.** One side indented, or one side on a tinted
   ground.
3. **A label or avatar.** Weakest on its own, essential in combination.

**Do not put every turn in a bordered card.** Boxes around everything is the
second big self-built tell. Borders are expensive: each one asks the eye to
process an edge. Spend them on the two or three things that genuinely need
separation, and use whitespace for the rest.

---

## 3. Progress: the largest perceived-quality lever after type

Streaming text is the reason a model that takes eight seconds feels responsive
and a model that takes four feels broken. Not because streaming is faster —
it is not — but because a reader who sees the first sentence at 400ms has
something to do while the rest arrives.

**Rules:**

- Render text as it arrives, token by token.
- **Defer code blocks until the closing fence.** A half-parsed code fence
  reflowing on screen looks like a crash.
- Show an explicit streaming indicator on the active turn — a caret, a pulse.
- **Always expose a stop control** while streaming. Its absence is the clearest
  signal that a UI was not finished.
- Never use an indeterminate spinner for something you can describe. "Reading
  exhibit E1" beats a spinner, because it tells the reader what is happening
  and roughly how long is left.

### The waiting research, and one warning that applies especially here

Prior research on this (see the Waiting UX notes): giving people something to
*do* while waiting beats a passive indicator decisively (ηp² .70–.76, 96%
preference), and **perceived** duration predicts satisfaction far better than
actual duration (~72% of the variance). A nine-second LLM response can read as
*more* thoughtful than a two-second one when the wait is framed as work.

That last effect is the **labour illusion**: showing the machine working makes
people trust the output more. It reduces scrutiny of the result by roughly 66%.

**Be careful with it.** For a product whose entire subject is inspectable
capability and provenance, using a visual trick to lower the user's scrutiny
would contradict the thesis. Show the work because it is *true* and *checkable*,
not to buy credibility. If the panel says "reading E1", that must be because a
read receipt was actually written.

---

## 4. Tool calls: show the mechanism, collapsed

This is where agent apps differ from chat apps, and where most self-built ones
fail. A raw dump of JSON arguments into the transcript is unreadable; hiding
tool use entirely destroys the trust the interface exists to build.

**The pattern that works: a collapsed row that says what happened in one line,
expandable to the full arguments and result.**

```
▸ open_exhibit  E1                             0.4s   ✓
▸ extract_text  E1, page 4                     1.1s   ✓
▸ cite          F3                             —      REFUSED
```

Each row carries four things: what was called, the one argument that identifies
it, how long it took, and how it ended. Expanding gives the full payload.

**Status must be visually distinct at a glance**, because the reader is
scanning for the one that failed:

- running — animated, muted
- succeeded — quiet, low contrast, it is the boring case
- **failed or refused — the loudest thing on the row**

### A refusal is a result, not an error

If your product treats a refusal as meaningful output, it must not be styled
like a crash. A red banner says "this app broke". A distinct, deliberate,
legible row says "the system did its job". Same information, opposite meaning.

### The AG-UI event vocabulary

As of 2026 there is a cross-framework standard for exactly these events —
adopted across LangGraph, CrewAI, Microsoft Agent Framework, Google ADK, AWS
Strands, Pydantic AI and LlamaIndex:

- Run lifecycle: `RunStarted`, `RunFinished`, `RunError`
- Message streaming: `TextMessageStart`, `TextMessageContent`, `TextMessageEnd`
- Tool calls: `ToolCallStart`, `ToolCallArgs`, `ToolCallEnd`

Even if you never adopt the protocol, **adopt the vocabulary**. If your UI has a
state for each of these events, you have covered the cases a hand-rolled panel
usually misses: the run that errors before any message, the tool call that
starts and never ends, the message that ends with no content.

---

## 5. The composer

The input is the most-touched element. Signals that it was finished:

- **It grows with the content**, to a cap, then scrolls. A single-line input for
  multi-sentence instructions is the most common miss.
- **Enter sends, Shift+Enter newlines** — and the hint is visible, quietly, near
  the control.
- The send affordance is **disabled when empty**, and becomes a **stop** control
  while a run is active. Same position, so the muscle memory holds.
- It stays **anchored** while the transcript scrolls above it.
- Comfortable target: **44px minimum height**.

---

## 6. Empty and error states

**An empty state should propose, not wait.** "waiting for an instruction…" tells
the user nothing they did not know. Two or three concrete example instructions,
clickable, teach the product's capabilities in the place where the user is
already looking. This is the single highest-value state in a demo, because it is
the first thing anyone sees.

**Errors go inline, in the flow, at the point of failure**, and they say what
happened and what to do. A generic toast that disappears is worse than nothing.

Missing states are the most reliable marker of an unfinished interface: empty,
loading, error, partial, too-long, and offline. Ship the first three at minimum.

---

## 7. What makes an interface look machine-generated

Worth knowing so a redesign does not walk into it:

- Inter / DM Sans / Nunito at default weights
- Every element in a rounded card with a visible border
- A timid palette: greys plus one washed-out accent used inconsistently
- Identical card treatments regardless of importance
- Harsh 1px borders everywhere instead of spacing and contrast
- Missing states
- Perfectly even spacing with no rhythm — no sense of what groups with what

**A distinctive, committed aesthetic beats a generically tasteful one.** A
terminal look, fully committed, reads as a considered choice. The failure mode is
not "too plain" — it is "defaulted".

---

## 8. The checklist

Before calling an agent interface finished:

- [ ] Prose in a sans; mono only for identifiers
- [ ] Body ≥15px, line-height ≥1.5, measure ≤75ch
- [ ] Gap between turns is ~2× the gap inside a turn
- [ ] Text streams; code blocks wait for the closing fence
- [ ] A stop control exists during a run
- [ ] Tool calls are one collapsed line, expandable, with visible status
- [ ] A refusal looks deliberate, not like a crash
- [ ] Composer grows, Enter sends, hint is visible
- [ ] Empty state proposes concrete actions
- [ ] Errors are inline and specific
- [ ] Nothing is clipped or wrapped mid-word at the target window size
- [ ] The same information is not stated three times in one row

---

## Sources

- [Designing AI chat interfaces: anatomy, patterns, pitfalls — Setproduct](https://www.setproduct.com/blog/ai-chat-interface-ui-design)
- [Agentic UX: frontend design patterns for AI agents in 2026 — Zylos Research](https://zylos.ai/research/2026-05-28-agentic-ux-frontend-design-patterns-ai-agents/)
- [Agent UX: designing UI for AI agents in 2026 — Fuse Lab Creative](https://fuselabcreative.com/ui-design-for-ai-agents/)
- [Chat UI design: how to build effective chat interfaces in 2026 — UXPin](https://www.uxpin.com/studio/blog/chat-user-interface-design/)
- [AI chat UI best practices for 2026 — thefrontkit](https://thefrontkit.com/blogs/ai-chat-ui-best-practices)
- [How to avoid AI slop when using Claude Design — MindStudio](https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system)
- Waiting UX research notes (own prior research, Commons build)
