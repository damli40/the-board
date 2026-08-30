# What the research says, and where it disagrees with me

**Source:** Dami's NotebookLM, *AI Chatbot UX Design and Interface Best Practices*,
39 sources (36 imported cleanly, 3 failed), read 30 August 2026. The corpus is
weighted toward accessibility standards (W3C/WAI, MDN, WebAIM, the European
Accessibility Act) plus Nielsen Norman Group chatbot research, Smashing Magazine,
Setproduct, and Microsoft's agent-design guidance.

I put two questions to it, framed around The Board's four open design items, and
took the cited answers. This document is the record of what came back. Documents
01 and 03 were written **before** I read it, from my own sources. Where the two
disagree, this document wins and says so.

---

## 1. What it confirms — do not "improve" these away

These are already right in the build. A redesigner who does not know why they are
right will smooth them into something worse.

**Flat full-width blocks, not chat bubbles.** Left/right speech bubbles are
standard everywhere, and they are wrong here. In a narrow column they create a
blind spot for anyone with partial vision or reduced peripheral vision: the eye
tracks the left-aligned text and never registers the right-aligned half of the
conversation. The prescribed fix is full-width blocks spanning the column,
separated by background shading, which is what the terminal aesthetic already
does. *(Setproduct; Make Things Accessible)*

**Functional names, not human ones, and no faces.** Agents should be visibly
machines: abstract geometric marks rather than portraits or realistic
illustrations, technology-oriented names rather than "Alex" or "Mentor", and
strictly neutral task language with no simulated feeling ("Processing file", never
"I'm sorry"). `Advocate A`, `Advocate B`, `Seat 1`, `Seat 2` already satisfies this.
*(Microsoft agent-design guidance; NN/g)*

**An explicit text label on every message block.** Authorship must never rest on
colour or an icon alone, because both are invisible to a screen reader and to a
colour-blind viewer. Every block opens with a high-contrast text author tag. The
panels already print their own origin, which is stronger than a name.

---

## 2. What it adds — new requirements, all concrete

### 2.1 Four live transcripts on one page is the hard case

The Board has four independently updating conversation logs in one document. The
sources treat this as the difficult configuration and prescribe specifics:

- Wrap each panel's conversation area in `role="log"`. That role is purpose-built
  for chronological append-only updates, and it carries `aria-live="polite"` and
  `aria-atomic="false"` implicitly, so a screen reader announces only the new text
  rather than re-reading the whole transcript. *(MDN, ARIA log role)*
- Give each log a **unique accessible name** via `aria-labelledby` pointing at a
  visually hidden heading — "Advocate A chat log", and so on. With four logs on a
  page, an unnamed log tells a screen reader user nothing about which party just
  spoke.
- Never use `aria-live="assertive"`. It interrupts whatever the user is reading.

### 2.2 The streaming stutter, and its fix

This is the finding I would not have arrived at alone, and it is architectural
rather than cosmetic.

If tokens stream directly into a live region, the screen reader tries to announce
each fragment and produces stuttering, half-word speech. The prescribed pattern:

1. Set `aria-live="off"` on the visible element where text actually streams.
2. Buffer the incoming text in the background.
3. When a complete sentence or clause arrives, append it to a **separate** polite
   live region.

The eye reads the stream; the ear hears whole sentences. Two outputs from one
source, deliberately decoupled.

### 2.3 Refusal, limit, and error are three different things

Document 03 asked for a refusal treatment "distinct from error" without saying how.
The sources give the shape, and it resolves the gap the tokens file already flagged:

| State | Treatment |
|---|---|
| **Policy limit / disclaimer** | Inline banner, appears **before** the response so the reader meets it first, expandable for detail |
| **Refusal** | Name the *category* of the refusal, then offer a route forward. Never a dead-end "I can't help with that" |
| **Technical failure** | Concise message plus a **Retry** control. This is the third treatment the tokens file said was missing |

Two hard rules attach:

- **Never clear the composer after a refusal.** The user's drafted text stays
  intact so they can edit and resubmit rather than retype.
- **Never signal any of these by colour alone.** Every colour-coded state carries a
  text label or a distinct shape. This is a European Accessibility Act
  requirement, not a preference.

### 2.4 Progress: label the work, never fake the percentage

- Stream from the first token. A spinner that sits still and then dumps a wall of
  text reads as broken, and first token under ~800ms is what collapses perceived
  wait.
- A percentage progress bar is actively harmful: fake progress destroys trust the
  moment it stalls. Use an indeterminate state plus **a label naming the actual
  work** ("Reading exhibit 2 of 4").
- Provide a **stop control**. Document 03 listed this as unapproved; the sources
  treat it as basic.
- Reasoning steps go in a collapsed section, labelled honestly.
- Buffer partial markdown so a half-open bold tag does not flicker mid-stream.

### 2.5 Focus and scroll, which four panels make live

- **No cross-panel focus stealing.** A message completing in Advocate A must never
  move the cursor away from someone typing in Advocate B.
- Focus stays in the composer when a response arrives, so a follow-up can be typed
  immediately.
- Auto-scroll **only** when the viewport is already within 100px of the bottom.
  The moment the reader scrolls up, lock the position and offer "jump to latest".
  Yanking someone back down mid-read is named as a top cause of disorientation.

### 2.6 Empty states

Confirms document 03's clickable examples, and adds the part that matters most
here: the opening state must state what the agent **cannot** do, not only what it
can. Suggestions must be real buttons, never plain text the user has to retype.

---

## 3. Where this changes what I told you

**On refusals, I was vague and the research is specific.** Document 03 said the
refusal treatment must read as deliberate rather than broken, and stopped there.
It should have specified the three-state split above, and it did not mention
colour-independence at all — which is the one part that is a legal requirement in
the EU rather than a matter of taste.

**On accessibility, document 03 said nothing.** Four live regions on one page is
the exact configuration these sources warn about, and the brief I handed you had
no ARIA in it. That was a gap, not a scoping decision.

---

## 4. The corpus argues against The Board's basic shape

Stating this at full strength, because scoring around a warning is worse than
answering it.

Nielsen Norman Group and others make a direct case **against** several distinct
agents coexisting in one workspace, and name the harms:

- **Linguistic and structural confusion.** Users cannot tell the bots apart and are
  forced to guess which one holds the capability they need.
- **The "hamster wheel".** Users spin between interfaces without resolving anything.
- **Architectural burden.** Interacting with several bots forces the user to learn
  the system's internal divisions just to get basic help.
- **Contradictory guidance.** Independent generative agents give conflicting answers
  and do not share context, which erodes trust in the whole product.

**Where the criticism misses.** Every harm above assumes the agents are
*interchangeable service bots* and the user's job is to pick the right one. The
Board inverts that. The four agents are adversarial parties, and their separation
is the product rather than an implementation detail leaking through. Contradiction
between Advocate A and Advocate B is the intended output, not a defect.

**Where it lands anyway.** "Users cannot tell which one holds the capability they
need" is a real risk, and it is precisely what the manifest answers: each panel
publishes what it may and may not do, continuously. The critique is a good
argument *for* the manifest being the page's signature image.

**The safeguards the sources require if you proceed anyway**, all of which apply:

1. Each panel is a self-contained, scroll-locked semantic container; page content
   must not bleed through or stay keyboard-reachable from inside a panel.
2. Each conversation log carries `role="log"` and its own unique accessible name.
3. Keyboard navigation cycles **within** one panel; a user must not accidentally
   tab out of one party's panel into another's.
4. No cross-panel focus stealing.

---

## 5. Two tensions I cannot resolve by styling

**Line length versus four columns.** The sources put readable line length at 65–80
characters, roughly 720–768px per column. The Board runs four columns at 1470px.
That is unreachable by a factor of about four, and no font choice closes it. The
layout is fixed by what the product is: four origins visible at once. Options are
a wider viewport, fewer simultaneous panels, or accepting that panel prose is
scanned rather than read for long stretches. Worth a deliberate decision rather
than a silent one.

**Showing the work versus scrutiny.** Document 01 cites research that watching a
machine work reduces scrutiny of its output by roughly two thirds. This corpus
recommends visible processing and disclosed reasoning to build trust. Both are
true, and they pull opposite ways here. The Board's entire claim is that a viewer
should scrutinise what each agent may do. **Where the two conflict, favour
scrutiny.** Show what the agent is doing because it is honest, not because it makes
the output feel more credible.

---

## 6. Traceability

Cited most often across both answers: NN/g *10 Guidelines for Designing Your Site's
AI Chatbots* and *The 5 Qualities of Site-Specific AI Chatbots*; Setproduct
*Designing AI chat interfaces: anatomy, patterns, pitfalls*; thefrontkit *AI Chat UI
Best Practices for 2026*; MDN *ARIA: log role*; *Dynamic Accessibility in
Human-Agent Interaction* (deep research report); AnyGen *Chatbot UI Patterns*; Make
Things Accessible *How to build an accessible chatbot*; and the European
Accessibility Act material.
