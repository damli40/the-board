# The Board — UI audit from the first real browser render

A NotebookLM source. Findings taken from the live app in Chrome 152 on
30 August 2026, at 1470×746, in FILING phase with the seeded scenario. Every
item below was observed on screen, not inferred from code.

Companion source: `01-what-makes-an-agent-app-feel-finished.md`.

---

## What is already right, and should not be redesigned away

Worth stating first, because the temptation when fixing a UI is to flatten what
makes it distinctive into something generically tasteful.

- **The terminal aesthetic is committed and consistent.** Dark ground, mono,
  restrained accents, no rounded-card sameness. It reads as a choice. It is the
  opposite of the defaulted look that marks generated interfaces.
- **Per-actor accent colours** (A cyan, B amber, Seat 1 violet, Seat 2 green)
  are doing real work: you can tell the four frames apart at a glance.
- **Each panel prints its own origin** (`⌁ frame: http://localhost:8081`). For a
  product about origin boundaries, putting the origin on screen is exactly right.
- **The phase rail** (FILING / REVIEW / VERDICT / CONFIRMED with the current one
  lit) tells you where you are without a legend.
- **The double-prompt bar** is a single, unambiguous control with a label that
  says exactly what it does: "one instruction, into both advocate panels at once".

---

## Blockers — visible on camera, fix before filming

### B1. `NOT GRANTED` is clipped to `NO` on every row

**Where:** `Manifest.tsx`, the per-row cell in the NOT GRANTED table.

**What happens:** the cell is `whitespace-nowrap` inside a section with
`overflow-hidden`, in a column too narrow to hold it. Every row renders a red
`NO` hanging at the right edge.

**Why it matters more than a normal typo:** the manifest is the signature image
of the whole project. Clipped text on the hero shot reads as "this was not
looked at".

**The deeper problem:** the row already says *not granted* three times — the
column heading, the strikethrough, and the badge. Removing the badge fixes the
overflow and the redundancy in one move.

### B2. Long tool names break mid-word

**Where:** `Manifest.tsx`, the `strike()` helper.

**What happens:** `strike()` renders **one `<span>` per character** to draw the
line through. Inline spans allow a line break between any two characters, so
`record_assessment` wraps as `record_asse` / `ssment` and the `○` bullet is
orphaned on its own line, breaking row alignment for every row below it.

**Fix:** use a CSS `line-through` decoration on the whole name. Same appearance,
text stays a word. If the hand-drawn line is wanted for its texture, keep the
spans but set the container to not break inside the name.

### B3. The panel input placeholder is itself clipped

**Observed text:** `(standalone testing only — the demo` — cut off mid-sentence.
Two clipped strings in one screenshot compounds the impression from B1.

---

## High value — cheap, and they change how finished it reads

### H1. Prose is set in monospace

Every word on screen is mono, including the explanatory paragraph above the
manifests and the panel transcripts. Mono is correct for tool names, origins,
exhibit ids and hashes. It is working against the reader for sentences.

**Change:** sans for prose and headings, mono retained for identifiers. This is
the single largest perceived-quality change available, and it touches no logic.

### H2. Four dead empty states

All four panels read `waiting for an instruction…`. In FILING, both seat
manifests additionally read `nothing granted`, which is *correct* and still
looks broken.

**Change:** replace with two or three clickable example instructions per panel.
This is the first thing a judge sees, it teaches the product's capabilities in
the place the eye already is, and it removes the "is this thing on?" beat from
the opening seconds of the video.

For the seats in FILING, say what is true and why: *"Seats hold nothing during
filing. Tools arrive at REVIEW."* An intentional emptiness reads completely
differently from an accidental one.

### H3. The four panels do not line up

Advocate A and B panels start at roughly y=465; Seat 1 and Seat 2 panels start
at roughly y=585, because the seat manifests above them are taller (11 not-granted
rows against 5 granted). The result is a ragged step across the layout.

**Change:** equal-height manifests in a row, or a fixed max-height on the
not-granted list with internal scroll.

### H4. Eight bordered boxes compete for attention

Four manifests plus four panels, each with a full border, on one screen. Every
border is an edge the eye must process, and here they all have equal weight, so
nothing is prioritised.

**Change:** keep borders on the manifests, since separating the four actors is
the point. Let the panels sit on a slightly raised ground with no border, or a
single edge. Fewer lines, same structure.

---

## Worth doing if time allows

### W1. There is no streaming affordance

Nothing in the panel indicates a run is in progress, and there is no stop
control. Because no live model call has ever succeeded, this state has never
been seen. It will first be exercised on camera.

**Minimum:** a visible active state on the running panel and a stop control.
See the streaming section of source 01.

### W2. Tool calls will land as raw transcript lines

The panel pushes `file_exhibit -> {...}` into a flat text transcript. With more
than two or three calls this becomes an unreadable wall at exactly the moment
the viewer needs to follow along.

**Minimum:** one line per call — name, key argument, outcome — with the failure
case visually loud and the success case quiet.

### W3. A refusal must not look like a crash

`REFUSED:` lines are the product working, and they are the climax of the demo.
They need a deliberate, legible treatment distinct from an error. If a refusal
is styled like a stack trace, the most important beat in the video reads as a
bug.

---

## Ranked, by change to the finished impression per hour of work

| # | Change | Effort | Why this rank |
|---|---|---|---|
| 1 | B1 — drop the per-row badge | ~15 min | Fixes clipping and triple redundancy on the hero shot |
| 2 | B2 — `line-through` instead of per-character spans | ~15 min | Fixes wrapping and row alignment everywhere |
| 3 | H2 — real empty states | ~1 h | First thing anyone sees; teaches the product |
| 4 | H1 — sans for prose | ~30 min | Largest quality lift per line changed |
| 5 | B3 — untruncated placeholder | ~5 min | Third clipped string |
| 6 | H3 — align the panel row | ~30 min | Removes the ragged step |
| 7 | W3 — refusal treatment | ~30 min | The demo's climax |
| 8 | H4 — fewer borders | ~30 min | Diminishing returns |

Items 1, 2 and 5 are bugs. Everything below them is a design choice, and design
choices are the owner's to make.

---

## The one principle to hold while changing any of this

The manifest's GRANTED and NOT GRANTED halves come from one registry call, so
they cannot disagree. **No visual change may break that.** Do not hard-code a
not-granted list to make a column tidier, do not truncate the list to fit, and
do not hide the browser-refusal banner because it is ugly. That banner caught a
real architecture bug on 30 August 2026 — one where two of the four actors held
no tools at all — and it caught it precisely because it was allowed to be ugly
and visible.
