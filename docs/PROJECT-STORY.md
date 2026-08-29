# The Board

Devpost project story.

## Inspiration

I sent evidence into a process and never found out whether anyone opened it.

I was told it had been circulated. A date was given for a decision. The date passed in silence. When an answer finally came, it named no rule I had broken and pointed at no evidence it had weighed. I asked four questions: which rule, what evidence, how it was reached, and could I see the report. There was no second channel to ask through.

Five weeks. The outcome was not the part that hurt. The blindness was.

Here is the part I missed at the time. **I built that evidence with an agent.** It read the record, assembled the timeline, cross-checked what I claimed against what I could actually show, and drafted the document I sent. Nobody receiving it could have known that. Nobody could have checked what it did, what it read, or what it left out. An agent was already inside that process, on my side of it, and the process had no way to see it either.

So the blindness ran in both directions, and only one direction bothered me at the time.

I kept trying to name what was actually missing, and it was not fairness. It was two specific answers I could not get: **did anyone read what I sent**, and **which rule is this resting on**. Those are not opinions. They are facts about a process, and a process could simply publish them.

Then the timing landed. Agents are moving into processes exactly like that one. Shopify already ships agent tools on every storefront it hosts. Soon someone's agent files the claim and someone else's agent reads it. Build that on the current pattern and you get a second closed room inside the one you already cannot see into.

## What it does

The Board is a shared page where two people who disagree each bring their own AI. Not one the app runs for both of them. Theirs.

Every move either agent makes is a tool call on a page both people watch. The page shows what each agent was granted, which documents it opened, and the exact sentence it relied on. When an agent quotes a document, the page checks that the sentence is really there, at the place claimed.

It works in two layers.

**The parties narrow it themselves, with nobody in the middle.** One side files facts that point into documents. The other side opens those documents and either concedes or disputes. Disputing costs something: you cannot mark a fact contested with a click, you have to open the document and quote the passage you say is wrong, and the page verifies that passage exists. Evidence cannot be waved away by someone who never demonstrably read it. By the time filing closes, the record has sorted itself into agreed, still contested, and claimed but never backed by a document. Nobody decided anything.

**Two seats rule on the leftovers only.** A seat is defined by what it may do, not what it is made of, so two humans can hold the seats and nothing changes.

Then a named human confirms. No agent anywhere holds a tool that can press confirm. Not blocked at runtime. Never registered.

Two things on screen have not been built before.

The first is a manifest of what an agent was **not** granted, drawn from the same registry as what it was, so the two halves cannot disagree. Every tool inspector shows what is registered. Nobody renders the absence.

The second is a refusal treated as the output rather than the bug. When a seat cites a fact it never assessed, the page refuses, and the refusal is what gets displayed.

## How we built it

One browser tab, five origins. A parent origin owns the record and the tool registry. Four cross-origin frames each hold one agent. Tools are registered scoped to a single origin, so which agent can do what is enforced by the browser rather than by my application logic.

The central mechanic came from a constraint. WebMCP has no way to unregister a tool. You withdraw one by aborting the signal it was registered with. So a tool lifetime **is** an AbortController, which means closing the filing window and spending an appeal are the same line of code, and you can watch tools leave both hands in the same frame.

The page also lends capabilities. An agent cannot parse a PDF. The page can, so it carries pdf.js and offers text extraction as a tool. One dependency does three jobs: it powers the tool, it makes the quote check work on PDFs, and it feeds search. That turned out to be the clearest example of what this API is for. Not exposing your buttons to a robot. Lending an agent something it does not have, on your terms, with every use on the record.

I built it as eleven tasks, each written test-first, each reviewed by a separate agent whose instruction was to make the code fail rather than confirm it looked fine. Every decision I made on my own authority went into a ledger with what it would cost if I was wrong. 210 tests pass.

## Challenges we ran into

**The bugs that mattered all ran fine.**

The worst one: the board was frozen while agents acted. Every test passed. The ledger recorded correctly. But nothing told the page to re-render when a tool executed from another origin, so during the refusal beat the whole project leads with, the screen would have shown nothing. The comment in that file claimed every path called refresh. True of every path in that file, wrong for the one that mattered, because it lived somewhere else.

The sanitiser that fences untrusted text before it reaches a model could be escaped. A payload nesting one closing tag inside another had its inner tag stripped, and the surviving halves rejoined into a fresh one, putting the injected instruction outside the fence where a model reads it as trusted. The function's own docstring promised this could not happen. The test that was supposed to prove it only ever tried one flat tag.

The same guard later disabled itself. It fenced content only when Chrome echoed an annotation the tests mocked as present. If the real browser omitted it, spotlighting turned off with no visible failure, while my README claimed to implement it. It now fails closed.

**The spec moved under me.** I audited every API claim against the working group's repository. Six were wrong. The signature for calling a tool had changed eleven days before I started. A primitive I cited as the nearest thing to human confirmation had been removed entirely. And the claim I was proudest of turned out to be historically false in a way that helped: I had written that the unregister method never existed, when it existed and the working group deliberately replaced it with the AbortSignal design. My central idea was not my clever reading of a gap. It was the same conclusion they reached.

**My own instructions introduced a bug.** I tightened the injection detector to stop it flagging ordinary contract language, and over-tightened it. It caught a directive naming one party but missed the identical sentence naming the other, because the letter "a" collides with the indefinite article. A detector with a per-party blind spot, in a project about two parties being treated even-handedly. It is fixed, and the residue that remains is written in the file and pinned by a test rather than left quiet.

**The script would have contradicted the screen.** My storyboard scripted the climax overlay naming exhibit E2. The fixture files the PDF as E1 and the poisoned document as E2. Filming to script would have put text on camera contradicting the table beside it, and named the injection exhibit as the cause.

## Accomplishments that we're proud of

Chrome publishes nine defences for agent developers. Eight of them ask the agent to behave: token limits it sets, content it wraps before its own model, hints, classifiers, confirmations it decides to request. Chrome says plainly that safety cannot be guaranteed inside a language model. One defence is different. Tools are scoped to an origin and the browser enforces it.

**Every defence in that guidance asks the agent to behave. The Board asks the browser instead.**

The other side's agent does not decline to file as you. That tool is not in its list, and no sequence of words puts it there.

I implemented all five of Chrome's deterministic guardrails first, then pointed at the gap, because skipping their recommendations to claim a better idea reads as ignorance.

I am also proud of what the build refuses to overclaim. Injection can still corrupt what a seat concludes. It cannot expand what a seat can do, and a corrupted seat is visible the moment it cites something it never assessed. The Board does not stop an agent from being fooled. It stops a fooled agent from being consequential, and it makes the attempt part of the record.

## What we learned

Shopify taught me the argument better than my own reasoning did. They ship agent tools on millions of storefronts, with real money attached, and there is no tool to place the order. Checkout gets you to the door. It does not buy. The largest commerce platform on the web drew its line exactly where I drew mine: the consequential act is absent from the surface, not declined at runtime.

I learned that the agent I used to build my evidence was the strongest argument in the project and I nearly left it out. It proves the first link of the chain from my own experience rather than from a forecast. Agents are already inside consequential processes, doing work nobody on the receiving end can see or check. I was one of the people doing it.

I learned that reviewing for what breaks finds a different class of bug than reading a diff. Every serious defect in this build passed its tests, returned a plausible value, and was wrong. None of them crashed.

And I learned to check the ground I was standing on. Six published claims were stale. Auditing them cost an afternoon. Publishing them would have cost the argument.

## What's next for The Board

The honest gaps first. Scoping tools to origins does not yet cover a browser's own built-in agent, which the working group lists as an open question. Image citations cannot be machine-checked, so the page stamps them for a human and says so. Cross-origin enforcement is verified by hand, not in the test suite.

The one thing I would change in the spec: tool annotations can say a tool is read-only and can mark its output untrusted, but there is no way to declare which model is behind a tool. I can build two independent seats and I cannot prove to you that they are independent. In a system whose entire purpose is provenance, the thing with no provenance is the model itself. That gap has become the cleaner ask, because the nearest competing primitive was removed and nothing has replaced it.

Model provenance is the annotation I would ask for.

Beyond that: base64 spotlighting as the higher-cost upgrade Chrome recommends, an allowlist on the link capture, and running the same boundary against a third-party agent rather than only the panels I ship.

The process I was inside gave me silence. This gives you a picture. A hole you can show someone is worth more than a silence you cannot.
