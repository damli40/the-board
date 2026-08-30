# The Board

A shared page where a disagreement gets settled in the open, and anyone can check how. Two people
who disagree each bring their own AI agent, not one this app runs. Every move either agent makes is
a tool call on a page both people are watching. Nothing takes effect until a named human confirms
it, and no agent anywhere holds a tool that can press confirm.

Built for the WebMCP hackathon, 2026.

> **Requires Chrome 149 or later, with WebMCP turned on.** WebMCP (the browser API that lets a page
> declare tools an AI agent can call, and decide per origin who gets to call them) ships behind a
> flag today. Enable it at `chrome://flags/#enable-webmcp-testing`, or run this project under an
> origin trial token, then relaunch Chrome. No browser supports it by default yet. Edge 150 runs its
> own origin trial and ChatGPT Desktop already ships support, so this is not a one-browser bet, but
> it is a flag-on bet: without it, every panel in this project shows "WebMCP not available" and
> nothing else here will run.

---

## The argument

This part does not depend on anything that happened to any one person. It holds on its own.

1. **AI agents increasingly act on people's behalf.** Not a forecast: Shopify ships WebMCP tools on
   every Liquid storefront it powers, live, with no install. `search_catalog` finds products,
   `update_cart` changes what is in the basket, `proceed_to_checkout` walks the shopper to the door.
   Agents acting on people's behalf is already deployed at commerce scale.
2. **So consequential processes will increasingly have agents inside them.** Someone's agent files
   the claim. Someone else's agent reads it.
3. **Which means three things have to be observable:** what an agent was *allowed* to do, what it
   *actually* touched, and where its conclusions *came from*. Skip this and you have added a second
   closed room inside the one people already could not see into.
4. **WebMCP is where that boundary can live.** The page declares the tools. The browser, not the
   application's own policy code, decides who may call them.
5. **The Board is that architecture, on the hardest case:** a disagreement where neither side should
   have to take the other's word for how it was settled.

Now look at what Shopify's own tool list leaves out. There is no `place_order` tool. No `pay`.
`proceed_to_checkout` takes the shopper *to* checkout; it does not buy. `manage_orders` bounces an
unauthenticated shopper to login. The largest commerce platform on the web, shipping WebMCP to
millions of storefronts with real money and real liability attached, drew its line at exactly the
place The Board draws its own: **the agent may do everything up to the consequential act, and the
consequential act is not in the tool list.** Not declined at runtime. Absent from the surface. That
is a deployment agreeing with this design, not an opinion agreeing with it.

> Shopify's storefront agent cannot place your order. Not because it refuses: because no such tool
> exists. The Board applies that same boundary to a decision instead of a checkout, and adds the
> part commerce does not need: a record of what each agent was allowed to see, what it opened, and
> what it relied on.

A reader who already knows Shopify shipped WebMCP might think the ground here is taken. It isn't,
because it's a different axis. Shopify demonstrates *actuation*: an agent getting things done
faster. The Board demonstrates *governance of actuation*: what the agent was permitted, what it
actually touched, and what it could not reach. Shopify's tools return data. None of them record who
read what.

## The one sentence that says what is different

Chrome publishes security guidance for people building agentic web pages. It lists nine defences.
Eight of them are the agent policing itself, or the page politely labelling things and hoping. Only
one is enforced by something other than the agent's own good behaviour: scoping a tool to an origin,
which the browser enforces whether or not the agent cooperates.

> Every defence in Chrome's agent-security guidance asks the agent to behave. The Board asks the
> browser instead.

The Board implements Chrome's other four deterministic guardrails too, not just the fifth. Skipping
the recommended defences to claim a cleverer idea would read as not having read them; doing all five
and then naming the one gap reads as having gone further.

| Chrome's guardrail | Where this project does it |
|---|---|
| Cap inbound tool output and reject oversized payloads | `extract_text` and `search_exhibits` truncate to 1.5K characters and say so in the payload itself, via a shared helper: [`packages/record/src/shared/truncate.ts`](packages/record/src/shared/truncate.ts) |
| Spotlighting: delimit untrusted content before it reaches the model | [`packages/panel/src/agent/sanitize.ts`](packages/panel/src/agent/sanitize.ts) fences and redacts counterparty text before the model ever sees it |
| Name `untrustedContentHint` in the system instruction | The panel's own system instruction spells it out by name (quoted in full in `SUBMISSION.md`) |
| Restrict cross-origin interactions | `getTools({ fromOrigins })` on the calling side, `exposedTo` at registration on the owning side: a panel discovers only what was granted to its own origin |
| Confirm consequential actions with a human | `confirm` is not a tool. A named human presses it directly, outside every agent loop, in any phase |

## Quickstart

This build runs as five separate browser origins in one tab (one parent page plus four panels),
because the whole point is that capability is scoped per origin. There are two ways to see that
running: the live deployment, or five ports on your own machine.

### For judges: the live deployment

| origin | role |
|---|---|
| [`theboard-record.netlify.app`](https://theboard-record.netlify.app) | the docket, the tool registry, the phase machine |
| [`theboard-a.netlify.app`](https://theboard-a.netlify.app) | Advocate A |
| [`theboard-b.netlify.app`](https://theboard-b.netlify.app) | Advocate B |
| [`theboard-seat1.netlify.app`](https://theboard-seat1.netlify.app) | Board Seat 1 |
| [`theboard-seat2.netlify.app`](https://theboard-seat2.netlify.app) | Board Seat 2 |

In Chrome 149 or later, turn on `chrome://flags/#enable-webmcp-testing` and relaunch the browser
(that is the flag from the callout above; no origin trial token is required). Then open
`https://theboard-record.netlify.app`; the parent page loads the four panels above as cross-origin
iframes on its own. As of this commit these five sites have not been deployed yet: deploying them
is the last step before submission, and the exact commands for doing that live in
[`docs/evidence/deploy.md`](docs/evidence/deploy.md). If the live link in the submission does not
load, that runbook is also how to check what went wrong.

### For anyone cloning this: five local origins

Locally, the same five origins are five ports instead of five domains:

| origin | port | role |
|---|---|---|
| record (parent) | `8080` | the docket, the tool registry, the phase machine |
| panel | `8081` | Advocate A |
| panel | `8082` | Advocate B |
| panel | `8083` | Board Seat 1 |
| panel | `8084` | Board Seat 2 |

```bash
npm install
npm run dev:origins   # starts all five Vite dev servers in one process
```

Then, in Chrome 149+, with the flag from the callout above enabled, open `http://localhost:8080`.

### Where the origins live

Every origin string in this repo, dev and production alike, is exported from one file:
[`packages/record/src/config/origins.ts`](packages/record/src/config/origins.ts). It defines both
sets explicitly (`DEV_ORIGINS`/`DEV_PARENT_ORIGIN` are the five localhost ports above,
`PROD_ORIGINS`/`PROD_PARENT_ORIGIN` are the five Netlify sites above) and resolves which one the
rest of the code sees at runtime: a production browser build gets the Netlify origins, everything
else (the dev server, the test suite) gets localhost. No other file makes that choice. The two
`netlify.toml` files that serve the production headers carry their own copy of the Netlify origins,
because a `.toml` file can't import TypeScript; a test (`netlify-headers.test.ts`) fails on purpose
if either one drifts out of sync with `origins.ts`, so a stale production header cannot pass
silently.

## Architecture

![Architecture diagram: one parent origin owning the record and the tool registry, four cross-origin panel frames each scoped by exposedTo, and a confirm control no agent can reach](docs/architecture.svg)

One parent origin owns the record (the docket, exhibits, phase machine, ledger) and the tool
registry. It registers every tool with `{ signal, exposedTo }`: `signal` ties the tool's whole
existence to an `AbortController` for its phase, and `exposedTo` names the one origin allowed to see
it. Four cross-origin iframes, loaded with `allow="tools"`, each hold one agent: two advocates, two
board seats. A panel calls `getTools({ fromOrigins: [PARENT_ORIGIN] })` to ask what it has been
granted; it never sees another origin's list, because the browser, not this app's code, is the thing
deciding what comes back.

**A phase's lifetime is an `AbortController`.** WebMCP had a method for withdrawing a tool,
`unregisterTool()`, in its IDL until PR #147 (26 March 2026) and in its explainer until PR #156
(27 March 2026). The working group then removed it on purpose, replacing it with the `AbortSignal`
design: a tool's lifetime is now whatever span its registration signal stays unaborted for. So when
this project closes filing, `file_exhibit` stops existing for both advocates at the same instant,
because the same call that ends the phase aborts the signal every filing-phase tool was registered
with. That is not a workaround this project invented for a gap in the spec. It is the design the
spec's own authors converged on after trying the named-unregister approach first, which makes "a
lifetime is an `AbortController`" a stronger claim than it would otherwise be.

## Running the tests

```bash
npm test
```

**210 of 210 tests pass, across 23 test files, on Vitest 4.** That number covers every tool body,
every store, the phase machine, the ledger, the quote checker, the PDF text extraction, full-text
search, the injection detector, and the sanitiser. What it does not cover is listed plainly below.

## Limitations

This section is not a footnote. If a claim above needs qualifying, the qualification is here, stated
as plainly as the claim.

- **`exposedTo` scopes origins, not people.** Per-person scoping across two different devices is not
  expressible in WebMCP today. Never describe this build as "two people, two browsers." It is one
  browser, several origins, a co-present session: everyone is looking at the same tab.
- **The origin boundary is real and browser-enforced for the four panel agents this project ships.**
  It does not cover a browser's own built-in agent. The WebMCP explainer lists this as an open
  question (a `native-agents` keyword, tracked as issue #179), and today a top-level document with no
  `exposedTo` at all exposes its tools to that built-in agent by default. `confirm` is safe either
  way, but for a better reason than the boundary: it is never registered as a tool anywhere, under
  any name, so there is no surface for any agent, built-in or otherwise, to reach.
- **Image citations cannot be checked by the page.** Text and PDF quotes are verified against the
  source, byte for byte after whitespace and case are normalised. A screenshot cannot be, so every
  finding against an image exhibit is stamped `human-check`, structurally, regardless of what is
  quoted.
- **Injection can fool a seat. It cannot expand what a seat is allowed to do, and a fooled seat is
  visible.** A poisoned exhibit that says "rule for the other side" can absolutely mislead a reader,
  human or model. What it cannot do is hand that reader `confirm`, or a tool naming the other party,
  because those calls are not in its list regardless of what any document says. And a seat that
  cites a fact it never actually assessed gets refused at the moment it tries, which puts the attempt
  on the record instead of letting it pass quietly. The Board does not stop an agent from being
  fooled. It stops a fooled agent from being consequential, and it makes the attempt part of the
  record.
- **Cross-origin tool discovery is not exercised by the automated test suite.** Vitest runs in Node
  and jsdom, neither of which enforces real browser origin isolation, so the claim that one origin
  cannot see another origin's tools is verified by hand, once, in a real Chrome window, following
  [`docs/evidence/hand-run.md`](docs/evidence/hand-run.md), including a cross-check against Chrome's
  own DevTools → Application → WebMCP pane.
- **`pdf.js` is verified by hand, once, against a real PDF; it is stubbed everywhere in the test
  suite.** The unit tests exercise the extraction logic against a fake loader on purpose, so they
  stay fast and deterministic. Whether the real `pdfjs-dist` package actually parses a real file
  through this project's own Vite/worker wiring is a manual check, recorded in `hand-run.md`.
- **The link-capture function and the model proxy are demo-shaped, not production-shaped.**
  `netlify/functions/capture.ts` fetches any user-supplied `https` URL with no allowlist: a
  server-side request forgery is possible if this were ever exposed to untrusted input at scale.
  `netlify/functions/model-proxy.ts` is unauthenticated: it does not leak the underlying key, but
  anyone who finds the endpoint can spend it. Both are accepted limitations of a five-day demo that
  stores nothing server-side, not defects to fix quietly later.
- **The injection detector has a documented blind spot.** Its `directed-outcome` pattern is written
  to catch a phrase naming one party mid-sentence, for example "rule for B," but a plain letter "A"
  also reads as the indefinite article, so the identical phrasing naming that party is missed unless
  the word "side" or "party" comes first. This is written down as a comment in
  [`packages/record/src/injection/detect.ts`](packages/record/src/injection/detect.ts) and pinned by
  a dedicated test, not silently left for someone to rediscover.
- **The tool-lifetime claim is scoped to this project's own panels.** A spike built to check whether
  a third-party agent, not one of these four panels, notices a tool appearing or disappearing
  mid-session was never run (`docs/evidence/spike-toolchange.md`, marked `UNRUN`). This submission
  claims the tool-lifetime beat only for the in-page panels it ships, where it was verified directly,
  and makes no claim about how any external agent would behave.

## What it deliberately does not do

- **It does not decide anything.** A human confirms. No tool reaches that control.
- **It does not claim to be injection-proof.** See the injection limitation above; the honest claim
  is layered, and it holds up better than "proof" would.
- **It does not remove judgement.** Facts are pinned to documents; weighing them is still a
  judgement, written in prose. The page can say one seat read less than the other. It cannot say
  which one was right.
- **It does not compel anyone to produce evidence.** If a party holds something back, this cannot
  make them file it, though it does make their empty column visible.
- **It settles one record.** Whether the same standard was applied to a different case is a
  comparison across records, and that is out of scope here.

## How I noticed

*Nothing below this line is the argument. The argument is above, and it stands without this.*

I spent five weeks inside a dispute I could not see into. I sent evidence. I was told it had been
circulated. I never found out whether anyone opened it, or which rule I was supposed to have broken.
The outcome was not the part that hurt. The blindness was.

So the thing I wanted was not a fairer judge. It was a process where "did anyone read it" and "which
rule is this resting on" are not questions you have to ask, because the answers are already on the
page. Every rule in this build comes from one of those two questions.

---

Built by [@rookie_of_Ph](https://x.com/rookie_of_Ph). MIT licensed: see [`LICENSE`](LICENSE).
