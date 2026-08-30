# Handoff — The Board

Where the build stands, what only you can do, and what will bite if you skip it.

**Branch:** `build/the-board`, 54 commits from `6e0543a`. Nothing pushed, nothing deployed.
**State:** 293 tests passing across 26 files. `npx tsc --noEmit` clean. Both packages build.
**Reviewed:** every task individually, then the whole branch at once, then the fix wave.
**Last session:** 30–31 Aug 2026. Security, offline mode, the design port, and the visiting agent. Full reasoning in `log.md`.

> **The order below changed.** "Top up the model account" used to be step 1 and blocked everything. Offline mode (`?offline=1`) now runs the whole demo against the real browser boundary with no provider call, so the top-up is optional and sits near the bottom. Read step 1 before doing anything else.

---

## Do these in order

### 1. Run the hand-run in Chrome. This is the only open FACT.

Runbook: `docs/evidence/hand-run.md`, pass and fail conditions per step.

Everything else on this list is presentation. This is the one claim the project rests on that still rests on argument rather than observation: **from inside Advocate B's frame, `getTools()` returns B's tools and not A's.**

It is cheap now. Start the five origins (`npm run dev:origins`), open `http://localhost:8080/?offline=1`, and drive it without a provider key.

Two steps must **refuse** rather than warn. If either merely warns, stop and say so.

**Run it with this in mind.** `getTools()` called in the page's *own* context returns the origin-scoped tools too — verified 31 Aug, now in `CLAUDE.md` §2. That does not weaken the cross-origin claim, but it means the check has to be made from *inside a panel frame*, never from the record's console. A test from the wrong context will return a confident, plausible, wrong answer.

Also: `executeTool`'s input must be a JSON **string**. An object rejects with `Failed to parse input arguments`.

### 2. Deploy five Netlify sites — and set two things you cannot skip

Runbook: `docs/evidence/deploy.md`. About an hour.

Five separate sites, because subdomains are separate origins and separate origins are the entire point. `packages/record/src/config/origins.ts` holds all five and a test fails if the deploy headers drift from it.

**`ROOM_CODE` on all four panel sites.** The model proxy fails closed without it and refuses every request. That is deliberate — a deploy that forgets the variable must not silently reopen the endpoint. Nothing will run until it is set.

**A spend limit on the API key, at the provider.** The rate limiter in `gate.ts` is per container, and Netlify runs many, so it bounds a runaway client and nothing more. The provider's own budget control is the only real ceiling. Do this before the account has money in it.

**The one most likely to break:** Netlify's hosted CI installing this workspace monorepo when a site's base is a package directory rather than the repo root. It builds clean locally. That is not the same thing.

### 3. Fix the stale claim in `SUBMISSION.md`

Line 216 still says the project "has not been run in an actual Chrome window." That stopped being true several sessions ago: the manifest, the phase transitions, offline mode and the visiting agent have all been driven in Chrome and the results are in `log.md`.

Split it into what the browser has now confirmed and the one claim still waiting on step 1. **Understating is as wrong as overstating**, and it is the kind of line a judge notices.

### 4. Finish the design port, if the revised file has landed

Claude Design was asked on 31 Aug to finish its run and given the real registry, the dark-mode brief, the positioning line and the accessibility requirements. Project: `claude.ai/design/p/0f52ca03-de28-4514-bf0e-1c7d0b6a31df`.

Ported already: the theme tokens, dark mode, and the manifest (the signature image).
Still on the old design: masthead, phase rail, prompt bar, agent panels, confirm block, record block.

**This is what to cut if the clock runs out.** The signature image is done and it is the shot that matters.

⚠️ Whatever comes back, **do not port its data**. The design agent never had repo access and its tool names are invented — `read_case_file`, `quote_check` and `submit_argument` do not exist, and it hands `extract_text` to Advocate A when the registry gives it to seats only. Drive everything from `ToolRegistry.manifest()`.

### 5. Push the repo public, then open it in an incognito window

The MIT licence is committed and GitHub's About section needs the repo public to show it.

Before you push, know what leaves the machine. Four files are deliberately untracked and stay local: `docs/evidence/real-world-cases.md` and three documents describing an abandoned earlier concept.

### 6. Film the video

Script: `docs/STORYBOARD.md`. 378 words, 2:54 at a slow read, under the 3:00 cap at any pace.

This document was corrected more times than anything else in the repo, so trust the current version over your memory of it. Five separate factual errors were found in it, including a scripted refusal that cannot happen and a manifest mockup that contradicted the tool catalogue.

### 7. Optional: run the tool-lifetime spike

`spike/toolchange.html`, written up in `docs/evidence/spike-toolchange.md`, marked UNRUN.

Until it runs, the video claims the tool-lifetime beat only for the panels this project ships and claims nothing about a third-party agent. That claim is true either way, so this is upside rather than a blocker.

### 8. Optional now: top up the model account

This used to be step 1. Offline mode removed it from the critical path — `?offline=1` exercises the real browser boundary with no provider call, and filming it is honest as long as the video and README say the planner is scripted.

Do it only if a beat in `docs/STORYBOARD.md` needs the model *visibly reasoning*, which offline mode cannot produce.

No live provider call has ever succeeded; the API returns `400 credit balance is too low`. Three things stay unverified until one does:

- whether the model picks the right tools from the schemas it is given
- whether a six-step agent turn finishes inside the Netlify function's 10-second timeout
- whether the `tool`-role message mapping carries enough context

A tripwire nobody has tested: extended thinking counts against the same token budget as visible output, so a turn can return `stop_reason: "max_tokens"` with no tool call. Check the first real call.

**Set `ROOM_CODE` and the provider spend cap first.** Four public endpoints with a funded key behind them is the thing step 2 exists to prevent.

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
- ~~The model proxy is unauthenticated.~~ **Fixed 30 Aug.** It requires a room code, fails closed without `ROOM_CODE`, and rate-limits per container. The rate limit is *not* a global ceiling — set a spend cap at the provider.
- The link capture still has no allowlist: it will fetch any HTTPS URL. Hardened 30 Aug with manual redirects, a 2MB cap, a 10s timeout and private/loopback refusal, which closes the redirect-past-the-check hole. A hostname that *resolves* to a private address still gets through. Accepted demo limitation.
- The origin partition is enforced for the four panel origins. `getTools()` in the page's own context returns the origin-scoped tools too, so an agent operating at page scope sees more than a panel does. This is the working group's open item, not a regression, and `confirm` is safe either way because it is registered nowhere.
- The injection detector catches a directive naming one party mid-clause but misses the same phrasing naming the other unless a qualifying word precedes it, because one letter collides with the indefinite article. Documented in the file and pinned by tests.
- Injection can still corrupt what a seat concludes. It cannot expand what a seat can do, and a corrupted seat is visible the moment it cites something it never assessed.

---

## Where things live

| | |
|---|---|
| Build log, decisions and their reasoning | `log.md` |
| Design brief, audit and research synthesis | `docs/design/01`–`04` |
| Portable design system (tokens + contract) | `design-systems/the-board/` |
| Offline mode (`?offline=1`) | `packages/panel/src/agent/scripted.ts` |
| Room code and rate gate | `packages/panel/src/proxy/gate.ts` |
| The visiting agent's grant | `OBSERVER_TOOLS` in `packages/record/src/webmcp/tools.ts` |
| Devpost story | `docs/PROJECT-STORY.md` |
| Public README | `README.md` |
| The four Devpost answers | `SUBMISSION.md` |
| Deploy runbook | `docs/evidence/deploy.md` |
| Chrome hand-run | `docs/evidence/hand-run.md` |
| Submission checklist | `docs/evidence/pre-submission-checklist.md` |
| pdf.js evidence | `docs/evidence/pdfjs-verification.md` |
| Video script and UI spec | `docs/STORYBOARD.md` |
| Full ledger, every ruling and review finding | `.superpowers/sdd/2026-08-26-the-board-adjudication/progress.md` (local only) |
