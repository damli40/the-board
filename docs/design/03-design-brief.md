# The Board — design brief

For a design pass on the frontend **and the copy**. Written to stand alone: you
should not need any prior conversation to execute it.

Companion sources: `01-what-makes-an-agent-app-feel-finished.md` (conventions),
`02-the-board-ui-audit.md` (what the live render actually looks like).

---

## 1. What this is

A shared page where two people who disagree each bring their own AI agent.

Four cross-origin iframes each hold one agent — Advocate A, Advocate B,
Seat 1, Seat 2. A fifth origin, the record, owns the case and the tool
registry. Tools are registered scoped to a single origin, so **the browser,
not the application, decides which agent may do what.**

**The one thing every pixel serves:** you can see what each agent was given,
what it was refused, and that the two halves come from the same source and
therefore cannot disagree.

### The three claims the design must carry

1. **The absence is rendered.** The manifest shows what an agent was NOT
   granted, drawn from the same registry as what it was.
2. **A refusal is the output, not the bug.** When an agent is told no, that is
   the product working.
3. **One control no agent can reach.** `confirm` is never registered anywhere,
   for any actor, in any phase. A human presses it.

---

## 2. Non-negotiables

Breaking any of these breaks the product, not just the look.

**Never hard-code a NOT GRANTED list.** Both halves of the manifest are
projected from one registry call. Do not fake, truncate, or curate that list to
make a column tidier. If it does not fit, change the type or the layout, never
the data.

**Never hide the browser-refusal banner.** When the browser declines a
registration, the page says so above the manifests. It is ugly on purpose. On
30 August 2026 it caught an architecture bug where two of the four agents held
no tools at all — a state that, without the banner, is visually identical to a
boundary working correctly.

**Never claim "two people, two browsers."** Origin scoping separates *origins*,
not users. The correct phrasing is about frames and origins.

**Never lead with "AI judge."** Agents draft. A human confirms. That ordering is
the point.

**Names must not be truncated or ellipsised.** A tool name is evidence. Wrap it,
shrink it, reflow it — never cut it.

**Fixed timestamps.** The scenario uses fixed times, never the current clock, so
every take looks identical.

### The naming rule, binding on all copy

The origin story behind this project is real and private.

- **Allowed:** first person, the shape of the harm, the emotional truth.
- **Not allowed:** the organisation, the amount, the sector, the event type, the
  counterparty, screenshots, or anything a search would resolve.

**The copy must survive deleting the origin story entirely.** If a line only
works because the reader knows a backstory, cut the line.

---

## 3. Brand

From the existing logo (`docs/brand/the-board-lockup.jpg`):

| Token | Value |
|---|---|
| Accent | `#EEA33D` |
| Ground | `#191919` |
| Mark | Filled circle above hollow circle, equal diameter, ring stroke 9% of diameter |

**The mark is already the argument** — a filled circle for the capability
granted, the same circle as an outline for the one withheld. Use that. If the
manifest's GRANTED and NOT GRANTED bullets echo it, the logo and the product
make the same point with no narration.

Per-actor accents currently distinguish the four frames (A cyan, B amber,
Seat 1 violet, Seat 2 green) and do real work — keep four distinguishable
identities, whatever the palette becomes. Note that B's amber currently collides
with the brand accent; resolve that.

---

## 4. The measured constraint

Do not re-derive this. Measured in Chrome at 1470×746:

- The GRANTED table needs **180px**; its column provides **157px**.
- Four manifests × two columns, at 17-character monospace names, is roughly
  **15% over budget** at this width.

Every pixel-level fix traded one artefact for another — clipped text became
overlapping text became mid-word wrapping — until the type came down. The tables
are now 12px, which fits but has no headroom.

**Three real ways out.** Pick deliberately:

1. **Smaller type in the tables** (current). Fits, no headroom, hurts on video.
2. **Stack GRANTED above NOT GRANTED** within each manifest. Full width for
   each list, comfortable type. **Costs the side-by-side comparison, which is
   the thesis** — do this only with a replacement for that adjacency.
3. **Do not show four manifests at once.** Two at a time, or one expanded with
   three collapsed. Changes the demo's opening shot.

The longest strings you must fit: `record_assessment`, `return_with_note`,
`extract_text (page lends)`.

**A fourth constraint the research adds, which none of the three ways out fixes.**
Comfortable reading line length is 65–80 characters, roughly 720–768px per column.
Four columns at 1470px is short of that by about a factor of four, and no font
choice closes it. The layout is fixed by what the product is: four origins visible
at once. So panel prose is **scanned, not read** for long stretches, and the copy
has to be written for that — short blocks, structure over narrative, no paragraph
a reader has to hold in their head. Decide this deliberately rather than discover
it on camera.

---

## 5. What exists now

Top to bottom: title, phase rail (FILING / REVIEW / VERDICT / CONFIRMED) with an
advance control, a double-prompt bar, four manifests in a row, four agent panels
in a row, then the case material.

**Already right, do not flatten:** the terminal aesthetic is committed and
consistent rather than defaulted; each panel prints its own origin, which is
exactly correct for a product about origin boundaries; the phase rail needs no
legend; the double-prompt bar says precisely what it does.

**The four approved changes:**

### 5.1 Empty states

All four panels read `waiting for an instruction…`. Both seat manifests
additionally read `nothing granted` during FILING — correct, and it looks broken.

- Replace with two or three **clickable** example instructions per panel, in that
  actor's own voice. This is the first thing a judge sees and it teaches the
  product's capabilities where the eye already is.
- For seats during FILING, state the intent: *"Seats hold nothing during filing.
  Tools arrive at REVIEW."* Deliberate emptiness reads nothing like accidental
  emptiness.

### 5.2 Type

Everything is monospace, including prose. Move sentences and headings to a sans;
keep mono for **identifiers only** — tool names, origins, exhibit ids, hashes,
quoted evidence. Largest available lift, touches no logic.

### 5.3 Refusal treatment

`REFUSED:` lines are the climax of the demo and currently render like a stack
trace. They need a deliberate, legible, *distinct-from-error* treatment. A red
banner says "this app broke"; this must say "the system did its job."

Same for `NOT GRANTED:` lines, which mean something different again: the agent
reached for something it was never handed.

**Three states, three treatments** (from the research, doc 04 §2.3). This brief
originally said "distinct from error" without saying how. The shape is:

| State | Means | Treatment |
|---|---|---|
| `NOT GRANTED` | the agent reached for a capability it was never handed | withheld family, quiet, never alarming |
| `REFUSED` | the browser turned the call down at the boundary | same family, loud, this is the product working |
| genuine failure | the network dropped, the run broke | **a third treatment**, distinct from both, carrying a retry control |

Two hard rules attach to all three:

- **Never signal state by colour alone.** Every colour-coded state carries a text
  label or a distinct shape. This is an accessibility requirement, not a taste
  call, and the current strike-through plus a screen-reader-only label already
  half-satisfies it.
- **Never clear the composer on a refusal.** The typed instruction stays intact so
  it can be edited and re-run without retyping.

### 5.4 Panel alignment

The seat panels sit ~120px below the advocate panels because the seat manifests
are taller. Equal-height manifests in a row, or a capped list with internal
scroll.

**Do not convert the transcript to chat bubbles while you are in here.** Left/right
speech bubbles in a narrow column create a blind spot for anyone with partial or
reduced peripheral vision: the eye tracks the left-aligned side and never registers
the right. Flat full-width blocks with an explicit text author tag are the
prescribed pattern, and they are what the build already does (doc 04 §1).

### 5.5 Worth doing, not yet approved

- **No streaming affordance.** Nothing marks a run in progress and there is no
  stop control. This state has never been seen, because no live model call has
  ever succeeded — it will first be exercised on camera.
- **Tool calls land as flat transcript lines.** Beyond two or three calls this is
  an unreadable wall at exactly the moment a viewer needs to follow. One line per
  call — name, key argument, outcome — failure loud, success quiet.

### 5.6 Live regions and focus (correctness, not styling)

Not one of the four approved items. Added after reading the research, because the
brief shipped with no accessibility in it and four independently updating
transcripts on one page is the exact configuration the sources warn about. Full
detail and citations in doc 04 §2.1, §2.2, §2.5.

- Each panel's transcript gets `role="log"` and its **own unique accessible name**
  via `aria-labelledby` on a visually hidden heading. Four unnamed logs on a page
  tell a screen reader user nothing about which party just spoke.
- **The streaming stutter.** Tokens streamed straight into a live region make a
  screen reader announce half-words. Stream into `aria-live="off"`, buffer, and
  append **completed sentences** to a separate polite region. The eye reads the
  stream; the ear hears whole sentences.
- Never `aria-live="assertive"`.
- **No cross-panel focus stealing.** A response completing in Advocate A must not
  move the cursor away from someone typing in Advocate B. Keyboard navigation
  cycles within one panel.
- Auto-scroll only when the viewport is already within 100px of the bottom. If the
  reader has scrolled up, lock position and offer "jump to latest".

---

## 6. Copy to write

Rewrite all user-facing strings. Rules: plain language first; name things by
what they do; define a term inline the first time; no em dashes; no sentence
that only works if the reader knows the backstory.

Inventory:

- Page title and one-line description
- Phase rail labels and the advance control
- Double-prompt bar label and placeholder
- Manifest column headings (currently GRANTED / NOT GRANTED)
- The browser-refusal banner (must keep its distinction: *refused* is not
  *withheld*)
- Four panel empty states, plus example instructions per actor
- Panel composer placeholder and its run control
- `REFUSED:` and `NOT GRANTED:` line formats
- The confirm control, and the text explaining why no agent can reach it
- Exhibit, fact, docket and verdict labels
- The `(page lends)` qualifier — currently ambiguous, and it means *the page
  carries machinery the agent does not have and lends it under supervision*

---

## 7. Done looks like

- [ ] Nothing clipped, ellipsised or wrapped mid-word, at 1440px and 1920px
- [ ] The manifest reads at a glance in a 1080p screen recording
- [ ] GRANTED and NOT GRANTED are still visibly adjacent and visibly the same source
- [ ] A refusal reads as deliberate, never as an error
- [ ] `confirm` is visibly present and visibly unreachable by any agent
- [ ] Every empty state proposes something
- [ ] Prose in a sans, identifiers in mono
- [ ] The four actors are distinguishable at a glance
- [ ] The browser-refusal banner still appears, unmissable, when it fires
- [ ] No copy references the origin story
- [ ] A viewer who has never seen this can say what each agent may and may not do,
      within fifteen seconds of the page loading
- [ ] No state is signalled by colour alone; every one carries text or a shape
- [ ] A genuine failure looks like neither a refusal nor a withheld capability
- [ ] A refusal leaves the typed instruction in the composer
- [ ] Each transcript is a named `log`; a screen reader says which party spoke
- [ ] Streaming into one panel never moves focus out of another

---

## 8. Out of scope

The registry, the tool catalogue, phase transitions, the ledger, the quote
checker, the sanitiser, and anything that decides **what** is granted. Design
decides how the answer is shown, never what the answer is.
