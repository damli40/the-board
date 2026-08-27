# The Board — implementation rules

Project-scoped. Everything here was verified against the WebMCP explainer and Chrome's WebMCP docs
on **27 Aug 2026**. WebMCP is moving; if something here contradicts the live docs, the live docs
win and this file is wrong — fix it in the same commit.

**Live plan:** `docs/superpowers/plans/2026-08-26-the-board-adjudication.md`
**Design spec:** `docs/superpowers/specs/2026-08-26-the-board-adjudication-design.md`
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
| `executeTool(name, argsObject)` | **Wrong.** Chrome takes `executeTool(toolObject, jsonString)`. The tool object comes from `getTools()`. An object for args stringifies to `[object Object]` and the tool receives nothing. |
| `getTools()` for cross-origin | **Returns same-origin only.** Cross-origin needs `getTools({ fromOrigins: [...] })` **and** the owner must have registered with a matching `exposedTo`. Both, or you silently get `[]`. |
| `unregisterTool()` | **Does not exist.** Never has. Register with `{ signal }` and abort the signal. Same for `provideContext()` and `clearContext()`. |
| `navigator.modelContext` | Deprecated in Chromium 150. Feature-detect `document.modelContext ?? navigator.modelContext`, then check `'registerTool' in it`. |
| Aborting mid-execution | Chrome ≤152: abort cancels in-flight executions. **Chrome 153+: unregisters without cancelling them.** Do not write logic that depends on either. |
| `executeTool` return value | Resolves to **`null`** when the tool triggers a navigation. `null` is not an error. |
| `getTools()` ordering | **Alphabetical**, not registration order. Never assert registration order in a test or render the manifest assuming it. |
| Origin isolation | WebMCP is disabled in documents that are not origin-isolated. `Origin-Agent-Cluster: ?0` kills it. Set `?1`. |
| Permissions Policy | `tools` defaults to `self`. Cross-origin iframes need `allow="tools"`. `Permissions-Policy: tools=()` disables it; `registerTool` then rejects with `NotAllowedError`. |
| Secure context | HTTPS required. `file://` and plain `http://` do not work. |
| **Origin trial tokens are per-origin** | Five origins = five registrations. No subdomain wildcard. A judge without the flag sees a dead page unless every origin has its own token. |

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

### Character budgets — Chrome's published numbers
| Limit | Number |
|---|---|
| Tool name | 30 chars |
| Parameter name | 30 chars |
| Tool description | 500 chars |
| Parameter description | 150 chars |
| **Tool output** | **1.5K chars** |

`extract_text` and `search_exhibits` **must** truncate to 1.5K and **say so in the payload**
(`"...[truncated at 1500 chars; call again with a narrower page or query]"`). A silent truncation
would let a seat quote text it never received — the exact failure the quote check exists to catch.

### Annotations — must be true, not convenient
- `readOnlyHint: true` **only if the tool writes nothing.** Agents use it to decide when they may
  skip asking the user. Annotating a state-mutating tool as read-only is a lie with consequences.
  → `open_exhibit` is `readOnly: false` because it writes a read receipt. Here, reading is not free.
  → `extract_text` is `readOnly: true` (writes nothing) but **must refuse on an unopened exhibit**.
- `untrustedContentHint: true` on anything returning filed documents, captured links, or party text.

### Registration strategy
- Register when a tool is usable in the current state; unregister when it stops being usable.
- Chrome says *static registration should be the default for most applications.* **This project is
  the exception and must argue it, not ignore it:** a phase of a dispute is a page state, and the
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

**Lead with the unfamiliar thing, not the story.** Ranked by how fast it lands:
1. A manifest of what was **NOT** granted — nobody renders absence.
2. A refusal that is the **output**, not the bug.
3. A multi-party tool surface where the parties **disagree**. Not enemies — two sides of one
   disagreement, who both need the result to be checkable. Every other WebMCP artefact serves a
   single cooperative user.
4. Tool lifetime tied to a **phase of a process**, not a component's mount.

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

**Correct the spec-limitation claim.** The draft spec now has `requestUserInteraction()` on
`ModelContextClient`. The provenance-annotation gap still stands; "the spec says nothing about human
confirmation" does not. Cite it and say what it doesn't do: it authorises one call, it does not
record who authorised it.
