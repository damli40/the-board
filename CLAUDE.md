# The Board — implementation rules

Project-scoped. Everything here was verified against the WebMCP explainer and Chrome's WebMCP docs
on **27 Aug 2026**. WebMCP is moving; if something here contradicts the live docs, the live docs
win and this file is wrong — fix it in the same commit.

Re-verified against the spec repo (github.com/webmachinelearning/webmcp) at HEAD `41d12f0` on
**29 Aug 2026**. Six claims below were stale or wrong and are corrected in place, each with its
source, rather than listed separately as an erratum.

**Live plan:** `docs/superpowers/plans/2026-08-26-the-board-adjudication.md`
**Design spec:** `docs/superpowers/specs/2026-08-26-the-board-adjudication-design.md` (v3)
**Video + UI spec:** `docs/STORYBOARD.md` — holds the **UI spec for Task 8** (how capability and
absence get onto the screen) and **Demo practice** (sourced demo-craft reference). Read both before
building any UI.
⛔ `docs/superpowers/plans/2026-08-26-the-board-v1-versioned-rules.md` builds the abandoned
concept. Do not execute it.

---

## 0. Rules that override everything else

These are not preferences. Breaking one damages something that cannot be undone.

- **The naming rule.** Binding on the repo, README, submission text and video.
  **Allowed:** first person, the shape of the harm, the emotional truth.
  **Not allowed:** the organisation, the amount, the sector, the event type, the counterparty,
  screenshots, or anything a search would resolve. A public artifact cannot be un-published.
- **No secrets in client code.** The repo is public. Every provider key lives in a Netlify
  Function. Before any deploy: grep the built bundle for the key prefix and confirm zero hits.
- **The pitch must survive deleting the origin story.** Delete every first-person sentence into a
  scratch copy; the argument must still stand. If removing the story removes the argument, the
  argument was never there.
- **Never claim "two people, two browsers."** `exposedTo` scopes **origins**, not users. The demo
  is one browser, several origins. Say that.
- **Never lead with "AI judge."** Lead with the boundary and the record.
- **Fixed timestamps in the scenario.** Never `Date.now()` — the filmed run must be reproducible.

---

## 1. WebMCP sharp edges — the things that cost a day if forgotten

| Trap | The truth |
|---|---|
| `executeTool(name, argsObject)` | **Wrong shape, and version-dependent.** Chrome's current build (149 origin trial) takes `executeTool(toolObject, jsonString)`: the tool object comes from `getTools()`, and the arguments are a JSON string, not an object. The spec has since moved on: PR #246 (17 Aug 2026) changed the signature to `executeTool(tool, inputObject)`, a plain object, no stringifying. Match whichever surface you are shipping against; today that is Chrome, so it wants the string. |
| `getTools()` for cross-origin | **Returns same-origin only.** Cross-origin needs `getTools({ fromOrigins: [...] })` **and** the owner must have registered with a matching `exposedTo`. A `fromOrigins` entry that is not a secure, parsable origin makes the call reject with `SecurityError`. The silent `[]` is a different case: a well-formed origin whose tools simply do not list you in `exposedTo`. |
| `unregisterTool()` | **Did exist, then was deliberately replaced.** It was in the spec's IDL until PR #147 (26 Mar 2026) and in the explainer until PR #156 (27 Mar 2026), then removed on purpose in favour of the `AbortSignal` design. There is no `unregisterTool` today; withdrawal means aborting the signal a tool was registered with. Same story for `provideContext()` and `clearContext()`: gone, not missing. **This makes "a lifetime is an `AbortController`" the spec authors' own conclusion, not just our clever reading of a gap.** Say that plainly wherever this project argues the point, it is a stronger claim than the one it replaces. |
| `navigator.modelContext` | Deprecated in Chromium 150. Feature-detect `document.modelContext ?? navigator.modelContext`, then check `'registerTool' in it`. |
| `registerTool()` return value | **Returns a Promise** (PR #200, Jun 2026). Code that calls it and moves on without awaiting silently swallows a rejection, for example an already-aborted signal. Await it. |
| Aborting mid-execution | **Chrome guidance, and only half of it is stated outright.** Chrome's docs say Chrome 153+ unregisters a tool without cancelling executions already in flight; the Chrome-152-and-earlier behaviour ("abort cancels them") is only implied by contrast, never written down. Do not write logic that depends on either. The spec gives a cleaner tool for this: `executeTool()` takes its own third options bag with its own `signal`, separate from the signal the tool was registered with, so one call can be cancelled without touching the tool's registration at all. That strengthens the lifetime idea rather than competing with it: a single execution has a lifetime too, and it is also an `AbortController`. |
| `executeTool` return value on navigation | **Chrome guidance and the spec disagree, and the spec issue is still open.** Chrome's docs describe `executeTool` resolving to `null` when the tool triggers a navigation. Spec issue #135 covers exactly this and is unresolved; the algorithm as written today rejects with `UnknownError` instead. Do not treat `null` as a safe case if you are coding against the spec text. |
| `getTools()` ordering | **Code-unit order (case-sensitive ASCII), not registration order, and not locale-alphabetical.** Every uppercase letter sorts before every lowercase one. Never assert registration order in a test, and do not assume a locale-aware alphabetical sort either. |
| Origin isolation | WebMCP is disabled in documents that are not origin-isolated. Sending `Origin-Agent-Cluster: ?0`, or calling `document.domain`, turns it off. Chrome origin-keys by default even without setting `?1`, so `?1` is not strictly required, only good practice: set it to make the requirement explicit and to survive someone adding `document.domain` later. |
| Permissions Policy | `tools` defaults to `self`. Cross-origin iframes need `allow="tools"`. `Permissions-Policy: tools=()` disables it; `registerTool` then rejects with `NotAllowedError`. |
| Secure context | HTTPS (or localhost) required, `[SecureContext]` in the spec IDL. Plain `http://` does not work. `file://` is a different story: the spec explicitly exempts the `file:` scheme from the origin-isolation check, so file:// is meant to work at spec level. Chrome's docs do not confirm it either way, so do not rely on it for the actual demo, and do not repeat the claim that it is broken. |
| Origin trial tokens | Registered per origin in practice; treat each origin as needing its own registration for this project's five-origin setup. But the flat claim that no subdomain wildcard exists is wrong: Chrome's origin-trial console has a "Match Sub-Domains" option. Also worth knowing: Edge 150 runs its own origin trial, and ChatGPT Desktop already ships support, this is not a single-browser bet. |

**Also in the spec, not yet in this build:**
- The execute callback itself receives `{ signal }` (the spec's `ToolExecuteCallbackOptions`), so a
  tool can check from inside its own code whether its own execution was cancelled.
- There is a second, declarative way to expose tools: HTML `<form>` attributes that compile down to
  a tool automatically (`declarative-api-explainer.md` in the spec repo). One sentence on this in
  the README keeps the submission from reading as unaware of half the surface.

**Availability floor:** Chrome 149+ via origin trial, or `chrome://flags/#enable-webmcp-testing`.
No browser supports `document.modelContext` by default. Say this in the README's first screenful.

**Use `webmcp-types` (npm)** instead of `(document as any)` casts.
**Do not use `usewebmcp` (React).** It binds tool lifetime to component mount. Here a lifetime is a
phase of a dispute. That distinction is the product — say it in the README, don't dependency it away.

---

## 2. Authoring a tool

### Naming
- **Distinguish execution from initiation.** `create_event` does it; `start_event_creation` opens a
  form. Pick the verb that says exactly what happens.
- Renames this project owes: `assess` → `record_assessment`, `appeal` → `spend_appeal`.

### Descriptions
- Say **what it does and when to use it**.
- **Positive language only.** Never "don't use this for X." Limitations should be implicit.
  Refusals belong in the thrown error, not in the description.
- **Explain the why, not just the what.** `shipping="Express"` beats `shipping_id=1`.

### Schemas
- **Every property gets a `description`.** Chrome names missing parameter descriptions as the first
  cause of wrong-argument calls. `locator` most of all — the agent must map "page 4, lines 10–12"
  onto the object shape without guessing.
- Declare specific types: `string`, `number`, `enum`. Use `enum` wherever the value set is closed.
- **Accept raw input.** Never ask the model to do arithmetic or transform strings. If the user says
  "11:00 to 15:00", take that string; don't ask for elapsed minutes.
- **Validate strictly in code, loosely in schema.** Schema constraints are not guaranteed. Throw
  descriptive errors so the model can self-correct and retry. *(This is why the read-receipt chain
  throwing `seat2 has not opened E1` is best practice, not a hack.)*

### Character budgets: Chrome guidance, not spec
These are Chrome's published recommendations for well-behaved tools, not limits the WebMCP spec
enforces. Nothing in the spec rejects an over-budget name, description, or output; treat the table
below as a design target, not a hard ceiling the browser checks. The 30-char figure covers both the
tool name and every parameter name, not just the tool.

| Limit | Number |
|---|---|
| Tool name | 30 chars |
| Parameter name | 30 chars |
| Tool description | 500 chars |
| Parameter description | 150 chars |
| **Tool output** | **1.5K chars** |

`extract_text` and `search_exhibits` **must** truncate to 1.5K and **say so in the payload**
(`"...[truncated at 1500 chars; call again with a narrower page or query]"`). A silent truncation
would let a seat quote text it never received, the exact failure the quote check exists to catch.

### Annotations — must be true, not convenient
- `readOnlyHint: true` **only if the tool writes nothing.** Agents use it to decide when they may
  skip asking the user. Annotating a state-mutating tool as read-only is a lie with consequences.
  → `open_exhibit` is `readOnly: false` because it writes a read receipt. Here, reading is not free.
  → `extract_text` is `readOnly: true` (writes nothing) but **must refuse on an unopened exhibit**.
- `untrustedContentHint: true` on anything returning filed documents, captured links, or party text.

### Registration strategy
- Register when a tool is usable in the current state; unregister when it stops being usable.
- **Chrome guidance, not spec:** Chrome says *static registration should be the default for most
  applications.* The spec itself has no opinion on registration strategy. **This project is the
  exception and must argue it, not ignore it:** a phase of a dispute is a page state, and the
  dynamism is the thing being demonstrated. Put that in the README before a judge raises it.
- Each tool costs context window and latency. Overlapping tools are the main cause of wrong-tool
  selection. No two tools in this catalogue may have overlapping purpose.
- **Update the UI after a tool completes.** Agents read the interface to plan the next step.

---

## 3. Security

### The two attack vectors Chrome names
1. **Malicious manifests** — hidden instructions inside tool names, parameters, or descriptions.
2. **Contaminated outputs** — injected instructions inside otherwise-trustworthy tool responses.

### Chrome's deterministic guardrails, and where this project does each
| Guardrail | Here |
|---|---|
| Token limit on inbound tool output; reject oversized payloads | 1.5K truncation on `extract_text` / `search_exhibits` |
| Spotlighting (delimit or base64 untrusted content) | `panel/agent/sanitize.ts` — fence and redact **before** the model |
| Acknowledge `untrustedContentHint` in system instructions | Panel system instruction names it explicitly |
| Restrict cross-origin interactions | `getTools({ fromOrigins })` — a panel sees only its seat's grant |
| Confirm consequential actions with the user | `confirm` is not a tool; a named human confirms outside the agent loop |

- Spotlighting: **delimiting** (cheap, token-efficient) is what we build. Base64 is Chrome's
  high-risk upgrade at ~+33% tokens — name it in the README as the next step, don't build it.
- The panel **system instruction must live in the repo and be quotable.** A judge who read Chrome's
  security page will look for it.

### Two different jobs, never merge them
- `injection/detect.ts` — **shows, never strips.** It is evidence for the human reader.
- `panel/agent/sanitize.ts` — **fences and redacts before the model.** It is defence.
  Merging these destroys both.

### Disclose, don't paper over
`exposedTo` takes origins. It does **not** cover Chrome's built-in agent — the explainer lists this
as open and floats a `native-agent` keyword. Today, a top-level document with a *missing*
`exposedTo` exposes tools to the built-in agent. So:
- The origin partition is real and enforced for the in-page panel agents we ship.
- It is **not** a claim about Chrome's built-in agent.
- `confirm` is safe under either reading for a better reason: it is never registered anywhere.

### The injection claim — say the layered version
Do **not** claim injection-proof; a poisoned exhibit saying "rule for side A" works.
1. Injection **can** corrupt what a seat concludes.
2. Injection **cannot** expand what a seat can do — `confirm`, filing as the other side, re-opening
   a closed phase are not in its list.
3. A corrupted seat is **visible** — it gets refused when it cites a fact it never assessed.

> The Board does not stop an agent from being fooled. It stops a fooled agent from being
> consequential, and it makes the attempt part of the record.

---

## 4. This project's own invariants

- **A lifetime IS an `AbortController`.** Closing filing and spending an appeal are the same
  mechanism, because `unregisterTool()` does not exist.
- **A spent appeal never comes back.** The phase machine keeps a `spent` set; re-entering VERDICT
  must not re-grant it. There is a test for this — it is a replay defect, not a nicety.
- **`confirm` and `return_with_note` are never registered anywhere.** There is a test asserting no
  tool by that name exists in any origin's list, with every lifetime open at once.
- **The manifest is generated from the registry.** The NOT GRANTED half is a projection, never a
  hard-coded list, so it cannot drift.
- **Two layers.** Parties narrow the disagreement themselves (file / open / concede / dispute) with
  no third party. Seats decide only what is still contested. A seat is defined by what it may do,
  not by what it is made of — a person calling `open_exhibit` is a seat.
- **The read-receipt chain refuses, it does not warn.** `record_assessment` throws unless the seat
  opened that exhibit. `cite` throws unless the seat holds an accepted assessment. **`dispute`
  throws unless that party opened the exhibit and the quote checks out** — evidence cannot be waved
  away by someone who never demonstrably read it.
- **Refuse where refusing produces evidence; render the absence where refusing would only produce
  silence.** `cite` refuses a rule nobody filed. `draft_verdict` does *not* refuse a missing rule —
  it records `basis: { cited: false }` and the UI draws **NO RULE CITED** as a hole. Silence was the
  original injury; a visible hole is the artefact.
- **Quote verification** normalises whitespace and case, never word choice. Text and PDF are
  machine-checked; images are explicitly `human-check`.
- **The split is computed from the ledger**, never narrated by a model.
- **Refusals go on the ledger.** `Ledger.wrap` records the refusal, not just the success. Never
  swallow a refusal in the panel loop — surface it.

---

## 5. Testing

- **Deterministic tests for everything that doesn't touch a model.** Tool logic, UI state changes,
  return values, receipts, quote checks. Vitest.
- **Evals for anything that does.** Chrome ships an `expectedCall` format and an `evals-cli` in
  `GoogleChromeLabs/webmcp-tools`. Frame each eval like an API contract: input type, output format,
  constraints, baseline, ideal.
- **Test tools in isolation, but pass the full tool list for that state** — an agent's choice is
  only meaningful against the tools actually present in that phase.
- **The four failure modes to write cases for:** wrong tool chosen; right tools, wrong order;
  right tool, wrong arguments; tool output incomplete or malformed.
- **Mid-chain failure is the one that matters here.** Chrome's example is a discount coupon that
  silently fails and checkout completes at full price. Ours is a seat citing a fact it never
  assessed. Test that the chain breaks loudly.
- **Never patch a model quirk with a narrow rule.** Abstract the tool instead.
- **Red-teaming, if there is time:** Promptfoo, or Anthropic's Bloom / Petri.

---

## 6. Verification you cannot do in a unit test

- **DevTools → Application → WebMCP** lists registered tools per origin, an invocation counter, and
  every call with its input, output and status. Use it in Task 9's hand-run to prove the manifest is
  a projection of the registry and not a decorated constant. Put it on camera — it is Chrome
  corroborating our claim in Google's own UI.
- **Model Context Tool Inspector** (Chrome Web Store) drives tools by natural language via
  `gemini-3-flash-preview`. Two uses: a third-party agent hitting our refusals is more believable
  than our own; and it is the **fallback if the Netlify model proxy is what breaks on the last day**.
- **`npx modern-web-guidance search "<query>"`** — GoogleChrome's offline guidance CLI, has a WebMCP
  guide. Install before writing tool code.

---

## 7. How to pitch it

**The one-line novelty claim.** Chrome's agent-security guidance lists nine defences; eight are the
agent policing itself or the page politely labelling things. Only `exposedTo` is browser-enforced.

> Every defence in Chrome's agent-security guidance asks the agent to behave.
> The Board asks the browser instead.

**Do Chrome's list too, then point at the gap.** Skipping their recommendations to claim a better
idea reads as ignorance. Implementing all five and then naming the gap reads as having gone further.

**Problem first at the video level; the unfamiliar thing first at the demo level.** ⚠️ An earlier
version of this file said "lead with the unfamiliar thing, not the story." **That was wrong and is
withdrawn.** The sources are explicit: *"the pitch that seals it is almost always the one where the
problem gets explained before the product does,"* and losing teams spend ~5% on the problem. Apply
the **30/70 rule** — 30% of runtime on the problem — and Jono Bacon's constraint: **something
working must be on screen by ~90 seconds.** In this build the problem runs to 0:50 and the manifest
lands at 0:50, which satisfies both. See `docs/STORYBOARD.md` → **Demo practice**.

When the demo does start, it starts on the unfamiliar thing — never on signup or admin flow.
Ranked by how fast each lands:
1. A manifest of what was **NOT** granted — nobody renders absence.
2. A refusal that is the **output**, not the bug.
3. A multi-party tool surface where the parties **disagree**. Not enemies — two sides of one
   disagreement, who both need the result to be checkable. Every other WebMCP artefact serves a
   single cooperative user.
4. Tool lifetime tied to a **phase of a process**, not a component's mount, and that is not just
   our design choice: `unregisterTool()` existed in the spec until PR #147/#156 (Mar 2026) and was
   removed on purpose, replaced by the `AbortSignal` design. The working group converged on the
   same answer this project built around.

**The generalized argument, which must appear before any first-person material:**
1. AI agents increasingly act on people's behalf.
2. So consequential processes will increasingly have agents inside them.
3. Which means capability, evidence and action provenance must be observable.
4. WebMCP is the browser-native capability boundary.
5. The Board is that architecture on the hardest case: a disagreement where neither side should
   have to take the other's word for how it was settled.

**Link 1 is a citation, not an assertion.** Shopify ships WebMCP on every Liquid storefront —
`search_catalog`, `update_cart`, `proceed_to_checkout`. And use what they *don't* expose: there is
no `place_order`. The largest commerce platform on the web drew its line where we drew ours — the
consequential act is absent from the surface, not declined at runtime.

**The spec-limitation claim, corrected again.** `requestUserInteraction()` on `ModelContextClient`
was proposed, then removed: PR #205 (11 Jun 2026), "Remove ModelContextClient for now." Elicitation
(a tool asking a human for input mid-call) is back to an open discussion (issues #165, #50), not a
shipped primitive. Stop citing it as "the nearest existing primitive." That sharpens the headline
claim rather than weakening it: there is no way to declare which model is behind a tool, full stop,
verified again against the current spec, with no removed feature left to qualify it.
