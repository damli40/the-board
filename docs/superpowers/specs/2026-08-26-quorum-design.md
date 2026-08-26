# Quorum — design

**Date:** 2026-08-26
**Event:** The WebMCP Challenge (OpenAI). Submissions close **Sep 3 2026, 1:00pm PDT** = 9:00pm Lagos.
**Status:** design, awaiting review. Nothing built yet.

---

## 1. What this is, in plain language

A web page where a consequential action — one that costs money, or can't be undone — is not
something an agent can simply do. **The tool that performs it does not exist** until a threshold
of genuinely independent agents has agreed the action is correct.

Not a permission prompt. Not a confirmation dialog. The capability is *absent from the agent's
world* until the condition is met, and then it appears.

And the part that makes it more than a voting widget: **the page scores whether its own seats are
actually independent**, and refuses to count two seats that share a dependency as two.

## 2. The pitch, and the hero sentence

> Before an agent does something you can't undo, get a second opinion from an agent that can
> actually disagree with the first one.

**Rule-3 counterfactual, written out loud before scoring:**

> *"Without WebMCP, this project would be ______"*

Honest answer: **a server that fans a question to three model APIs and enables a submit button at
2-of-3.** That product survives. So this is a **rule 3 = 1**, not a 2, and the spec must say so
rather than pretend otherwise. Three blind graders reached this independently for every idea in
the set — none of the five earned a 2.

What is *not* replaceable, and is the honest narrow claim to make in the write-up:

- The commit capability **does not exist as a tool** until quorum. An agent cannot call, guess at,
  or be tricked into a tool that is not in its tool map.
- Each seat is **origin-isolated**. A seat cannot see the other seats' tools, cannot see the
  commit tool, and cannot reach the parent's state except through what is explicitly exposed.
- Both of those are properties of the browser's tool surface, not of a server's tool list.

## 3. Where the idea came from

Vault provenance, so the write-up can cite its own lineage:

| Source | What it contributes |
|---|---|
| `layerzero-security-is-configurable` | X-of-Y-of-N threshold: the app picks how many independent verifiers must agree |
| `dvn-scoring-grades-operator-quality-and-path-structure-separately` | **"A 2-of-2 is not a 2-of-2."** Grade the operators and the *structure* separately |
| `safety-is-a-system-property-so-component-checks-cannot-see-it` | Independence is a property of a **pair**, never of a component. No per-seat check can see it |
| `catastrophe-requires-multiple-failures` | A threshold whose members cannot dissent is decoration |
| `design-shocks-rebuild-existing-infra-for-a-new-consumer` | The consumer of software is becoming software; the interface has to be rebuilt for it |

Richard Cook's source material is 1998 human factors — medicine, aviation, power generation. The
cross-chain origin is where the rule was *practised*, not where it came from. Nothing in this
build is crypto.

## 4. What each party does

**The human, once, up front:** sets the threshold (2-of-3), the seat policy (which providers may
hold seats), and what the consequential action is. Then steps back.

**The seats (independent agents, one per origin):** each receives the same read-only tools —
`get_draft`, `get_checklist`, `get_deadline` — and each returns a verdict through its own
`cast_verdict` tool: approve / reject / abstain, with a one-line reason.

**The page:** counts verdicts, scores seat independence, and registers the commit tool only when
both the count *and* the independence floor are satisfied.

**The user's own agent (the one in ChatGPT's browser or Chrome):** drives the top-level page,
prepares the draft, and — only once the commit tool appears — performs the action.

The human is not a rubber stamp in the loop. That was the first objection every grader raised:
*"why three agents if the human approves anyway?"* The answer is that the human sets policy and
leaves. If a person clicks approve on every action there is no product.

## 5. The independence model — the heart of it

A naive quorum counts seats. This one counts **independent** seats, and the difference is the
demo.

Shared dependencies that collapse two seats into one:

| Dependency | Why it collapses them |
|---|---|
| Same model provider | Correlated training; they fail the same way on the same input |
| Same tool surface | **A poisoned tool description poisons every seat identically** |
| Same prompt frame | Same blind spots |

That middle row is the sharpest, and it was found by an adversarial grader attacking this very
idea: all seats read the same tools, so on the app's own logic the seats are not independent
against tool poisoning — the attack the WebMCP spec names *first* in its security section.

**The honest resolution, and it is the product:** the page states what its seats *are* independent
against (model error, hallucination, a provider outage) and what they are **not** (a poisoned tool
surface, a compromised page). Cook's point 16 in one screen. An all-green board of per-seat checks
is a claim about the parts and never about the system.

So the independence panel reads like this, and updates live:

```
seats           3
independent     2      ← two seats are both GPT-family: collapsed to one
threshold       2 of 3 independent
status          NOT MET — commit tool not registered
covers          model error · hallucination · provider outage
does NOT cover  tool-surface poisoning (all seats read the same tools)
```

## 6. Architecture

```
quorum.app                      top-level page. Owns the draft, the policy, the
  │                             independence scorer, and the commit tool.
  │                             Registers: get_draft, get_checklist, set_policy,
  │                             and — conditionally — commit.
  │
  ├── <iframe allow="tools" src="seat-a.quorum.app">   seat A · provider 1
  ├── <iframe allow="tools" src="seat-b.quorum.app">   seat B · provider 2
  └── <iframe allow="tools" src="seat-c.quorum.app">   seat C · provider 3
```

Each seat is a **different origin** (subdomains are different origins). Each runs a small in-page
JavaScript agent loop. Each registers exactly one tool — `cast_verdict` — exposed only to the
parent via `exposedTo: ["https://quorum.app"]`.

The parent discovers seat tools with `getTools({ fromOrigins: [...seat origins] })` and drives a
seat by `executeTool(seatTool, input)`, which runs inside that seat's own JavaScript context.

**Why iframes at all, honestly.** Two graders warned that reaching for `exposedTo` purely to touch
a spec feature is *stacking*, which the framework penalises. The defensible reason: a seat that
can see the other seats' verdicts is not an independent seat. Origin isolation is how you get
"cannot see" rather than "promises not to look." That is the argument the write-up must make; if
it can't be made honestly, collapse to same-origin and lose the Leverage points rather than lie.

## 7. The WebMCP surface

Verified against the formal spec (W3C WebML CG draft, 26 Aug 2026) and Chrome's imperative-API
docs.

```js
// Registering a tool that can be withdrawn later.
// NOTE: there is no unregisterTool(). You unregister by aborting the signal
// the tool was registered with. This is the only withdrawal path in the spec.
const commitAbort = new AbortController();

await document.modelContext.registerTool({
  name: "commit_submission",
  title: "Submit the application",
  description: "Irreversibly submits the prepared application.",
  inputSchema: { type: "object", properties: { confirm: { type: "boolean" } } },
  annotations: { readOnlyHint: false },
  execute: async ({ confirm }) => { /* ... */ }
}, { signal: commitAbort.signal });

// Quorum lost (a seat changed its verdict, or policy changed):
commitAbort.abort();   // tool vanishes from every agent's tool map
```

Primitives used, and why each is load-bearing rather than decorative:

| Primitive | Used for |
|---|---|
| `registerTool` + `signal` | The commit tool's entire existence is tied to an AbortController |
| `exposedTo` | A seat's verdict tool is visible to the parent only |
| `getTools({fromOrigins})` | Parent discovers seat tools across origins |
| `executeTool` | Parent asks a seat for its verdict; runs in the seat's context |
| `toolchange` | Parent re-reads the seat roster when a seat appears or leaves |
| `readOnlyHint: true` | On every read tool. Chrome's UI surfaces this as "3 read, 7 write" |
| `untrustedContentHint: true` | On any tool returning seat-authored text — a seat's reason string is model output and must not be treated as instructions |

**Constraints that bind deployment:**

- All three methods throw `SecurityError` unless the document is origin-isolated. Chrome is
  origin-keyed by default and this is only *lost* via `Origin-Agent-Cluster: ?0` — but set
  `?1` explicitly anyway.
- The `tools` permissions-policy feature defaults to `'self'`; cross-origin iframes need
  `allow="tools"`.
- **GitHub Pages is out** — no custom headers. Vercel, Cloudflare, Netlify and Render all work.
- Tool names: ≤128 chars, `[A-Za-z0-9_.-]` only.
- **There is no annotation vocabulary for cost, reversibility, or one-shot.** Only `readOnlyHint`
  and `untrustedContentHint` exist. Consequence metadata has to live in the page's own state, not
  in the tool declaration. Worth saying out loud in the write-up — it is a real gap in the spec
  and naming it reads as spec fluency.

## 8. The 60-second demo spine

Judges give ~60 seconds before deciding. The video opens on the object, never the thesis.

| Time | What is on screen |
|---|---|
| 0:00–0:10 | An agent is about to submit an application. One seat lit. "One agent, about to do something you can't undo." |
| 0:10–0:25 | Two more seats join. Verdicts land: approve, approve, reject. Quorum 2-of-3 met. **The commit tool appears in the agent's tool list, on camera.** |
| 0:25–0:45 | **The turn.** Swap seat C's provider so two seats are the same family. The independence meter drops 3 → 2. Quorum fails. **The commit tool vanishes.** The agent says, in its own words, that it no longer has a tool to submit with. |
| 0:45–0:60 | The panel: what this covers, what it doesn't. "These seats share a tool surface, so they are not independent against a poisoned tool. Here is what they *are* independent against." |

The tool appearing and vanishing in the agent's own list is the visible object. The independence
collapse is the drama. Neither is a dashboard.

## 9. Scope

**In, for 8 days:**

- One real consequential action. Not a mock. A real email to a real address, or a real HTTP POST
  to something that genuinely cannot be undone. Every grader independently said: *if the
  irreversible action is mocked, the stakes are mocked.*
- Three seat origins, three providers, one in-page agent loop each.
- The independence scorer with the three collapse rules from §5.
- The policy panel: threshold + provider allowlist.
- The coverage statement — what quorum protects against and what it does not.

**Out, explicitly:**

- Any second workflow. One action, done properly.
- Persistence beyond a session.
- Accounts, billing, mobile layout.
- Targeting ChatGPT's in-app browser for the *seat* iframes. Its cross-origin and `toolchange`
  behaviour is undocumented. The top-level page should work there; the seats are filmed in Chrome
  with `chrome://flags/#enable-webmcp-testing`, which is a test path the challenge brief itself
  names.

## 10. Plan

| Day | Deliverable | Gate |
|---|---|---|
| **0 (today)** | **Spike.** 30-line page: register a tool, abort it, re-register. Open in Chrome+flag and in the Model Context Tool Inspector extension. Does the agent see the change mid-task? | If tools do not refresh mid-task, the whole design changes. **Nothing else starts until this answers.** |
| 1 | Three origins deployed, headers correct, `allow="tools"` verified, a seat's tool visible to the parent via `fromOrigins` | Cross-origin discovery works in Chrome |
| 2–3 | Seat agent loop, `cast_verdict`, parent orchestration, verdict tally | Three seats return real verdicts |
| 4 | Independence scorer + the commit tool's abort lifecycle | Commit tool appears and vanishes on policy change |
| 5 | The real consequential action, wired and genuinely irreversible | It actually fires once |
| 6 | Polish, coverage panel, README, open-source licence visible in the repo's About | Repo requirements met |
| 7 | Video, written explanation, submit | **Submit by Sep 2** — a day early, not Sep 3 |

Submitting a day early is deliberate. The deadline is 1:00pm PDT, not the 5:00pm the announcement
copy stated, and that four-hour error is exactly the kind of latent fault this project is about.

## 11. Risks, and what each one costs

| Risk | Cost if it fires | Mitigation |
|---|---|---|
| `toolchange` not honoured mid-task by the judges' agent | The demo's central moment is invisible | Day-0 spike. Fallback: in-page agents, whose refresh we control |
| Cross-origin `getTools` behaves differently from spec in shipped Chrome | Leverage 8 → 4; product becomes a slow submit button | Day-1 gate. Fallback: same-origin seats, lose the isolation claim, keep the product |
| "Three LLMs agreeing isn't independence" | The core claim looks naive | This *is* the product — the app says so itself and scores it |
| ChatGPT's browser already confirms consequential actions, and a judge built it | Pitch reads as ignorant of the platform | Pitch as **independent second opinions on top of** the browser's confirmation. Never as "the gate the browser lacks" |
| Seventh verification-shaped build | Reads as sensible, not audacious | The visible object is seats collapsing, not a dashboard. If the best moment is a chart, the design failed |
| Three provider keys from Nigeria; prior Gemini free-tier 429s | Dead demo on camera | Pre-flight all three the day before filming; cache a recorded fallback run |
| Field growing — 586 → 727 registered in one working day | Odds decay daily | Nothing to do but ship early |

## 12. Submission checklist

- [ ] Live public URL, reachable without credentials (or credentials supplied on the form)
- [ ] Public repo, **open-source licence detectable in the About section** — an explicit rule
- [ ] `<3:00` public YouTube demo with audio
- [ ] Written explanation: why WebMCP fits, what it improves, what humans and agents can now do
      together that they couldn't, how WebMCP was implemented
- [ ] `document.modelContext.registerTool({...})` visibly present in the repo — named in the rules
- [ ] Submitted by **Sep 2**, ahead of Sep 3 1:00pm PDT

## 13. Open decisions

1. **The name.** "Quorum" is plain and legible but reads faintly crypto. Alternative: *Second
   Opinion*, which states the pitch. Cheap to change now, expensive after the video.
2. **What the real irreversible action is.** A grant submission is the domain you operate in
   (rule 6 = 2). Needs to be something genuinely one-shot that can fire on camera.
3. **Whether the seats' providers can include a non-OpenAI model.** Provider diversity is the
   whole independence claim, but this is OpenAI's event. Recommendation: include them, and say
   plainly that independence requires it — that reads as integrity, not disloyalty.

## 14. What this design does not do, and what I am unsure about

- It does not verify that the judges' agent honours `toolchange` mid-task. That is unverified and
  the day-0 spike exists solely to answer it.
- It does not solve tool-surface poisoning. It *detects and states* that the seats share that
  dependency. Naming a limit is not fixing it.
- Scores in this document that came from me are marked as mine. The three grader scores were blind
  and shuffled, and they corrected my own scoring down from 15/16 to ~12–14 on the predecessor
  idea. Treat every number here as a fix-list, never as a prediction.
- The rubric could not separate the top three ideas — 25.0, 24.7 and 24.0 out of 40 is noise.
  Quorum wins on rank-sum and on the tiebreak criterion, not by a margin the instrument can see.
