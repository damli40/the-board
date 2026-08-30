# The Board

**Open adjudication on a shared page.** Two parties, each with their own AI advocate, one record
both can see, and a decision no machine is allowed to make.

Built for the OpenAI WebMCP Challenge, 2026.

> ⚠️ This file is public. It observes the project's naming rule: the dispute behind it is described
> in first person and in shape only. No organisation, amount, sector, event or counterparty appears
> anywhere in this repository.

---

## Why I built this

I spent five weeks inside a dispute I could not see into.

I sent evidence. I was told it had been circulated. I never found out whether anyone opened it. I
never found out which rule I was supposed to have broken. There was no page I could look at, no
state I could check, and no way to tell the difference between *being carefully considered* and
*sitting in someone's inbox*.

The outcome was not the part that hurt. The blindness was — the specific, daily, corrosive
experience of arguing into a room you cannot see.

I kept catching myself asking questions that had no mechanism behind them. *Did they read the
attachment, or the summary of it?* *Which paragraph are they relying on?* *Is anyone assigned to
this, or is it just sitting there?* Those are not unreasonable questions. They are the questions any
process ought to be able to answer as a matter of course. Mine could not answer any of them, and
there was nowhere I could go to find out.

So I built the opposite of that room.

## Why this is about to matter to everyone

Until recently, AI in a dispute meant a person pasting things into a chatbot and typing the result
back out. That has changed. Agents now sign into websites and act on our behalf — filing, replying,
uploading, negotiating.

Which means the black box is about to get one layer deeper. Soon it will not just be *"I don't know
what they decided."* It will be *"I don't know what their agent read, what it was allowed to do, or
whose instructions it was following."*

The fix has to be built now, while the shape of it is still being decided.

## What it does

**Two parties. Two advocates. A board of two. One page.**

1. **Filing.** Each side attaches exhibits — documents, screenshots, captured links — and files
   facts, where a *fact* is a claim that points into a specific page or line range of a specific
   exhibit. Either side can concede a fact outright or dispute it. Conceding what is true is cheap
   and it narrows the argument, which is exactly what you want it to do.

2. **Review.** The board's two seats read. Every read is a tool call, so the record shows what was
   opened, what was searched for, and what was never touched. When a seat relies on something, it
   records an **assessment**: the finding, the exact quote it relied on, and one line of reasoning.

3. **Verdict.** Each seat drafts independently. When they disagree, the page shows *why* — computed
   from the ledger, not narrated by a model. Usually the reason is banal and damning: one seat read
   something the other did not.

4. **The human decides.** The verdict is a draft with no force. It becomes real only when a named
   person presses confirm, and **no agent, in any phase, has a tool that reaches that button.**

Each side also holds exactly one appeal, rendered as a card. Spend it and it leaves your hand,
visibly and permanently, while the other side still holds theirs. An appeal forces the board to
re-open and re-cite, and the record shows the second reading happened and what changed.

## The three things that make it more than a nicer inbox

### 1. Nobody has to trust the platform's AI

This is the whole architectural argument, and it is why the project needed WebMCP rather than a
server.

Imagine an arbitration service that runs its own model on both sides. That is the same black box
with better branding — you would be trusting their model, their prompt, their context window. The
problem the product exists to solve gets reintroduced by the architecture.

WebMCP inverts it. The page declares the tools; the agents belong to the parties. Your ChatGPT
attaches to your frame, their Claude attaches to theirs, and neither is the platform's. The page's
job is not to think. It is to hold the record and control who may do what.

The fair objection is that each party could point their own MCP client at a shared server, and
that's true — so the claim isn't that tool-passing is impossible elsewhere. It's narrower and it
holds: **a tool server can hand out tools; it cannot make two people watch the same screen.** MCP
has no rendering. Each party would see their own private transcript, which is two private views
again — the exact thing this exists to end. Here the shared surface *is* the product, and in a
dispute that is not a UI detail.

Each party's panel is a separate browser origin, and tools are granted per origin. So side B's
agent does not *decline* to file evidence as side A — **the tool is not in its list.** Origin
isolation makes that structurally true, enforced by the browser, rather than a promise the app makes
about itself.

That is also the strongest security property here. A great deal of effort goes into stopping
prompt injection from making an agent misbehave. **Injection cannot make an agent call a tool it was
never granted.**

### 2. The page proves the quote is real

Before an assessment is accepted, the page checks that the quoted span actually appears in that
exhibit at that location. If it does not, the assessment is refused.

This matters more than it sounds. A fabricated citation — the invented quote, the paragraph that
says something the document does not — is *the* characteristic failure mode of an AI reading
documents, and it is the hardest one for a reader to catch, because checking it means going and
reading the source yourself. The page cannot tell you whether reasoning is good. It can absolutely
tell you whether the sentence exists.

**The one class of error a reader cannot catch by reading, the machine catches by construction.**

And where it can't, it says so. Text and PDF get the hard check. An image cannot: the model reads
the screenshot, the reading is labelled model-produced, and it is rendered next to the image so you
can check it in one glance.

| exhibit | who reads it | page can verify the quote? |
|---|---|---|
| text · markdown · csv | the page | **yes** — exact substring |
| pdf | the page, via `pdf.js` | **yes** — exact substring |
| image | the model, vision | **no — your eyes. Image shown at the citation.** |

That third row is not a gap I plan to close. A verdict that says *"two of my three citations are
machine-checked; the third is my reading of a screenshot and you should look at it yourself"* is
more trustworthy than one claiming everything is verified.

**The honest system is the one that tells you which of its claims you still have to check.**

### 3. It shows what each agent could do, and what it actually did

The page renders, for every agent, the tools it was granted, the tools it was **not** granted, and a
running count of what it used:

```
SEAT 2 · granted            used
──────────────────────────────────
open_exhibit                     4
extract_text  (page lends)       2
search_exhibits                  3
assess                           3
cite                             2
draft_verdict                    1
──────────────────────────────────
file_fact           NOT GRANTED
confirm             NOT GRANTED
```

This is generated from the tool registry itself — the object that displays the grant is the object
that performs it — so it cannot drift out of true the way a hand-maintained list would.

When the two seats disagree, that table is usually the explanation:

```
                 SEAT 1    SEAT 2
extract_text          0         2
search_exhibits       0         3
open_exhibit          2         4
```

Seat 1 never extracted the PDF. It ruled on the summary.

That is the question I could not get answered for five weeks, rendered as a table.

## Where the page lends the agent a hand

An agent cannot read a PDF. The page can. So the page carries `pdf.js` and offers
`extract_text(exhibit, page)` as a tool — the agent gets text back and never parses a byte.

This turned out to be the clearest example of what WebMCP is *for*. Not "the page exposes its
buttons to a robot," but **the page lending an agent a capability it does not otherwise have, on the
page's terms, with every use on the record.** One dependency does three jobs: it powers the tool, it
makes the quote check work on PDFs, and it feeds full-text search across every exhibit filed.

## How links are handled, and why they aren't exhibits

A link is a pointer to something the other party may control. It can change or vanish after it is
cited, which is disqualifying for evidence.

So pasting a URL **captures** it. The bytes become a frozen exhibit with a SHA-256 and a timestamp,
and from that moment it behaves like any other exhibit. The URL survives as metadata, not as the
evidence. The capture renders as sanitised inert text — never a live frame, never script — because a
live embed would hand an adversary a script running inside the record.

Each exhibit also records **how it was obtained**: independently fetched, or supplied by the
interested party. A board weighing two conflicting exhibits should know which is which.

Nothing you attach is uploaded anywhere. Files are read in the browser and held in local storage in
the parent origin. For a dispute tool, *your evidence never leaves your machine* is a feature.


## Two people who disagree, not two enemies

The parties here are not adversaries. They are two sides of one disagreement who both need the
result to be checkable. That is a much larger group of people than enemies, and it changes how the
thing is built.

**Most of the work happens between the two of them, with nobody in the middle.** One side files
facts that point into documents. The other opens those documents and either concedes or disputes —
and disputing costs something: you have to open the document and quote the passage you say is
wrong. You cannot wave away evidence you never demonstrably read.

By the time filing closes, the record has sorted itself into three piles without anyone deciding
anything: agreed, still contested, and claimed but never backed by a document. Most disagreements
end right there. No third party, no platform, nothing to trust.

**The seats are the escalation, not the main event.** They rule only on what is still contested,
and every document they open and every sentence they lean on is on the record. A seat is defined by
what it is allowed to do, not by what it is made of — `open_exhibit` and `record_assessment` behave
the same whether a person or an agent calls them. Two humans can hold the seats. The boundary does
not care.

**And an outcome has to name the rule it rests on.** A seat cannot cite a rule nobody filed. If a
verdict is drafted anyway, it records that no rule was cited, and the page draws the gap where the
reason should be. An outcome resting on nothing, rendered as a hole, is the point — because silence
is what an invisible process gives you, and a hole is something you can show someone.

## What it deliberately does not do

- **It does not decide anything.** No agent has a tool that can put a verdict into force.
- **It does not judge whether reasoning is sound.** It proves quotes are real, shows what was read,
  and shows what was not. The rest is a person's job.
- **It does not verify images**, and it says so on the page rather than pretending otherwise.
- **It does not keep your files.** No database, no accounts, no upload.
- **It is not a general arbitration service.** It is a shared surface for two parties who are both
  present, settling one thing.

## Technical shape

```
https://theboard-record.netlify.app      the record — docket, exhibits, phases, verdicts
  ├─ <iframe allow="tools" src="https://theboard-a.netlify.app">    side A's advocate
  ├─ <iframe allow="tools" src="https://theboard-b.netlify.app">    side B's advocate
  ├─ <iframe allow="tools" src="https://theboard-seat1.netlify.app"> board seat 1
  └─ <iframe allow="tools" src="https://theboard-seat2.netlify.app"> board seat 2
```

(Deployment targets; not yet live.)

Five browser origins in one tab. Each board seat gets its own origin so that "seat 1 never opened
that exhibit" is something the browser establishes rather than something the seat says about
itself. Tools are registered by the parent with `exposedTo` scoped to a
single origin, so capability is enforced by the browser rather than by application logic.

The spine is one idea: **a phase's lifetime is an `AbortController`.** WebMCP has no
`unregisterTool` — a tool is withdrawn by aborting the signal it was registered with. So when filing
closes, `file_fact` ceases to exist for both sides at the same instant, and both people watch it go.
An appeal works the same way: spending it aborts its controller, and the card leaves your hand.

Everything runs in the browser. Provider keys sit behind one serverless proxy per origin because the
repo is public.

## The limitation I would fix in the spec

WebMCP tool annotations are `readOnlyHint` and `untrustedContentHint`. There is **no provenance
annotation** — no way for a tool to declare which model stands behind it.

A two-seat board needs exactly that. The point of two seats is that they are independent, and today
independence here is handled out of band and asserted rather than proven. Two seats on the same
model would look identical to two on different ones.

If I could ask the spec for one primitive, that is it.

---

*Built by [@rookie_of_Ph](https://x.com/rookie_of_Ph).*
