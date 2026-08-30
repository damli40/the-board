# The Board — design system

Prose contract for a design agent. Self-contained: you need no other file to
work from this. Tokens are in `tokens.css`; the long-form rationale is in
`docs/design/03-design-brief.md` and the live-render audit in
`docs/design/02-the-board-ui-audit.md`.

---

## What the product is

A shared page where two people who disagree each bring their own AI agent.
Four cross-origin iframes each hold one agent (Advocate A, Advocate B, Seat 1,
Seat 2). A fifth origin, the record, owns the case and the tool registry.

Tools are registered scoped to a single origin, so **the browser, not the
application, decides which agent may do what.**

**Every pixel serves one job:** you can see what each agent was given, what it
was refused, and that both halves come from the same source and therefore
cannot disagree.

---

## The three claims the design carries

1. **The absence is rendered.** The manifest shows what an agent was NOT
   granted, projected from the same registry as what it was.
2. **A refusal is the output, not the bug.** An agent told no is the product
   working.
3. **One control no agent can reach.** `confirm` is never registered anywhere,
   for any actor, in any phase. A human presses it.

---

## Non-negotiables

Breaking these breaks the product, not the look.

- **Never hard-code, curate or truncate the NOT GRANTED list.** Both halves are
  projected from one registry call. If it does not fit, change type or layout,
  never data.
- **Never hide the browser-refusal banner.** It is deliberately ugly. It caught
  a bug where two of four agents held no tools — a state visually identical to
  a boundary working correctly.
- **Never truncate or ellipsise a tool name.** A tool name is evidence. Wrap it
  or shrink it; never cut it.
- **Never claim "two people, two browsers."** Origin scoping separates origins,
  not users. Say frames and origins.
- **Never lead with "AI judge."** Agents draft. A human confirms. That ordering
  is the point.
- **Fixed timestamps.** The scenario never uses the current clock, so every
  filmed take is identical.

### Copy rule, binding

The origin story is real and private. **Allowed:** first person, the shape of
the harm, the emotional truth. **Not allowed:** the organisation, the amount,
the sector, the event type, the counterparty, or anything a search resolves.

**The copy must survive deleting the origin story.** If a line only works
because the reader knows a backstory, cut it.

---

## Voice

Plain language first, jargon after as a label for something already explained.
Name things by what they do. Define a term inline the first time. No em dashes.
Give the fact, then say what it decides.

---

## Visual identity

Committed terminal-dark. It reads as a deliberate choice, which is the opposite
of the defaulted look that marks generated interfaces. **Do not flatten it into
something generically tasteful.**

The logo is already the argument: a filled circle for the capability granted,
the same circle as an outline for the one withheld. Echo that in the manifest's
bullets and the logo and the product make the same point with no narration.

**Four distinguishable actor identities is a requirement**, not decoration.
A viewer must tell the frames apart at a glance. Each panel also prints its own
origin, which is exactly right for a product about origin boundaries — keep it.

---

## Type

**Mono for identifiers only:** tool names, origins, exhibit ids, hashes, quoted
evidence. **Sans for everything a human reads as language.** Everything is
currently mono, including prose, and fixing that is the largest single lift
available.

Body 15px minimum, line-height 1.5–1.6, measure at most 70ch. Never centre
prose.

---

## Components

### Manifest (the signature image)

Two columns, GRANTED beside NOT GRANTED, projected from one registry call.
**The adjacency is the thesis** — you see what was given next to what was
withheld. Any layout that separates them must replace that adjacency with
something equally direct.

Bullets hang in a gutter so a name that wraps indents under itself rather than
orphaning its marker. Grid tracks must be floored at zero: bare `fr` tracks
floor at min-content, so a wide table pushes past its share and clips or
overlaps its neighbour.

**Do not state the same fact three times in a row.** The column heading, the
strikethrough and a per-row badge all said "not granted"; the badge was removed
and kept as screen-reader text, where the strikethrough and the circle carry
nothing.

### Agent panels

A transcript plus a composer. The composer should grow with its content, send on
Enter and newline on Shift+Enter with the hint visible, and turn into a stop
control while a run is active, in the same position.

**Empty states must propose, not wait.** Two or three clickable example
instructions per panel, in that actor's voice. This is the first thing a judge
sees. Where a seat legitimately holds nothing, say why: *"Seats hold nothing
during filing. Tools arrive at REVIEW."* Deliberate emptiness reads nothing like
accidental emptiness.

### Tool calls

One collapsed line per call: name, the one identifying argument, duration,
outcome. Expandable to full payload. Success is quiet and boring; **failure and
refusal are the loudest thing on the row**, because the reader is scanning for
the one that did not work.

### Refusals

`REFUSED:` is the climax of the demo and currently renders like a stack trace.
It needs a deliberate, legible treatment **distinct from an error**. A red
banner says "this app broke"; this must say "the system did its job."

`NOT GRANTED:` means something different again: the agent reached for something
it was never handed. Give it its own treatment.

Anything that genuinely broke needs a **third** treatment, distinct from both.

### Progress

Stream text as it arrives; hold code blocks until the closing fence. Show an
explicit running state and always expose a stop control. Prefer a named step
("Reading exhibit E1") over an indeterminate spinner.

⚠️ **One ethical constraint specific to this product.** Showing a machine
working hard reduces scrutiny of its output by roughly 66% (the labour
illusion). A product whose entire subject is inspectable capability must not buy
trust that way. Show the work because it is true and checkable, never for
credibility.

---

## Layout budget (measured, do not re-derive)

At 1470×746 in Chrome: the GRANTED table needs **180px**, its column provides
**157px**. Four manifests of two columns each, at 17-character monospace names,
is roughly **15% over budget**.

Every pixel-level fix traded one artefact for another — clipped became
overlapping became mid-word wrapping — until the type came down to 12px. That
fits with no headroom.

Longest strings that must fit uncut: `record_assessment`, `return_with_note`,
`extract_text (page lends)`.

Three real ways out, pick deliberately:

1. **Smaller dense type** (current). Fits, no headroom, hurts on video.
2. **Stack the two halves** per manifest. Comfortable, but costs the adjacency
   that carries the thesis. Only with a replacement for it.
3. **Show fewer manifests at once.** Two, or one expanded and three collapsed.
   Changes the demo's opening shot.

Also: `body` currently has no painted background. The dark ground comes from a
wrapper, so `body` resolves transparent with black text. Paint it explicitly.

---

## Done

- [ ] Nothing clipped, ellipsised, or wrapped mid-word at 1440px and 1920px
- [ ] The manifest reads at a glance in a 1080p screen recording
- [ ] GRANTED and NOT GRANTED still visibly adjacent, visibly one source
- [ ] A refusal reads as deliberate, never as an error
- [ ] `confirm` visibly present and visibly unreachable by any agent
- [ ] Every empty state proposes something
- [ ] Prose in sans, identifiers in mono
- [ ] Four actors distinguishable at a glance
- [ ] The browser-refusal banner still unmissable when it fires
- [ ] No copy references the origin story
- [ ] A first-time viewer can say what each agent may and may not do within
      fifteen seconds of load

---

## Out of scope

The registry, the tool catalogue, phase transitions, the ledger, the quote
checker, the sanitiser, and anything deciding **what** is granted. Design
decides how the answer is shown, never what the answer is.
