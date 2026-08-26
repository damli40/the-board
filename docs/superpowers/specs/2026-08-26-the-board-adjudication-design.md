# The Board — open adjudication on a shared page

**Status:** DESIGN — supersedes `2026-08-26-the-board-design.md` (kept beside this as the record of
what changed and why).
**Date:** 2026-08-26
**Target:** OpenAI WebMCP Challenge · submit Sep 2 · hard deadline **Sep 3, 1:00pm PDT**

---

## 1. Where this came from

> In July I won a hackathon. In August the prize was taken back. Between those two things I spent
> five weeks not knowing what was happening.
>
> I sent evidence. I was told it had been circulated. I never found out whether anyone opened it. I
> never found out which rule I was supposed to have broken. There was no page I could look at, no
> state I could check, no way to tell the difference between *being carefully considered* and
> *sitting in someone's inbox*.
>
> The verdict was not the part that hurt. The blindness was.

Every mechanism in this document is a direct answer to one sentence in that paragraph. The section
headings below name which one.

🔒 **Naming rule — binding on the video, the repo, the README and the submission text.** The
underlying dispute is live and unresolved. Nothing public names the organisation, the amount, the
sector, the event type, the counterparty, or anything a search would resolve. First person and the
shape of the harm are allowed and are enough. See §15.

## 2. What it is

Two parties in a dispute. Each brings **their own AI advocate** — their ChatGPT, their Claude, not
one the platform runs. A board of two seats reads what has been filed and drafts a verdict. Every
move any agent makes is a tool call on a page both humans are watching, so the process *is* the
record.

The record shows not only what the board decided but **what it opened, what it searched for, what
it quoted, what it could not verify, and what it never read at all.**

Nothing takes effect until a named human confirms it. There is no tool that can press confirm.

## 3. Why this is a WebMCP product and not a website with an API key

This is the tie-break criterion — Devpost breaks ties on WebMCP Leverage — so it gets its own
section and an honest counterfactual.

**The counterfactual.** Build this without WebMCP and you get one server calling three models. But
an arbitration service that runs the AI on both sides **is the black box again, with better
branding.** You would be trusting their model, their prompt, their context window. The thing the
product exists to fix is reintroduced by the architecture.

WebMCP is the only way out:

| | plain MCP / a server | WebMCP |
|---|---|---|
| whose model argues for me | the platform's | **mine, attached to my frame** |
| who decides what each agent may do | the server, on trust | **the page, enforced by origin isolation** |
| what the human sees | a log, after the fact | the same surface the agent is acting on, live |
| proof an agent *couldn't* do something | a policy claim | **the tool was never in its list** |

Plain MCP is one client talking to one server. This is **several independently-owned clients acting
on one shared surface, with the surface controlling who may do what.** There is no other way to
express that.

## 4. Architecture

```
theboard.app                    the record — docket, exhibits, phases, verdicts
  ├─ <iframe allow="tools" src="a.theboard.app">        side A's advocate
  ├─ <iframe allow="tools" src="b.theboard.app">        side B's advocate
  ├─ <iframe allow="tools" src="seat1.theboard.app">    board seat 1
  └─ <iframe allow="tools" src="seat2.theboard.app">    board seat 2
```

Five origins. Each needs `Origin-Agent-Cluster: ?1` and
`Permissions-Policy: tools=(self "https://a.theboard.app" ...)`; each iframe needs `allow="tools"`.

⚠️ **Hosting.** Subdomains are separate origins — that is what makes the isolation real — but
Netlify serves one site per domain. This is **five Netlify sites**, not five paths on one. Confirm
day 1. GitHub Pages is disqualified outright: it cannot set headers.

### ⚡ Why each board seat gets its own origin

Caught in spec self-review, and it is load-bearing rather than tidy.

If both seats share one panel origin, `exposedTo: ['panel.theboard.app']` grants them **identical
tools**, and the ledger cannot tell their calls apart except by a seat id the seat reports about
itself. The split beat — *Seat 1 never called `extract_text`* — would then rest on a seat's own
account of what it did. A seat could claim a read it never performed, and the capability table
degrades from proof to assertion.

That is precisely the failure this build exists to remove, reappearing one level down. **Per-seat
origins make attribution structural: the browser, not the seat, decides whose call it was.** Cost is
one more Netlify site and one more header block.

**Separate origins are the security model, not tidiness.** `exposedTo` takes origins, so
`file_fact` for side A is registered only to `a.theboard.app`. Side B's agent does not *decline* to
file as A — the tool is not in its list. Same for the board: a seat can read, assess, cite and
draft. It cannot file evidence and it cannot confirm, because those tools do not exist in its
origin.

**Prompt injection cannot make an agent do a thing that is not in its tool list.** That is the
primary defence. Everything in §10 is defence in depth behind it.

**Scope: co-present, one tab.** Both parties at one table, settling something together. This is not
a cheat — `exposedTo` and `getTools({fromOrigins})` operate on a frame tree, and two people in two
browsers never share one. Under co-presence the primitive is honestly load-bearing rather than
stretched.

**API keys.** The repo is public and each panel runs its loop in the browser, so no key lives in
client code. One Netlify Function per origin proxies to that side's provider, key server-side,
rate-limited. Day 1.

## 5. The phase machine

*Answers: "no state I could check."*

```
FILING  →  REVIEW  →  VERDICT  →  CONFIRMED
```

A phase's lifetime **is** an `AbortController`. Advancing aborts the previous one and registers the
next phase's tools. `toolchange` fires and both panels update live.

| | side A | side B | each board seat |
|---|---|---|---|
| **FILING** | `file_exhibit` `file_fact` `concede` `dispute` | same | — |
| **REVIEW** | `object` | `object` | `open_exhibit` `extract_text` `search_exhibits` `assess` |
| **VERDICT** | `appeal` ×1 | `appeal` ×1 | `cite` `draft_verdict` |
| **CONFIRMED** | — | — | — |

Three overlapping lifetimes, not one per phase:

- `filingAbort` — dies when filing closes. **This is the visible beat:** `file_exhibit` and
  `file_fact` vanish from both panels at the same instant, and both humans watch it happen.
- `boardReadAbort` — born at REVIEW, lives through VERDICT, dies at CONFIRMED. A seat drafting a
  verdict can still re-open an exhibit.
- `appealAbort[side]` — born at VERDICT. **Spending an appeal aborts it,** so the card leaves your
  hand, visibly and permanently, while the other side still holds theirs.

REBUTTAL was cut as a separate phase. Conceding and disputing happen while filing is open, and a
counter-fact is just `file_fact` carrying a `counters:` pointer. Three phases instead of five is
also far easier to explain in thirty seconds of video.

## 6. Exhibits and facts are different objects

*Answers: "I sent evidence."*

**An exhibit is a document.** A file you attach, a link you capture, or pasted text.
**A fact is a claim that points into an exhibit**, at a page or a line range.

```js
Exhibit = {
  id, side, kind: 'text'|'pdf'|'image'|'capture',
  bytes,                     // IndexedDB, parent origin, ≤10MB
  text: string | null,       // extracted where possible — see §8
  sha256,                    // crypto.subtle.digest — identity is content
  sourceUrl?: string,
  captured?: 'proxy-fetch' | 'party-supplied',
  filedAt
}

Fact = {
  id, side, text,
  points: { exhibitId, locator: {page?, lines?} },
  status: 'unopposed' | 'conceded' | 'disputed',
  counters?: factId
}
```

Nothing is uploaded anywhere. Files are read with `FileReader`, held in IndexedDB in the parent
origin, rendered from blob URLs. For a dispute tool **"your evidence never leaves your machine"** is
a feature, not an apology for a missing server.

### Links are not exhibits — they are a way to make one

A link is a pointer to something the other party may control. It can change or vanish after it is
cited, which is disqualifying for evidence. So pasting a URL **captures** it: the bytes become a
frozen exhibit with a hash and a timestamp, and from that moment it behaves like any other exhibit.
The URL survives as metadata, not as the evidence.

The capture renders as **sanitised inert text — never a live frame, never script.** A live embed
would hand an adversary a script inside the record, and content that changes under the board while
it reads.

**How it was captured is part of the exhibit.** `proxy-fetch` means a ~20-line Netlify function
fetched the URL server-side, storing nothing — an *independent* capture. `party-supplied` means the
auth wall or a 403 won and the party pasted it in themselves. A seat weighing two conflicting
exhibits should know which is which.

*(The claim in §6 survives precisely: your files never leave your machine; a public URL you ask us
to capture is fetched by a function that keeps nothing.)*

**Out of scope, noted because it will be asked:** if a linked origin exposed WebMCP tools,
`getTools({fromOrigins})` only walks frames inside our own tab, so we would have to embed it live —
which is the drift and injection problem again. Not building it.

## 7. Assessment, and the quote the page can prove

*Answers: "I never found out whether anyone opened it."*

Between opening an exhibit and citing it, a seat records its working:

```js
assess(factId, exhibitId, locator, {
  finding: 'supported' | 'contradicted' | 'not-addressed' | 'cannot-tell',
  quote:   '<the exact span relied on>',
  because: '<one line>'
})
```

**Before an assessment is accepted, the page checks the quote is real** — that the span actually
appears in that exhibit at that locator. If it does not, `assess` refuses. Three lines of
`includes()`.

That matters because a fabricated citation is *the* characteristic failure of an AI reading
documents: the invented quote, the paragraph that says something the document does not. The page
cannot judge whether reasoning is good. It can prove whether the sentence exists. **The one class of
error a reader cannot catch by reading, the machine catches by construction.**

### Two read-receipt rules, enforced not logged

The chain is enforced end to end, each link refusing rather than warning:

1. `open_exhibit(id)` is a tool, so every read lands on the record with a timestamp.
2. **`assess(...)` throws unless that seat has opened that exhibit** in this case.
3. **`cite(factId)` throws unless that seat holds an accepted assessment for it.**

So a citation implies an assessment, an assessment implies a read, and a read implies a tool call on
the record. There is no path to a citation that skips a step.

A verdict therefore carries three lists: cited, opened, and **never opened**.

### What the page cannot verify, it says so

| exhibit | who reads it | page can verify the quote? |
|---|---|---|
| text · markdown · csv | the page | **yes** — exact substring |
| pdf | the page, via `pdf.js` | **yes** — exact substring |
| **image** | the model, vision | **no — human check. image rendered at the citation.** |

OCR was considered and rejected. Tesseract is 15MB of language data, it is slow, and if it misreads
`21:00` as `2l:00` the check now *fails on a true claim* while the extracted text quietly becomes
the record. That swaps "trust the model" for "trust the OCR" — still a black box, just a dumber one.

Instead an image reading is recorded as a **transcription**: its own object, labelled
model-produced, rendered beside the image itself. A verdict that says *"two of my three citations
are machine-checked; the third is my reading of a screenshot and you should look at it yourself"* is
more trustworthy than one claiming everything is verified.

**The honest system is the one that tells you which of its claims you still have to check.**

A transcription is challengeable, which folds into the appeal in §9 — *"I dispute the board's
reading of E5"* is a legal move.

## 8. What the page lends, and what it shows

*Answers: "I was told it had been circulated."*

### Lent capabilities — the page carries machinery the agent does not have

`extract_text(exhibitId, {page})` — the page owns `pdf.js`; the agent gets text back and never
parses a byte. This is WebMCP doing the thing it exists for. One dependency does three jobs: it
powers the tool, it makes §7's quote check work on PDFs, and it feeds search.

`search_exhibits(query)` — full-text across everything filed, returning hits with locators. Cheap
once the text exists, and it produces a quietly devastating record: *the board searched for
"byte-identical", got two hits, and opened neither.*

### The capability manifest is generated, never written

Per agent origin, the page renders granted tools, **not-granted tools**, and a live call count.

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

**The manifest is a projection of the tool registry** — `registered()` grouped by origin. The object
that displays the grant is the object that performs the grant, so there is no version of this that
drifts out of true. A hand-maintained manifest would be a lie waiting to happen.

The ledger is one recorder wrapped around `execute` — about ten lines, and nobody has to remember to
log.

**The NOT GRANTED half is doing real work.** It turns the security claim into something you can see
rather than something you are told: *the board could not have filed evidence.*

## 9. Verdict, split, appeal, confirm

```js
Verdict = { seat, outcome, cited: [factId], opened: [id], neverOpened: [id], reasoning }
```

Two seats rule independently. When they differ, the page shows **why**, computed from the ledger
rather than explained by a model:

```
                 SEAT 1    SEAT 2
extract_text          0         2
search_exhibits       0         3
open_exhibit          2         4

SEAT 1 → UPHELD       cited F1 F4        never opened E2
SEAT 2 → OVERTURNED   cited F1 F4 F7
                      ────────────────────────────
                      SPLIT · differing input: E2
```

Seat 1 never extracted the PDF. It ruled on the summary. **That is five weeks of "did anyone
actually read it" rendered as a table**, and it costs almost nothing because the registry already
holds the data.

**Human confirm.** The verdict is a *draft* with no force. `[ confirm ]` and `[ return with note ]`
are page-owned controls. **No tool reaches them, for any agent, in any phase.** This is also what
keeps "AI adjudication" from reading as reckless: the machine's job was never to decide, it was to
make the decision checkable.

**Appeal.** Each side holds exactly one, visible as a card. Spending it aborts its controller and it
leaves your hand. An appeal re-opens REVIEW; the board must re-open and re-cite, and the record
shows the second reading happened and what changed between drafts. An appeal may carry a pointer to
the assessment it contests — that is the "correct their reasoning" loop, folded into one mechanism
instead of two.

The cap is deliberate. One appeal each is the difference between a process and an infinite
relitigation.

## 10. Injection defence, in three layers

1. **Capability.** The tool is not there. §4. This is the one that actually holds.
2. **Spec-native.** Every exhibit and fact registers with
   `annotations: { untrustedContentHint: true }`. Counterparty text is never interpolated into a
   tool description or a system prompt — only passed as delimited, escaped data.
3. **Shown, not stripped.** Imperative patterns are flagged **on the page, in plain sight, with the
   raw text still readable.** Silently scrubbing would be the black box again; the whole thesis is
   that you get to see what happened.

The detector also runs over transcription output, because an injection can hide as text inside a
screenshot.

WebMCP names three risks by name — tool poisoning via descriptions, output injection via untrusted
content, misrepresentation of intent. This build answers all three, and demonstrating the attack is
the strongest beat in the video.

## 11. The WebMCP surface

```js
// A phase's lifetime IS an AbortController.
// The spec has no unregisterTool() — a tool is withdrawn by aborting the
// signal it was registered with.

const phaseAbort = new Map();          // phase -> AbortController

async function enterPhase(phase) {
  phaseAbort.get(previous)?.abort();   // filing closes -> file_fact ceases to exist
  const ac = new AbortController();
  phaseAbort.set(phase, ac);

  for (const [origin, tools] of GRANTS[phase]) {
    for (const t of tools) {
      await document.modelContext.registerTool({
        name: t.name,
        title: t.title,
        description: t.description,     // never contains counterparty text
        inputSchema: t.schema,
        annotations: {
          readOnlyHint: t.readOnly,
          untrustedContentHint: true
        },
        execute: record(origin, t.name, t.run)   // ledger wraps every call
      }, { signal: ac.signal, exposedTo: [origin] });
    }
  }
}

function spendAppeal(side) { appealAbort.get(side).abort(); }   // the card leaves the hand
```

## 12. Scope

**In:** four origins with verified headers · the phase machine · exhibits (text, pdf, image,
captured link) · facts pointing into exhibits · `assess` with the quote check · `extract_text` ·
`search_exhibits` · the capability manifest and ledger · two board seats with computed split ·
one appeal per side · human-only confirm · injection defence · key proxy per origin.

**Out:** OCR · a database · accounts · cross-device sync · crop-rectangle locators on images ·
`diff_exhibits` · `run_check` (live URL verification — assessments with verified quotes deliver
checkability better and cheaper) · published role briefs · live embedding of linked pages.

### The honest arithmetic

The plan was **7 days of tasks into 6 usable days** before any of this — Aug 27–Sep 2, with the 31st
lost to another deadline. Additions: appeals + exhibits + fourth origin **+1.3**, `assess` **+0.5**,
lending + manifest **+0.9**, images **+0.3**, links **+0.6**, the fifth origin **+0.1**. Removals: `run_check` **−0.5**,
rebuttal phase **−0.5**, `challenge` folded into appeal **−0.4**, Task 5 trimmed **−0.5**.

**Net: roughly two days over, on a plan already one day over.** The remaining lever is not another
feature — it is that every hour spent designing comes off the build.

### Cut order, pre-committed while calm

Triage gate **Aug 30 evening**. If Tasks 0–4 are not green, these fire in order:

1. **the link fetch proxy** — the only piece that adds a server; losing it costs provenance, not the
   feature. Every link then reads `party-supplied`: truthful, but uniform, so the column stops
   carrying information.
2. **`search_exhibits`**
3. **appeals**
4. **image exhibits** — also loses the "what the page cannot verify" row, which is a thesis
   statement and not just a file type
5. **the second board seat** — last, because losing it costs the video its best beat

## 13. Risks

| Risk | Standing | Mitigation |
|---|---|---|
| `toolchange` may not reach a built-in agent mid-task | **Unverified.** Spike is Task 0 | The panels are in-page agents whose refresh we control. Changes what the video *claims*, not what it *shows* |
| `pdf.js` bundle or worker config fights Vite | Medium | Half a day budgeted. Fallback: PDF citations recorded with locator, marked "quote not machine-checked" in plain sight |
| Four origins × header config | Low, but eats an afternoon if found late | Verified on day 1, Task 1 |
| Two seats = two provider calls per verdict | Low | Key proxy already planned; pre-flight providers the day before filming |
| **"AI arbitration" is a crowded hackathon genre** | **High** | Never lead with "AI judge." Lead with *bring your own advocate* and *the tool is not in its list* |
| Innovation theater — slick UI over a thin repo | Named by a Databricks judge as heavily penalised | The 20 seconds of code in the storyboard is not optional |
| No code exists yet and the spike is unrun | **The real one** | Spec tonight, spike + Task 1 tomorrow, hard scope freeze after |

## 14. Submission checklist

- [ ] Live public URL, reachable
- [ ] Public repo, **open-source licence detectable in the About section** — an explicit rule
- [ ] `<3:00` public YouTube demo, with audio
- [ ] Written explanation: WebMCP fit, UX gain, what humans and agents can now do together that they
      could not, how WebMCP was implemented
- [ ] `document.modelContext.registerTool({...})` visible in the repo — named in the rules
- [ ] **Nothing named anywhere** — see §15
- [ ] Submitted **Sep 2** (deadline is **1:00pm PDT Sep 3**, not 5pm — the brief circulating is
      wrong)

## 15. Naming rule — binding

**Allowed:** first person, the shape of the harm, the emotional truth.
**Not allowed:** the organisation, the amount, the sector, the event type, the counterparty,
screenshots, or anything a search would resolve.

The shape earns full marks on both criteria it needs to. The name earns nothing and costs something
still outstanding. A public artifact cannot be un-published.

## 16. What this does not do, and what I am unsure about

- **It is ungraded.** The previous design was scored 14.2/16 by three blind Opus graders. This one
  has not been through that, and it is a bigger build.
- **It cannot judge whether reasoning is good.** It can prove a quote is real, show what was read,
  and show what was not. Everything past that is the human's job, by design.
- **Image citations are unverifiable by the page**, stated on the page. That is the honest position,
  not a gap I intend to close.
- **`exposedTo` scopes origins, not people**, so per-person scoping across devices is not
  expressible today. Co-presence makes this a non-issue for this build; it remains a real limit.
- **The sharper spec gap, and the one the video uses:** annotations are only `readOnlyHint` and
  `untrustedContentHint`. There is **no provenance annotation** — no way for a tool to declare which
  model stands behind it. A two-seat board needs exactly that to prove its seats are independent, so
  independence here is handled out of band and asserted, not proven. If I could ask for one
  primitive, that is it.
