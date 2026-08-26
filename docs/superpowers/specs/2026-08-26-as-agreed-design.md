# As Agreed — design

**Date:** 2026-08-26
**Event:** The WebMCP Challenge (OpenAI). Closes **Sep 3 2026, 1:00pm PDT** = 9:00pm Lagos.
**Status:** design, **UNGRADED**. Nothing built.

> ⚠️ **Read this before the numbers.** The sibling spec (`2026-08-26-quorum-design.md`) was scored
> by three blind, shuffled-label adversarial graders who corrected my own scoring downward. This
> one was not — all three graders failed on a model quota before returning. **Every score in this
> document is mine, which is exactly the bias the blind grading existed to remove.** Treat it as an
> argument, not a measurement, until it has been graded.

---

## 1. What this is, in plain language

Two people who have an agreement between them — a client and a contractor — work on the same
record, and each brings their own AI agent.

Every rule of the arrangement is written on the record, visible to both sides, and **versioned
with a timestamp**: what counts as delivered, how long the revision window runs, when payment
releases.

The mechanism: **an agent can only call a tool that a currently-active rule authorises.** So an
action nobody had authorised was never something anyone's agent could even attempt — and the
record shows the capability was absent, not that a request was denied.

Changing a rule is itself a visible, versioned move. It changes what both sides can do **from that
moment forward, and never backwards.**

## 2. The pitch, and the hero sentence

> You cannot be told afterwards that you broke a rule, when the rule did not exist at the time and
> your agent had no tool that could have obeyed it.

**Rule-3 counterfactual, written before scoring:**

> *"Without WebMCP, this project would be ______"*

Honest answer: **a contract app with role-based permissions and an audit log.** That product
exists. So this is a **rule 3 = 1**, same as Quorum, and the write-up must say so rather than
inflate it.

The narrow claim that *is* defensible, and the only one to make:

- **The rule and the capability are the same object.** Not "the rule says you may, and a server
  checks." The rule's existence *is* the tool's presence in the agent's map. There is no denial
  path to argue about later, because there was nothing to deny.
- **Each side can see what the other side's agent can and cannot do.** Mutual visibility of
  capability, not just of outcomes.
- **The agent's own words become evidence.** "I have no tool that can do that" appears in its
  transcript, timestamped against a rule version.

## 3. Where the idea came from

| Source | What it contributes |
|---|---|
| `labels-as-state-machine-make-multi-agent-pipelines-crash-safe` | Agents never call each other; the work item plus its state **is** the message bus. Observable and crash-safe because state lives outside any process |
| `audits-expire-at-the-next-commit` | A point-in-time judgement about a system that keeps changing is stale the moment it is made |
| `acceptance-not-settlement-is-the-liquidity-bottleneck` | A decision made once about facts that keep moving. **Drift, not speed, is the failure** |
| `every-upgrade-resets-the-security-clock` | A change to the terms resets what was established; it does not inherit the old standing |
| `interests-not-positions-expand-negotiation-space` | Positions are fixed, interests are flexible; the record should hold the terms, not the posturing |

**And the scar tissue.** This design comes from having been on the losing side of a high-stakes
dispute in which the rule said to have been broken was never named, and no shared versioned record
of the terms existed. Days were spent assembling evidence, and it still could not be established
what the rules had been at the moment of acting.

**Naming rule for every public artefact — video, repo, README, submission text.** Describe the
*shape*: "I built this after being on the wrong side of a decision where I could not see the rule
I was said to have broken." **Name no organisation, no amount, no event, and no counterparty.** The
underlying matter is live and unresolved, a response has been requested and not yet received, and
a public account would convert a private negotiation into a public one while the other side still
holds the next move. The shape earns rules 1 and 6 in full. The name earns nothing and costs a
great deal.

## 4. What each party does

**Both parties, at the start:** agree the rules. Each rule is a row: a plain-language statement, a
version number, a timestamp, and the tools it authorises for which side.

**Each party's agent:** works its side — drafting a deliverable, checking it against the stated
criteria, marking a milestone, requesting a revision. It can only call what its side's active
rules authorise right now.

**The record:** holds the rule set, its full version history, and every move with the rule version
that was live when it happened.

**Neither agent talks to the other.** They only read the record and move on it. That is the
label-state-machine pattern, already operated in production, ported to a two-party surface.

## 5. The versioned-rule model — the heart of it

Three properties, and the third is the one nothing else has:

**1. Rules are versioned, and versions are visible.** Rule set v1 at 09:00, v2 at 14:20. Both
sides see the history, not just the current state.

**2. A rule change alters capability forward only.** When rule v3 lands, the tools it authorises
appear and the tools it revokes vanish — from that moment. Past moves keep the version they were
made under.

**3. A retroactive claim is structurally unmakeable.** This is the demo. If one side tries to
apply v3's criterion to a delivery made under v2, the record answers: at that moment the rule set
was v2, and the tool that criterion would have required **did not exist in your counterparty's
tool map.** Not "they didn't comply" — *there was nothing to comply with.*

The panel reads:

```
rule set          v2  ·  active 09:14 → 14:20
                  v3  ·  active 14:20 → now      ← added: "deliverables include tests"

move #7           mark_delivered      14:03      under v2
                  tools available to contractor at 14:03:
                    mark_delivered ✓   request_review ✓   attach_tests ✗ (did not exist)

claim             "delivery #7 breached the tests rule"
                  ✗ REFUSED — rule authorising that requirement is v3, live from 14:20.
                    #7 predates it by 17 minutes.
```

## 6. Architecture

```
asagreed.app                     the shared record. Owns rules, versions, moves.
  │                              Registers each side's tools with exposedTo scoped
  │                              to that side's agent origin only.
  │
  ├── <iframe allow="tools" src="client.asagreed.app">      client's agent panel
  └── <iframe allow="tools" src="contractor.asagreed.app">  contractor's agent panel
```

Two devices, one shared record, kept in sync over a WebSocket. **Each device embeds only its own
party's agent iframe.**

**Why the origins are real and not decoration.** A side's agent must not be able to see the other
side's tools. Origin isolation makes that structurally true — the browser enforces it — rather
than a promise the app makes about itself. That is the honest argument, and if it cannot be made
in the write-up without stretching, collapse to same-origin and lose the Leverage points instead
of overclaiming.

**⚠️ The correction two graders made, which this design must respect.** `exposedTo` takes
**origins, not users**. Two people in two separate browsers never share a frame tree, so
`exposedTo` **cannot** scope per-person across devices. It scopes the board's tools to each
*agent-panel origin* within one tab. Per-person scoping across devices is done by which party the
session is authenticated as, and by which iframe that device loads. Claiming otherwise in the
submission would be caught by judges who wrote this spec.

**API keys.** Each agent panel runs its loop in the browser and the repo must be public, so no key
can live in client code. One Netlify Function per side proxies to that side's provider,
rate-limited, key server-side. Day-1 work.

## 7. The WebMCP surface

```js
// A rule's authorisation and a tool's existence are the same fact.
// There is no unregisterTool() in the spec — a tool is withdrawn by aborting
// the AbortSignal it was registered with. That is the only withdrawal path.

const ruleAbort = new Map();   // ruleId -> AbortController

async function activateRule(rule) {
  const ac = new AbortController();
  ruleAbort.set(rule.id, ac);

  for (const toolDef of rule.authorises) {
    await document.modelContext.registerTool({
      name: toolDef.name,
      title: toolDef.title,
      description: `${toolDef.description} (authorised by rule ${rule.id} v${rule.version})`,
      inputSchema: toolDef.schema,
      annotations: { readOnlyHint: toolDef.readOnly, untrustedContentHint: true },
      execute: async (input) => recordMove(rule, toolDef, input)
    }, { signal: ac.signal, exposedTo: [rule.side] });   // side = that party's agent origin
  }
}

function supersedeRule(ruleId) {
  ruleAbort.get(ruleId).abort();   // every tool that rule authorised vanishes from the map
}
```

| Primitive | Load-bearing use |
|---|---|
| `registerTool` + `signal` | A rule's lifetime **is** an AbortController. Superseding a rule withdraws its tools |
| `exposedTo` | A side's tools are visible only to that side's agent origin |
| `getTools({fromOrigins})` | Each panel discovers what its own side may currently do |
| `executeTool` | The record drives a panel's agent; runs in that panel's context |
| `toolchange` | Both panels re-read their capability the instant a rule version lands |
| `readOnlyHint` | On every read tool. Chrome surfaces this in its UI as "N read, M write" |
| `untrustedContentHint` | **On every tool returning counterparty-authored text.** This is the one idea where one agent reads text the *opposing* agent wrote — the spec's named output-injection attack, live, between adversarial parties |

**Deployment constraints:** origin isolation required (`Origin-Agent-Cluster`, killed by `?0`);
`Permissions-Policy: tools`; `allow="tools"` on both iframes; **GitHub Pages disqualified** (no
header control); Netlify, Vercel, Cloudflare and Render all work. Tool names ≤128 chars,
`[A-Za-z0-9_.-]`. **No annotation vocabulary exists for authorisation, cost or reversibility** —
that state lives in the page, not the declaration. Saying so in the write-up reads as spec
fluency; it is a genuine gap.

## 8. The 60-second demo spine

Opens on the object. The thesis goes in the written explanation where it costs nothing.

| Time | On screen |
|---|---|
| 0:00–0:10 | Two windows, side by side. Client and contractor, each with their own agent. "They have an agreement. Both agents can only do what the agreement currently allows." |
| 0:10–0:25 | Contractor's agent delivers. Move #7 lands, stamped **under rule set v2**. |
| 0:25–0:40 | Client adds a rule: deliverables must include tests. Rule set goes **v3**. **On camera, the contractor's agent gains a new tool** — `attach_tests` appears in its list. |
| 0:40–0:55 | **The turn.** The client tries to apply the new rule to move #7. The record refuses: at 14:03 the rule set was v2, and `attach_tests` **did not exist in the contractor's tool map.** Nothing to comply with. |
| 0:55–1:00 | "The rule and the tool are the same thing. If your agent never had the tool, you were never asked." |

The visible object is a tool appearing in someone else's agent, and a retroactive claim bouncing
off a timestamp. Neither is a dashboard, and neither is two chatbots haggling — which was the
original Board's worst failure mode.

## 9. Scope

**In:**

- One agreement type: a freelance milestone. Deliver → review window → accept → release.
- Rule set with versioning, and the tool registry driven off it.
- Two agent panels on two origins, two devices, live sync.
- The retroactive-claim refusal — this is the product, not a feature.
- `untrustedContentHint` on every counterparty-text tool, plus one on-camera injection attempt
  that fails.

**Out:**

- Real money. The "release payment" step is recorded, not settled. Unlike Quorum, this design's
  drama does not need an irreversible external effect — the refusal *is* the payoff.
- Any second agreement type.
- Accounts, persistence beyond a session, mobile.
- Targeting ChatGPT's in-app browser for the agent panels. Its cross-origin and `toolchange`
  behaviour is undocumented. Film in Chrome with `chrome://flags/#enable-webmcp-testing`, a test
  path the challenge brief names itself.

## 10. Plan

| Day | Deliverable | Gate |
|---|---|---|
| **0** | **Spike.** 30 lines: register a tool, abort it, re-register. Chrome+flag, and the Model Context Tool Inspector extension. Does the agent see the change mid-task? | The 0:25–0:40 beat is the whole video. **Nothing starts until this answers.** |
| 1 | Three origins on Netlify, headers verified, `allow="tools"` working, one board tool visible to one panel via `fromOrigins` | Cross-origin scoping works in Chrome |
| 2 | Rule model + version history + tool registry driven off active rules | Activating a rule makes tools appear |
| 3 | Two agent panels, two providers, key proxies, live sync between two devices | Two browsers, one record |
| 4 | The refusal engine: moves stamped with rule version; retroactive claims rejected with the reason | The 0:40 beat works |
| 5 | Injection hardening + the on-camera attempt that fails | `untrustedContentHint` demonstrably doing work |
| 6 | Polish, README, licence visible in repo About | Requirements met |
| 7 | Video, written explanation, submit | **Submit Sep 2**, not Sep 3 |

## 11. Risks

| Risk | Cost | Mitigation |
|---|---|---|
| `toolchange` not honoured mid-task | The 0:25 beat is invisible; video has no payoff | Day-0 spike. Fallback: in-page agents whose refresh we control |
| Two-device demo is hard to film | The theme advantage evaporates on camera | Rehearse as two windows on one screen, both real sessions. Never fake it as one page with two panes and claim two devices |
| Judges read it as authz + audit log | Rule 3 and Creativity both drop | Lead the write-up with capability-absence, not permission-denial. The agent saying "I have no tool for that" is the distinction made concrete |
| "Two agents haggling" impression | The original Board's fatal flaw returns | The agents never negotiate. They act; the record refuses. Keep dialogue out of the demo |
| Both agents are the same model with two prompts | "Each brings their own agent" is a claim, not a fact | Two providers, shown on screen. Borrowed directly from Quorum's seat-independence rule |
| Live dispute becomes public | Forecloses an outstanding request; permanent after Sep 2 | **Name nothing.** §3's naming rule is binding on every artefact |
| Field growing: 586 → 727 in one working day | Odds decay daily | Ship early |

## 12. Submission checklist

- [ ] Live public URL, reachable, or credentials on the form
- [ ] Public repo, **open-source licence detectable in the About section** — an explicit rule
- [ ] `<3:00` public YouTube demo, with audio
- [ ] Written explanation: WebMCP fit, UX gain, what humans and agents can now do together that
      they couldn't, how WebMCP was implemented
- [ ] `document.modelContext.registerTool({...})` visible in the repo — named in the rules
- [ ] **No organisation, amount, event or counterparty named anywhere**
- [ ] Submitted **Sep 2**

## 13. Open decisions

1. **Name.** *As Agreed* is warm and states the claim. *Terms* is plainer and scans faster in a
   gallery. Cheap now, expensive after the video.
2. **Agreement type.** Freelance milestone is the recommendation — universal, legible in eight
   seconds, no terms-of-service exposure. A contest or bounty is closer to the source experience
   and should be **avoided**: too identifying, and it would be shown to hackathon organisers.
3. **Does this replace Quorum, or absorb it?** The seat-independence rule (two agents from one
   provider count as one) is Quorum's best idea and drops straight into §11 here. Worth deciding
   whether that is a borrow or a merge.

## 14. What this does not do, and what I am unsure about

- **It is ungraded.** Quorum's 12.3/16 is a measurement from three blind adversarial graders.
  This document has no such number, and my own scoring of my own reframe is precisely the bias
  this session has been correcting for. Do not compare the two on my say-so.
- It does not verify that the judges' agent honours `toolchange` mid-task. The day-0 spike exists
  only to answer that, and it gates both designs equally.
- It does not solve the two-device filming problem. It names it as the top execution risk.
- Rule 3 is a 1, honestly. If a reviewer wants to argue it to 2, the argument has to be that
  capability-absence differs in kind from permission-denial — and that argument is contestable.
- The original landlord–tenant version scored 9–13/16 across three graders, weakest on rules 1 and
  6. The claim that this reframe fixes both is **an argument I am making, not a result I measured.**
