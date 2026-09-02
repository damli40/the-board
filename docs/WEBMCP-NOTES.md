# WebMCP notes: what cost a day, and what Chrome's guidance asks for

These are the project's working notes on the WebMCP API, published because the source comments
cite them by section. Section numbers match the comments (`docs/WEBMCP-NOTES.md §1` and so on).

Verified against the WebMCP explainer and Chrome's WebMCP docs on 27 Aug 2026; re-verified against
the spec repo (github.com/webmachinelearning/webmcp) at HEAD `41d12f0` on 29 Aug 2026; a third pass
on 31 Aug 2026 against Chrome's three live guidance pages
([build-tools](https://developer.chrome.com/docs/ai/webmcp/build-tools), [agent security](https://developer.chrome.com/docs/agents/security), [secure-tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools)) and the reference demo at
`webmcp-demo-sdras.netlify.app`. WebMCP is moving. Where this file and the live docs disagree, the
live docs win, with one tiebreak: Chrome's doc pages lag the spec repo (`secure-tools` was last
updated 1 Jul 2026 and still describes a feature removed on 11 Jun), so Chrome wins on Chrome's
behaviour and recommendations, and the spec repo wins on what the spec contains.

---

## 1. WebMCP sharp edges — the things that cost a day if forgotten

| Trap | The truth |
|---|---|
| `executeTool(name, argsObject)` | **Wrong shape, and version-dependent.** Chrome's current build (149 origin trial) takes `executeTool(toolObject, jsonString)`: the tool object comes from `getTools()`, and the arguments are a JSON string, not an object. The spec has since moved on: PR #246 (17 Aug 2026) changed the signature to `executeTool(tool, inputObject)`, a plain object, no stringifying. Match whichever surface you are shipping against; today that is Chrome, so it wants the string. |
| `executeTool(tool, input)` | **`input` must be a JSON STRING, not an object.** `executeTool(t, {})` and `executeTool(t, undefined)` both reject with `UnknownError: Failed to parse input arguments`; `executeTool(t, '{}')` resolves. Verified in Chrome, 31 Aug 2026. |
| `getTools()` from the page's OWN context | **Returns every tool the document registered, including origin-scoped ones.** Calling it in the record's top-level context returned `a__file_exhibit`, `b__concede` and the rest alongside the unscoped `read_board`. `exposedTo` filters what a CROSS-ORIGIN frame receives via `fromOrigins`; it does not hide a document's own tools from script running in that document. Verified in Chrome, 31 Aug 2026. This is why the per-frame check in the README's Path C was owed: the record document sees everything it registered, so only a query from inside each frame proves the partition. |
| `getTools()` for cross-origin | **Returns same-origin only.** Cross-origin needs `getTools({ fromOrigins: [...] })` **and** the owner must have registered with a matching `exposedTo`. A `fromOrigins` entry that is not a secure, parsable origin makes the call reject with `SecurityError`. The silent `[]` is a different case: a well-formed origin whose tools simply do not list you in `exposedTo`. |
| `exposedTo` direction | **A grant is symmetric between the two origins, not downward-only.** Chrome: *"This exposes your tool to those origins when embedded on your site, and when your site is embedded on that origin."* Listing a seat origin in the record's `exposedTo` therefore also grants when the record is the frame being embedded. Never narrate this as the record "granting down into the panel" — it is a mutual grant between two origins: say two origins, not two levels. (`secure-tools`, fetched 31 Aug 2026) |
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
  the README mentions it, because it is half the surface.

**Availability floor:** Chrome 149+ via origin trial, or `chrome://flags/#enable-webmcp-testing`.
No browser supports `document.modelContext` by default.

**Use `webmcp-types` (npm)** instead of `(document as any)` casts.
**Do not use `usewebmcp` (React).** It binds tool lifetime to component mount. Here a lifetime is a
phase of a dispute. That distinction is the product, so this project does not depend it away.

---

## 2. Authoring a tool

### Naming
- **Distinguish execution from initiation.** `create_event` does it; `start_event_creation` opens a
  form. Pick the verb that says exactly what happens.
- **Set `title` on every tool.** It is a real descriptor field this file
  had not recorded — spec IDL, `ModelContextTool`: *"A string-or-null representing a human-readable
  title of the tool for use in user interfaces."* And the fallback is the problem: *"If
  ModelContextTool/title is not provided, the user agent is free to use a different value for
  display."* Neither Chrome page mentions the field; the reference demo sets it. **This is the
  field the browser's own UI shows.** The README's DevTools section shows DevTools, Application, WebMCP as
  Chrome corroborating our claim in Google's own UI, and with no `title` that panel renders
  `a__file_exhibit` — which reads as machine gibberish in the one shot where a stranger has to
  understand the surface at a glance. `title: "File an exhibit (Party A)"` costs one line per tool.
  (`index.bs` at `main`, read 31 Aug 2026)

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

### Refusal text: name the recovery, not just the failure
Chrome's build-tools page says a failed call *"should act as a guide rather than a dead end"* and
tells you to *"Always provide context-aware feedback to help the agent recover; avoid returning
generic error messages, raw API errors, or failing silently."* It names four failure categories and
the first one is ours exactly — **wrong state or missing prerequisites**. Look at the shape of its
worked messages: each is two halves, the state and then the next move. *"No flight search results
found. Search for flights first."* *"Order 123 has already shipped. Redirect the user to the returns
policy."*

**Every refusal in the chain now carries both halves:** `no such exhibit: E9; use an exhibit id
that was actually filed`, `seat1 holds no assessment for F1; call record_assessment for it first`.
The refusal is the artefact this project puts on screen and argues is the *output*, so a refusal
that tells the seat how to proceed is the difference between a dead end and a boundary that still
lets work happen. (`build-tools`, fetched 31 Aug 2026)

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
  dynamism is the point of the design.
- Each tool costs context window and latency. Overlapping tools are the main cause of wrong-tool
  selection. No two tools in this catalogue may have overlapping purpose.
- **Update the UI after a tool completes.** Agents read the interface to plan the next step.

---

## 3. Security

### The two attack vectors Chrome names
1. **Malicious manifests** — hidden instructions inside tool names, parameters, or descriptions.
2. **Contaminated outputs** — injected instructions inside otherwise-trustworthy tool responses.

### Chrome's guardrails, and where this project does each
⚠️ **An earlier version of this file put all five rows under one heading, "Chrome's deterministic
guardrails". That was wrong and is corrected here.** Chrome splits them. `Set deterministic
guardrails` names **four**, and spotlighting is filed separately under `Set probabilistic
guardrails` — *"To manage unpredictable outputs, implement spotlighting."* Getting this backwards
is exactly what a careful reader catches in one glance, and the mistake costs more than
the tidiness saved. The correct split also **helps** the README's 'one sentence' argument: Chrome's own taxonomy
concedes that only four of its defences are reproducible, and every one of the four is still the
agent restraining itself.

**Deterministic — Chrome's four, in its own list order:**
| Guardrail | Here |
|---|---|
| Set token limits; reject a payload over the limit | 1.5K truncation on `extract_text` / `search_exhibits` |
| Acknowledge the `untrustedContentHint` in system instructions | Panel system instruction names it explicitly |
| Restrict cross-origin interactions | `getTools({ fromOrigins })` — a panel sees only its seat's grant |
| Confirm actions with the user | `confirm` is not a tool; a named human confirms outside the agent loop |

**Probabilistic:**
| Guardrail | Here |
|---|---|
| Spotlighting (delimit or base64 untrusted content) | `panel/agent/sanitize.ts` — fence and redact **before** the model |

- Spotlighting: **delimiting** (cheap, token-efficient) is what we build. Base64 is Chrome's
  high-risk upgrade at about +33% tokens, so it stays a next step rather than a build.
- **Chrome scopes this guidance to this exact architecture.** Worth quoting, because
  it forecloses "you borrowed advice about a different problem": *"These recommendations apply to
  agents in a browser context (such as within a Chrome extension) and agents embedded in a
  cross-origin iframe."* The panels are the second case, by name.
- **Confirm-actions carries a default the panel loop must honour:** *"Assume WebMCP tools mutate
  state, unless the tool description or annotations (readOnlyHint) clearly state otherwise."* An
  unannotated tool is a writing tool. That is a second and independent reason `open_exhibit` sets
  `readOnly: false` explicitly rather than leaving the annotation off.
- **Attack vector 1 is not covered by either table, and never was.** Every row above defends
  against contaminated *outputs*. Nothing scans inbound tool *names and descriptions*, which is
  what a malicious manifest attacks, and Chrome does ask for it: *"Scan the page context and the
  tool descriptions exposed to the agent before any tool is executed."* This project does not scan. The reason
  instead of letting it read as an oversight: all five origins serve the same first-party registry,
  so every manifest a panel can see is one we generated — the defence is architectural, not a
  classifier. Then say the part that makes it honest: **that stops being true the moment a real
  third-party seat is added**, which is the first thing this design would need before anyone ran it
  for real.
- The panel **system instruction must live in the repo and be quotable.** Anyone who has read Chrome's
  security page will look for it.

### Two different jobs, never merge them
- `injection/detect.ts` — **shows, never strips.** It is evidence for the human reader.
- `panel/agent/sanitize.ts` — **fences and redacts before the model.** It is defence.
  Merging these destroys both.
- **We diverge from Chrome here on purpose, so carry the answer.** Chrome's classifier guidance
  says *"If your classifier detects any injection in the tool output, return an error to prevent
  the agent from seeing or acting on the malicious data."* We do not error — `detect.ts` shows and
  `sanitize.ts` fences. Erroring would delete the point: the attempt has to reach the record in
  order to become part of it. Chrome's advice protects the agent; ours protects the agent *and*
  keeps the evidence. Both are defensible, only one is this project's, and a reader of that page will
  ask which.

### Disclose, don't paper over
`exposedTo` takes origins. It does **not** cover Chrome's built-in agent — the explainer lists this
as open and floats a `native-agent` keyword. Today, a top-level document with a *missing*
`exposedTo` exposes tools to the built-in agent. So:
- The origin partition is real and enforced for the in-page panel agents we ship.
- It is **not** a claim about Chrome's built-in agent.
- `confirm` is safe under either reading for a better reason: it is never registered anywhere.

**There is a second hole, and Chrome documents it on both pages: extensions.** *"Chrome Extensions
can query and execute WebMCP tools using content scripts. With host_permission, those extensions can
manipulate the page by running custom JavaScript, even without WebMCP."* The partition binds page
script and cross-origin frames; it does not bind an extension the user installed. Two consequences,
and both land better said first than asked:
- The accurate boundary sentence is **"origin-scoped against other origins"**, never "origin-scoped,
  full stop." Anything holding host permission is inside — and was inside before WebMCP existed, so
  this is not a WebMCP regression, which is the half people forget to add.
- **We already depend on this.** The DevTools cross-check the README describes is precisely an
  extension querying and executing our tools from outside the partition. That is not an
  embarrassment to hide; it is why it works as a third-party witness. Both halves matter.

**Read-only is not the same as safe to expose.** Chrome makes this point separately from the
confirmation one: *"A read-only tool, such as getFavoriteProducts, can reveal information about a
user. You should only expose these tools to websites you would directly share this data with
otherwise."* Section 2 above treats `readOnlyHint` only as a confirmation signal; **exposure is a second,
independent axis**, and a tool can be honest on the first and dangerous on the second. The tool that
names here is **`read_board`** — unscoped, read-only, and it returns the case file. It is the single
place where the built-in-agent gap has real content behind it. So disclose the gap by pointing at
that tool, not in the abstract.

### The injection claim — say the layered version
Do **not** claim injection-proof; a poisoned exhibit saying "rule for side A" works.
1. Injection **can** corrupt what a seat concludes.
2. Injection **cannot** expand what a seat can do — `confirm`, filing as the other side, re-opening
   a closed phase are not in its list.
3. A corrupted seat is **visible** — it gets refused when it cites a fact it never assessed.

> The Board does not stop an agent from being fooled. It stops a fooled agent from being
> consequential, and it makes the attempt part of the record.
