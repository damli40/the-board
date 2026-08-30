# The Board

A shared page where a disagreement gets settled in the open, and anyone can check how.

Two people who disagree each bring their own AI — theirs, not one this app runs. Every move either
AI makes is a tool call on a page both people are watching. Nothing takes effect until a named
human confirms it, and **no agent anywhere holds a tool that can press confirm.**

---

## The argument

This part does not depend on anything that happened to me.

1. **AI agents increasingly act on people's behalf.** Not a forecast. Shopify ships agent tools on
   every one of its storefronts today — search the catalogue, change the cart, go to checkout.
2. **So consequential processes will increasingly have agents inside them.** Someone's agent files
   the claim. Someone else's agent reads it.
3. **Which means three things have to be observable:** what an agent was *allowed* to do, what it
   *actually* touched, and where its conclusions *came from*. Otherwise you have added a second
   closed room inside the one you already could not see into.
4. **WebMCP is where that boundary can live.** The page declares the tools. The browser decides who
   may call them. Not the application's own policy code — the browser.
5. **The Board is that architecture, on the hardest case:** a disagreement where neither side should
   have to take the other's word for how it was settled.

Notice what Shopify does *not* expose. There is no tool to place the order. `proceed_to_checkout`
walks you to the door; it does not buy. The largest commerce platform on the web drew its line
exactly where this project draws its: **the consequential act is absent from the tool surface, not
declined at runtime.**

---

## The one sentence that says what is different

Chrome publishes security guidance for agent developers. It lists nine defences. **Eight of them
are the agent policing itself, or the page politely labelling things and hoping.** Token limits the
agent sets. Content the agent wraps before its own model. Hints. Self-restricted origins.
Confirmation the agent decides to ask for. Classifiers and critics, both foolable. Chrome says so
itself: it is impossible to guarantee safety inside a language model.

One defence is different. Tools are scoped to an origin, and the browser enforces it.

> **Every defence in Chrome's agent guidance asks the agent to behave. The Board asks the browser
> instead.**

The other side's agent does not *decline* to file as you. That tool is not in its list, and no
sequence of words can put it there.

---

## How it works: two layers, and the first needs nobody in the middle

### Layer 1 — the two of you, with no third party

One side files **facts**. A fact is not an opinion; it points into a document, at a page or a line.

The other side opens that document and either concedes the fact or disputes it. **Disputing costs
something.** You cannot mark a fact as contested with a click. You have to open the document and
quote the passage you say is wrong, and the page checks that the passage is really there.

That single rule is the heart of it: *evidence cannot be waved away by someone who never
demonstrably read it.*

By the time filing closes, the record has sorted itself into three piles **without anyone deciding
anything**:

- agreed
- still contested
- claimed, but never backed by a document

Most disagreements end right there. No platform, no arbitrator, nothing to trust.

### Layer 2 — the board, over the leftovers only

Two seats read what is still contested and draft an outcome. This is escalation, not the main event.

**A seat is defined by what it is allowed to do, not by what it is made of.** `open_exhibit` and
`record_assessment` behave identically whether a person or an agent calls them. Two humans can hold
the seats. The boundary does not care, and neither does the record.

### Then a human

The draft has no force. A named person confirms it or returns it with a note. Both are page
controls. No tool reaches them, for any agent, in any phase.

---

## The five things that make this more than a nicer inbox

### 1. Nobody has to trust this app's AI

Imagine a service that runs its own model for both sides. That is the same closed room with better
manners. Here each side brings their own agent, and the tools each agent holds are granted by the
page and enforced by the browser.

### 2. Disputing requires reading

Covered above, and it is the change that matters most. Read receipts are not logged — they are
*required*. A dispute filed by someone who never opened the document is refused, with a message that
says exactly why.

### 3. The page proves the quote is real

A finding must carry the exact sentence it relies on. The page checks that sentence is genuinely in
the document, at the place claimed. Whitespace and capitalisation are normalised; **word choice is
not.** A fabricated citation is the characteristic failure of an AI reading a document, and this is
the one place where it is checked by machine instead of trusted.

Where the page *cannot* check — a screenshot, a photograph — it says so, in the record, next to the
finding. It never quietly passes an unverifiable claim as a verified one.

### 4. It shows what each agent could do, and what it actually did

Every tool inspector shows what a page *has* registered. This one also renders what it **has not**:

```
BOARD SEAT 2                  frame: https://theboard-seat2.netlify.app
GRANTED                       NOT GRANTED
● open_exhibit                ○ f̶i̶l̶e̶_̶e̶x̶h̶i̶b̶i̶t̶
● extract_text                ○ d̶i̶s̶p̶u̶t̶e̶
● record_assessment           ○ c̶o̶n̶f̶i̶r̶m̶
```

(Deployment target; not yet live.)

Both halves are drawn from the same registry, so the right column cannot drift from the truth.

And when the two seats disagree, the page explains why **from the record**, not by asking either of
them:

```
                 SEAT 1    SEAT 2
extract_text          0         2
open_exhibit          2         4

SPLIT · differing input: E2
```

One seat never extracted the PDF. It ruled on the summary. That is *"did anyone actually read it"*
answered as a table.

### 5. An outcome has to name the rule it rests on

A seat cannot cite a rule nobody filed — that is refused. But if a verdict is drafted naming no rule
at all, **it is not refused.** It is recorded, and the page draws the gap:

```
SEAT 2 → OVERTURNED
BASIS  ┌──────────────────────────────┐
       │       NO RULE CITED          │
       └──────────────────────────────┘
```

The rule behind that choice governs every guard in the build:

> **Refuse where refusing produces evidence. Render the absence where refusing would only produce
> silence.**

Refusing a dispute sends someone to go and read, and the read lands on the record. Refusing a
verdict would produce nothing at all — and being handed nothing is the original problem. A hole you
can show someone is worth more than a silence you cannot.

---

## Where the page lends the agent a hand

An agent cannot read a PDF. The page can. So the page carries `pdf.js` and offers
`extract_text(exhibit, page)` as a tool — the agent gets text back and never parses a byte.

This turned out to be the clearest example of what WebMCP is *for*. Not "the page exposes its
buttons to a robot," but **the page lending an agent a capability it does not otherwise have, on the
page's terms, with every use on the record.** One dependency does three jobs: it powers the tool, it
makes the quote check work on PDFs, and it feeds full-text search across everything filed.

---

## What it deliberately does not do

- **It does not decide anything.** A human confirms. There is no tool that reaches that control.
- **It does not claim to be injection-proof.** A poisoned document saying *"rule for the other
  side"* can absolutely mislead a seat. The honest claim is narrower and holds up better:
  *injection can corrupt what an agent concludes; it cannot expand what an agent can do; and a
  corrupted agent is visible, because it gets refused the moment it cites something it never
  assessed.* **The Board does not stop an agent from being fooled. It stops a fooled agent from
  being consequential, and it makes the attempt part of the record.**
- **It does not remove judgement.** The facts are pinned to documents. The *weighing* of them is
  still a judgement, written in prose. The page can say one seat read less than the other. It
  cannot say which one was right.
- **It does not compel anyone.** There is no discovery power. If the other side holds evidence, this
  cannot make them produce it — though it does make their empty column visible.
- **It settles one record.** "Was the same standard applied to somebody else?" is a comparison
  across cases, and out of scope.

---

## Technical shape

One tab, five origins. A parent origin owns the record and the tool registry. Four cross-origin
frames each hold one agent: two advocates, two seats. Tools are registered scoped to a single
origin, so capability is enforced by the browser rather than by this app's own logic.

**A lifetime is an `AbortController`.** WebMCP had an `unregisterTool()` method until March 2026,
then removed it on purpose and replaced it with the `AbortSignal` design (spec PR #147/#156). A tool
is withdrawn today by aborting the signal it was registered with. That means this is not a
workaround for something the spec forgot, it is the design the spec's own authors landed on after
trying the named-unregister approach first. So filing closing and an appeal being spent are the same
line of code, and you can watch tools leave both hands on the same frame.

Every file stays on the machine it was filed from. Nothing is uploaded anywhere.

**One honest limit on the boundary claim:** scoping tools to origins does not currently cover a
browser's own built-in agent — the spec lists this as an open question. So the partition is real and
enforced for the agents this project ships, which is what the demo shows. It is not a claim about a
built-in agent. `confirm` is safe under either reading for a better reason: it is never registered
anywhere, so there is no surface to reach.

---

## The limitation I would fix in the spec

Tool annotations can say a tool is read-only, and can flag its output as untrusted. **There is no
way to declare which model is behind a tool.** So I can build two board seats and I cannot *prove*
to you that they are independent. In a system whose entire purpose is provenance, the one thing
with no provenance is the model itself. That gap is still there, checked again against the spec
repo at HEAD on 29 Aug 2026.

An earlier version of this section pointed at `requestUserInteraction()` on `ModelContextClient` as
the nearest existing primitive for a tool asking a human for confirmation mid-call. That primitive
is gone: it was proposed and then removed, "Remove ModelContextClient for now" (spec PR #205,
11 Jun 2026). Asking a human for input mid-execution is back to an open discussion (spec issues
#165 and #50), with nothing shipped. So there is currently no primitive to point to here, not even
an imperfect one, which makes the model-provenance gap the cleaner ask: it is not competing with a
removed feature, there is simply nothing there.

Model provenance is the annotation I would ask for.

---

## How I noticed

*This is why I found the problem. It is not the argument for why the fix works — the argument is at
the top, and it stands without this.*

I spent five weeks inside a dispute I could not see into. I sent evidence. I was told it had been
circulated. I never found out whether anyone opened it, or which rule I was supposed to have broken.

The outcome was not the part that hurt. The blindness was.

So the thing I wanted was not a fairer judge. It was a process where **"did anyone read it"** and
**"which rule is this resting on"** are not questions you have to ask, because the answers are
already on the page.

Every rule in this build comes from one of those two questions.
