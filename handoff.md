# Handoff — The Board

Where the build stands, what only you can do, and what will bite if you skip it.

**Branch:** `build/the-board`, 38 commits from `6e0543a`. Nothing pushed, nothing deployed.
**State:** 253 tests passing across 25 files. `npx tsc --noEmit` clean. Both packages build.
**Reviewed:** every task individually, then the whole branch at once, then the fix wave.

---

## Do these in order

### 1. Top up the model account. Nothing else works until this is done.

No live provider call has ever succeeded. The API returns `400 credit balance is too low` before the model runs, so the agent panels have never spoken to a real model.

Three things stay unverified until it does, and each is a failure that would appear on camera rather than in a log:

- whether the model picks the right tools from the schemas it is given
- whether a six-step agent turn finishes inside the Netlify function's 10-second timeout
- whether the `tool`-role message mapping carries enough context

### 2. Deploy five Netlify sites

Runbook: `docs/evidence/deploy.md`. About an hour.

Five separate sites, because subdomains are separate origins and separate origins are the entire point. `packages/record/src/config/origins.ts` holds all five and a test fails if the deploy headers drift from it.

**The one most likely to break:** Netlify's hosted CI installing this workspace monorepo when a site's base is a package directory rather than the repo root. It builds clean locally. That is not the same thing.

### 3. Run the hand-run in Chrome

Runbook: `docs/evidence/hand-run.md`, with pass and fail conditions per step.

This is the only check that pdf.js works in a browser. Every test stubs the loader. It is also the only check that one origin genuinely cannot see another origin's tools, which is the claim the whole project rests on.

Until you run it, the README says plainly that no browser-confirmed result exists. Once you run it, that sentence changes.

Two steps must **refuse** rather than warn. If either merely warns, stop and tell me.

Setup item 4b carries a tripwire nobody has tested: extended thinking counts against the same token budget as visible output, so a turn can return `stop_reason: "max_tokens"` with no tool call. Check the first real call.

### 4. Push the repo public, then open it in an incognito window

The MIT licence is committed and GitHub's About section needs the repo public to show it.

Before you push, know what leaves the machine. Four files are deliberately untracked and stay local: `docs/evidence/real-world-cases.md` and three documents describing an abandoned earlier concept.

### 5. Film the video

Script: `docs/STORYBOARD.md`. 378 words, 2:54 at a slow read, under the 3:00 cap at any pace.

This document was corrected more times than anything else in the repo, so trust the current version over your memory of it. Five separate factual errors were found in it, including a scripted refusal that cannot happen and a manifest mockup that contradicted the tool catalogue.

### 6. Optional: run the tool-lifetime spike

`spike/toolchange.html`, written up in `docs/evidence/spike-toolchange.md`, marked UNRUN.

Until it runs, the video claims the tool-lifetime beat only for the panels this project ships and claims nothing about a third-party agent. That claim is true either way, so this is upside rather than a blocker.

---

## What I could not do, and why

**Anything with a browser.** The Chrome flag, the DevTools cross-check, the in-app browser test.

**Anything outward-facing.** No repository created, nothing pushed, no site deployed. Publishing is irreversible, and the naming rule makes it more so.

**Anything needing your accounts.** Netlify logins, the model provider, the origin trial.

---

## What the reviews found, so you know what to trust

Every defect that mattered in this build ran fine. None crashed. That is worth carrying into the hand-run: the failures to look for are the ones that return a plausible answer.

The three worst, all caught at the end:

- **The agent loop could not talk to any model at all.** The panel sent a request shape no provider accepts and expected a response shape none returns, with nothing translating between them. Every test of that loop stubbed the network and handed back the answer. It passed 210 tests.
- **Filing from both sides at once minted the same exhibit id**, because the id came from an array length read before two awaits. The hand-run's own first step fires both advocates simultaneously.
- **The board was frozen while agents acted.** Nothing re-rendered when a tool executed from another origin, so during the refusal beat the screen would have shown nothing.

The documents drifted more than the code did. Five separate contradictions between what a document said and what the code does, including the storyboard's exhibit ids, the architecture diagram's tool lists, and a claim in five files that the two seats run different providers when they run different models from one vendor.

Nothing holds a document to account except someone reading it against the source.

---

## Known limitations, already written into the README

Recorded here too so nothing is a surprise.

- Tool scoping covers origins, not people. Per-person scoping across devices is not expressible in the spec today. This is one browser and several origins in a co-present session.
- The origin partition does not cover a browser's own built-in agent, which the working group lists as open. The confirm control is safe for a better reason: it is never registered anywhere.
- Image citations cannot be machine-checked and are stamped for a human.
- The link capture fetches any user-supplied HTTPS URL with no allowlist, and the model proxy is unauthenticated. Both are accepted demo limitations, not production code.
- The injection detector catches a directive naming one party mid-clause but misses the same phrasing naming the other unless a qualifying word precedes it, because one letter collides with the indefinite article. Documented in the file and pinned by tests.
- Injection can still corrupt what a seat concludes. It cannot expand what a seat can do, and a corrupted seat is visible the moment it cites something it never assessed.

---

## Where things live

| | |
|---|---|
| Build log, decisions and their reasoning | `log.md` |
| Devpost story | `docs/PROJECT-STORY.md` |
| Public README | `README.md` |
| The four Devpost answers | `SUBMISSION.md` |
| Deploy runbook | `docs/evidence/deploy.md` |
| Chrome hand-run | `docs/evidence/hand-run.md` |
| Submission checklist | `docs/evidence/pre-submission-checklist.md` |
| pdf.js evidence | `docs/evidence/pdfjs-verification.md` |
| Video script and UI spec | `docs/STORYBOARD.md` |
| Full ledger, every ruling and review finding | `.superpowers/sdd/2026-08-26-the-board-adjudication/progress.md` (local only) |
