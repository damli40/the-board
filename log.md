# Build log — The Board

What happened, in order, with the reasoning attached. Newest section last.

**Branch:** `build/the-board` (cut from `main`, which had no remote)
**State at last entry:** 293 tests passing across 26 files, `tsc --noEmit` clean, both packages build clean
**Not yet done:** the rest of the design port, submission artefacts, video, and every step that needs a public deploy

---

## How this was built

Eleven tasks from `docs/superpowers/plans/2026-08-26-the-board-adjudication.md`, each one:

1. written test-first, with the failing test run and watched to fail before any implementation
2. reviewed by a separate agent whose instruction was to make the code fail, not to confirm it looked fine
3. re-reviewed after every fix round, scoped to the fix diff only

Every decision taken without asking is recorded as a ruling with what it costs if wrong. The full ledger, including the review findings verbatim, is in `.superpowers/sdd/2026-08-26-the-board-adjudication/progress.md`.

The method earned its cost. Every defect that mattered in this build passed its tests, returned a plausible value, and was wrong. None of them crashed.

---

## Before any code: the plan conflict scan

Read the plan end to end and checked every task against every other task that shared a file or an interface. Nineteen problems, several of which would have stopped the build.

- **The tool renames contradicted their own tests.** The plan orders `assess` to become `record_assessment` and `appeal` to become `spend_appeal`, then ships eleven assertions naming the old ones.
- **Two compile errors.** `receipts.ts` used the `Actor` type without importing it. `loop.ts` read `ORIGIN.parent`, which does not exist.
- **`VerdictStore` was constructed with two arguments and needed four.** Resolving which rule a verdict rests on means walking fact to exhibit to kind, which needs two stores it was never handed.
- **A test asserted a falsehood.** The injection detector returns two flags on the plan's own example, not one.
- **The injection defence was never called.** `sanitizeCounterpartyText` was written, tested, and then the panel handed raw tool output to the model anyway.
- **The UI tests could not run.** They render JSX and use `toHaveTextContent`; nothing configured jsdom, the React plugin, or jest-dom. Tailwind classes were used throughout and Tailwind was never installed.

Thirteen rulings resolved these before Task 1. All are in the ledger.

**Origins.** The plan assumed a domain that was not owned. Decided with the project owner: five localhost ports, driven from one config file (`packages/record/src/config/origins.ts`), so moving to real domains is a single edit. Ports are 8080 record, 8081 and 8082 advocates, 8083 and 8084 seats. `localhost` counts as a secure context, so WebMCP works without HTTPS locally.

---

## Task 1 — skeleton, five origins, licence
`a5230aa`, `e71fd9d`, fix `d33107b`

Workspaces, vitest wired for both node and jsdom, Tailwind v4, MIT licence, both `netlify.toml` files, and a five-origin local dev server. All five ports verified serving `Origin-Agent-Cluster: ?1` and the right `Permissions-Policy`.

**Review found:** the two `vite.config.ts` files hardcoded the origin strings instead of importing them, so a production swap meant editing five files rather than one, and a stale port would have passed every test while `registerTool` threw `NotAllowedError`. The typecheck also silently skipped the one new file the navigator fix depended on.

**Fixed by** deriving both configs from `origins.ts` and adding a test that reads both `netlify.toml` files and compares them against the live import. Proven to catch drift by mutating a port and watching it fail.

**Worth knowing:** Node 25's `navigator` global is getter-only, so the plan's verbatim test line throws under strict-mode ESM. Handled in `vitest.setup.node.ts`.

---

## Task 2 — exhibits and facts
`5e30896`, fix `177a55c`

Shared types, an exhibit store that hashes content, and a fact store where a fact points into a document at a page or line range.

**Review found:** `Fact.disputeId` was declared and nothing could set it. Because `get()` hands out live references, the only route a later task had was direct mutation, which also made `status = 'disputed'` reachable without the self-dealing check, the read check, or the quote check.

**Fixed by** adding a guarded `attachDispute` so the dispute tool has a legitimate path. Deliberately did not deep-copy the stores: the plan's own code mutates in place and every consumer reads through the same store in one page.

---

## Task 3 — the quote check and the read-receipt chain
`a145078`, fix `a5b4e25`

The thesis in code. A fabricated citation is what an AI reading a document gets wrong, and it is the one error a human reader cannot catch by reading. The page cannot judge whether reasoning is good. It can prove whether the sentence exists.

Whitespace and case are normalised. Word choice is not. Tolerating changed words would turn an exact proof into a resemblance test.

**Ruled during the build:** the unverifiable branch keys off `kind === 'image'`, not `text === null`. As written, a PDF whose extraction produced nothing would have been reported to the reader as an image, which is a confident false statement about the record.

**Review found:** `DisputeStore` threw one hardcoded message for every failure. A dispute citing page 9 of a two-page exhibit was told to fix its quote, when the quote check had correctly said the page does not exist.

---

## Task 4 — a lifetime is an AbortController
`8fe936f`

The WebMCP spine. There is no way to unregister a tool, so a tool is withdrawn by aborting the signal it was registered with. Closing the filing window and spending an appeal become the same mechanism.

Both renames applied, with the eleven stale assertions corrected. Every schema property got a description under 150 characters, plus a test asserting Chrome's published budgets.

**Review passed it clean** after hand-tracing three things rather than trusting the tests: the doubly-registered `open_exhibit` cannot leak between parties and seats, re-entering a phase does not churn registrations, and a spent appeal genuinely never returns because the spent set is consulted on every entry.

---

## Task 5 — what the page lends
`ceb3d30`, fix `7577b8e`

An agent cannot parse a PDF. The page can. One dependency powers the extraction tool, makes the quote check work on PDFs, and feeds search.

**Ruled:** the 1.5K output truncation is required and must announce itself. A silent truncation would let a seat quote text it never received, which is the exact failure the quote check exists to catch. The guard would have been manufacturing the bug it defends against.

**Review found** something the tests could not see: search only lowercased, while the quote check also collapses whitespace. Since pdf.js emits fragments that already carry spacing, real extracted text has doubled spaces, so a phrase genuinely on the page would verify as a quote and return nothing from search. Fixed by importing the same normaliser rather than writing a second one.

**Correction to my own instruction:** I specified cutting the body to 1500 and appending the notice after, giving about 1570. If Chrome truncates at 1500 on top of that, it clips the notice whose whole job is to make truncation loud. Corrected so the total including the notice is 1500.

---

## Task 6 — verdict, split, and a confirm no agent can reach
`5f00117`

The split is computed from the ledger, never narrated by a model. When two seats disagree, the page says why from the record: which exhibits each opened, how many calls each made.

The deliberate asymmetry: `cite` refuses a fact the seat never assessed, because refusing sends the seat to go and read and the read lands on the record. `draft_verdict` does not refuse a missing rule, because refusing there produces only silence, and silence was the original injury. It records the absence and the page draws it as a hole.

**Review passed it clean,** having traced every path through the basis resolution to confirm the draft cannot throw, and confirmed the split cannot report agreement when the outcomes differ.

---

## Task 7 — injection defence
`9ddbc38`, fixes `26b4180`, `1094e1d`, `85a2e74`

Two files, two opposite jobs. `injection/detect.ts` runs on the record page and shows without ever stripping, because scrubbing evidence would rebuild the black box. `panel/agent/sanitize.ts` fences and redacts, because that string is about to reach a model.

**Review found a Critical.** The fence could be escaped. The strip ran once and never re-read its own output, so a payload nesting one closing tag inside another had the inner tag removed and the surviving halves rejoined into a fresh one. The injected instruction ended up outside the fence, where a model reads it as trusted. The docstring promised this could not happen and the test only ever tried one flat tag.

Fixed by stripping to a fixed point with an invariant that throws. Verified by attacking it with the original payload, the opening-tag mirror, triple nesting, thousand-layer nesting, and both interleavings.

**Three rounds on one regex.** The detector flagged ordinary contract language, because "a" is also an indefinite article and "the rule for a late delivery" is not an attack. Tightening it introduced a worse problem: it caught a directive naming one party and missed the identical sentence naming the other. A per-party blind spot in a project about even-handed treatment. My own instruction caused it. What remains is documented in the file and pinned by a test rather than left quiet.

---

## Spec conformance audit
`bd61437`

The project's rules file says the live spec wins over anything written down. Audited all 21 WebMCP claims against the working group's repository at `41d12f0`. Six were wrong.

- **`unregisterTool` did exist.** It was in the IDL until March 2026, then deliberately replaced by the AbortSignal design. This makes the central idea stronger, not weaker: it is the working group's own conclusion rather than a clever reading of a gap.
- **The call signature moved** to a plain object eleven days before this build began. Chrome's shipping build still takes a JSON string. Both stated.
- **`requestUserInteraction()` was removed** from the spec. It had been cited in two documents as the nearest existing primitive for human confirmation. That sentence would have shipped false.
- Deleted the claim that `file://` fails, since the spec exempts it. Deleted the claim that origin trials have no subdomain wildcard. Softened the origin-isolation header claim.

Also documented three affordances the project had missed, including that `registerTool` returns a promise and that a single execution carries its own cancellation signal, which strengthens the lifetime idea rather than competing with it.

---

## Task 8 — the board UI and the panel loop
`d846812`, fix `65fdbd9`

Six components from the storyboard, in a dark forensic console: near-black, monospace, one accent per actor. The manifest renders both halves from one registry call, so the withheld column cannot drift from the truth.

**Review found a Critical that every test passed.** The board was frozen while agents acted. A cross-origin tool execution mutates the ledger inside the record page, and nothing told the page to re-render. The ledger tape, specified as a live scroll, plus the call counts and the hand chips, all stayed stale until a human clicked. So during the refusal beat the whole project leads with, the screen would have shown nothing. The file's own comment claimed every mutation path refreshed, which was true of every path in that file and wrong for the one that mattered, because it lived elsewhere.

**And a guard that would have switched itself off.** The sanitiser fenced content only when Chrome echoed an annotation the tests mocked as present. If the real browser omitted it, the defence disabled silently while the submission claimed to implement it. Now it fails closed: it sanitises unless told explicitly not to.

The exhibit store also reported success when its write had failed, and a rejected database open was cached, bricking storage for the session.

**Worth recording:** this task declined to act on a mid-task instruction of mine because it arrived through a channel that looked like an injection. That was the right instinct on a message changing a security-relevant call shape, and the instruction was re-sent through a verifiable path.

---

## Task 9 — the scenario, wired end to end
`34cc5f8`, fix `c7c842f`

Tool bodies connected to the stores, and the fixed fixture the video films. Fixed ids, fixed timestamps, so every take starts identical.

**Two changes beyond the brief, both correct.** The tool-call signature was widened so a body learns which actor is calling from the origin the registry bound at registration, never from its own arguments. This is the most security-relevant change in the build, and review confirmed it: origin is closed over at registration, no body reads a side or seat from its arguments, and an adversarial test has one origin claim to be the other and still file as itself. Separately, spending an appeal never actually reopened the review phase, which nothing had wired.

**Review caught two things that would have failed on camera.** The storyboard scripted the climax overlay naming exhibit E2, while the fixture files the PDF as E1 and the poisoned document as E2. Filming to script would have put text on screen contradicting the table beside it, and named the injection exhibit as the cause of the split. The storyboard's injection beat also quoted a line containing no word the detector matches, so it would have shown one flag where the narration claims two.

**A correction to something I stated.** I checked for clock reads with a grep for `Date.now` and reported the tool bodies clean. Review found `new Date().toISOString()` in the filing body, which that pattern misses. The fixture is clean, so the filmed scenario is reproducible, but a live-filed exhibit varies per take. The clock is now injectable.

---

## Open items

**Needs a browser, so it needs you.**
- The hand-run in `docs/evidence/hand-run.md`. Per-step pass and fail conditions, the two steps that must refuse rather than warn, the DevTools cross-check that shows Chrome corroborating the withheld-tools claim in Google's own UI, and the pdf.js verification. Every existing test stubs the PDF loader, so this is the only check that it works in a browser.
- The tool-lifetime spike, `spike/toolchange.html` and `docs/evidence/spike-toolchange.md`. Marked UNRUN. Until it runs, the video claims the lifetime beat only for the panels shipped here and claims nothing about a third-party agent.

**Not started.** Submission artefacts and the video.

**Deliberately not done.** No repository published, nothing pushed, nothing deployed. Publishing is irreversible and the naming rule makes it more so.

---

## Known limitations

Recorded here so they are not discovered later.

- Tool scoping covers origins, not people. Per-person scoping across devices is not expressible today. This is one browser and several origins in a co-present session, never two people at two machines.
- The origin partition is real and browser-enforced for the agents shipped here. It does not cover a browser's own built-in agent, which the working group lists as open. The confirm control is safe under either reading for a better reason: it is never registered anywhere.
- Image citations cannot be machine-checked and are stamped for a human.
- Cross-origin enforcement is verified by hand, not in the suite.
- ~~The model proxy is unauthenticated.~~ **Fixed 30 Aug**: room code required, fails closed without `ROOM_CODE`, per-container rate limit. The real spend ceiling belongs at the provider.
- The link capture still has no allowlist. Hardened 30 Aug (manual redirects, 2MB cap, 10s timeout, private/loopback refused); a hostname that resolves to a private address still gets through.
- The injection detector catches a directive naming party B mid-clause but misses the same phrasing naming party A unless a qualifying word precedes it. Documented in the file and pinned by tests.
- Injection can still corrupt what a seat concludes. It cannot expand what a seat can do, and a corrupted seat is visible the moment it cites something it never assessed.

---

## Session, 30–31 August 2026: security, testability, and making the page readable by an agent

Six commits after the build was already reviewed. Each one started from something that ran fine and returned a plausible answer.

### The model proxy was an open endpoint on the owner's account

`model-proxy` accepted any POST from anyone. `parsePanelRequest` only `JSON.parse`d and cast, so a caller supplied `system` and `messages` and they went straight to the Messages API on `MODEL_API_KEY`. Deployed with a funded key that is a free Opus endpoint, four times over — one per panel site.

It read as safe only because the account had no credit. That is a property of the billing state, not of the code, and "top up the account" was the first item on the handoff. The fix had to land before the top-up, not after.

`packages/panel/src/proxy/gate.ts` now holds three checks, and the comments are careful about which is which:

- `checkRoomCode` is the one that holds. It **fails closed** when `ROOM_CODE` is unset, so a deploy that forgets the variable refuses everything loudly rather than quietly reopening the hole.
- `checkOrigin` is defence in depth and says so. A missing `Origin` is allowed on purpose: rejecting it would break non-browser clients and stop no attacker, because the caller it cannot stop is the one sending no `Origin` at all.
- `checkRate` is per container. Netlify runs many, so N containers enforce N × limit. It bounds a runaway client. **It is not a global ceiling and must never be written up as one.** The real ceiling is a spend limit set at the provider, because a stateless function has no consistent view of spend.

Its own test caught a bug in it: the window was anchored to the epoch, because an empty state's `windowStart: 0` meant the first call only counted as fresh once `now >= windowMs`. With a real `Date.now()` that is always true, so it was correct in production and wrong for any small clock — including every test that drives one.

`capture.ts` was the same shape, smaller. It fetched any HTTPS URL with `redirect: 'follow'`, no size cap, no timeout. Following redirects meant the HTTPS-only check only ever applied to the *first* URL: a public link that 302s somewhere internal walked past it. Now manual redirects, a 2MB cap, a 10s timeout, and private and loopback literals refused.

The room code rides the link. The record passes its own `?code=` down to each panel iframe and the panel sends `x-room-code`, so a judge opens one URL and types nothing. A code in a URL lands in history and referrers; accepted for a shared demo code and written down rather than glossed.

### Offline mode, because the demo had never been run

Locally there is no `/.netlify/functions/model-proxy` — Vite does not serve it — so pressing Run had only ever produced a 404. No live provider call has ever succeeded in this project. The running, refused and not-granted states had never been seen outside a test, and were on course to be exercised for the first time on camera.

`?offline=1` scripts **only the decision** a model would make. Everything after it is real: calls go through `getTools({fromOrigins})` to the browser, the browser enforces `exposedTo`, the record executes them, refusals are genuine refusals. If the boundary were broken, this mode would show it broken.

It is opt-in and never inferred from a failed fetch. Falling back automatically would let a misconfigured production deploy serve a scripted demo while looking live, which is the one failure this project must not have.

Arguments come from the record, not the script. Exhibit and fact ids are generated by `loadScenario`, never literals, so the record broadcasts the ids it actually created. Invented ids would be exactly the failure this project cannot ship: a plausible-looking run that proves nothing.

Running it caught a defect in the script itself. It drove `concede` on the one fact the record hands down, which for Advocate A is A's own fact. The record refused correctly, but the panel rendered the browser's generic "invocation failed" text, which reads as a crash rather than as a rule. Whether `concede` is legal depends on which side filed the fact and the script is not told, so it was removed rather than shown wrong.

Verified in Chrome: both advocates ran `open_exhibit` and `file_fact`, counters moved, the ledger filled, and the two goal lines landed 7ms apart — the double-prompt claim demonstrated rather than asserted.

### The design pass, and what was wrong with it

Read `The Board.dc.html` out of the Claude Design project. Its data is fabricated and it said so itself: the repo was never readable on its side. `read_case_file`, `quote_check` and `submit_argument` do not exist in this registry, and it hands `extract_text` to Advocate A when the real registry gives it to seats only — a boundary that does not exist. The visual system and the copy were ported; the data comes from `ToolRegistry.manifest()`.

The manifest is now **one list, not two columns**: every tool in the registry once, marked handed over (filled disc) or not (hollow ring), both marks still from one registry call. The merge is not a restyle. It dissolves the measured layout budget — the GRANTED table needed 180px inside a 157px column, roughly 15% over — because a full-width list gives each name the whole column.

Colour is never the only signal. The two states differ by shape before anything else, and withheld rows keep their screen-reader text.

Dark mode became a token layer, dark by default, light honoured when the machine asks. Fixed while doing it: `body` was never painted. It resolved `rgba(0,0,0,0)` with black text and the dark ground came from a wrapper, so anywhere the wrapper did not reach the browser's own white showed through.

### The visiting agent

Every one of the 14 tools was registered `exposedTo: [one panel origin]`. The mechanism was there and the page had simply never registered anything for a visitor, so an agent driving it from outside held nothing and could only scrape pixels.

`OBSERVER_TOOLS` registers `read_board` **without** `exposedTo`, which §4 already documented as the seam. One call returns the whole page as structured data. Two rules keep the widest registration in the codebase safe, both enforced by tests that fail if either breaks: read-only always, and it appears in the manifest. An unmanifested capability is the exact lie this project exists to prevent, so the visiting agent publishes its own grant and the 14 things it does not hold.

The double was taught the rule too, or it would have been more permissive than the browser again — the same class of gap that once let 253 tests pass over two agents holding nothing.

**Two Chrome facts, found by running it, now in §2:**

- `executeTool`'s input must be a JSON **string**. An object rejects with `Failed to parse input arguments`.
- `getTools()` called in the page's **own** context returns the origin-scoped tools too, not just the unscoped one. `exposedTo` filters cross-origin frames; it does not hide a document's own tools from script in that document. So "the visiting agent holds only `read_board`" would be an **overclaim** — this is §4's warning made concrete. `confirm` is unaffected for the reason it always was: registered nowhere, to no one.

### Also this session

The NotebookLM research on AI chat and agent interfaces was read and folded into the design brief and the design system (`docs/design/04-notebooklm-synthesis.md`). It corrected two things I had written: the refusal treatment was specified vaguely, and the brief had no accessibility in it at all, which matters because four live transcripts on one page is the hard case. It also carries the argument *against* this product's basic shape, stated at full strength, with where it lands and where it misses.
