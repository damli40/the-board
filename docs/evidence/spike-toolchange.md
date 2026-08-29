# Spike: does a WebMCP client notice tools appearing/disappearing mid-session?

**Status: 🔴 UNRUN.** The probe page (`spike/toolchange.html`) exists and has been read through by
eye, but nobody has opened it in Chrome, watched the log, or pointed a client at it. Nothing below
is a result — it is the plan for one. Do not cite this page as evidence of anything until it has
actually been run and this file has been updated with what happened.

## Why this matters to the submission

The whole tool-lifetime claim in this project — *"a phase's lifetime is an `AbortController`; ending
a phase and withdrawing a capability are the same line"* — is filmed as `registerTool` /
`controller.abort()` calls that make **our own** in-page panels (`packages/panel`) see a different
tool list before and after. Those panels are safe to claim this about: `runAgentTurn` (Task 8) calls
`getTools({ fromOrigins })` **fresh, at the start of every turn** (see `packages/panel/src/agent/loop.ts`),
so by construction they always see whatever is live right now. There is no caching to go stale.

A genuinely **external** agent — a browser extension, a third-party assistant, Chrome's own
built-in agent, the Model Context Tool Inspector — is a different question. It might list tools once
per session and hold onto that list, or it might re-list before every call, or it might subscribe to
some change notification. The spec repo (per CLAUDE.md §1) removed `unregisterTool()` in favour of
the `AbortSignal` design, but that tells us how a **page** withdraws a tool, not how a **client**
finds out. Nothing in this repo has tested that half of the picture.

## What the probe does

`spike/toolchange.html` — no build step, no dependencies, opened directly:

1. On load: registers `spike_tool_one` under one `AbortController`'s signal.
2. At t+20s: registers a second tool, `spike_tool_two`, under the **same** signal — no reload,
   no new page.
3. At t+40s: calls `controller.abort()` — both tools should stop existing for anyone, immediately,
   the same mechanism `PhaseMachine.enter()` uses for a real phase transition.
4. Every step is logged on-screen and to the console, with a timestamp.

Uses `document.modelContext ?? navigator.modelContext` (CLAUDE.md §1's exact feature-detection
pattern) and registers with `{ signal }` only — no `exposedTo` restriction, so any same-origin
client can see it (the point here is the client's *behaviour*, not the origin boundary this project
otherwise depends on).

## The four questions it is built to answer

1. **Does an already-open external client's tool list pick up `spike_tool_two` without a reload or
   without the human re-invoking the client?** (Tests whether the client re-lists tools on some
   internal cadence, on next action, or not at all until asked again.)
2. **Does that same client stop offering (or stop being able to call) `spike_tool_one` /
   `spike_tool_two` once `controller.abort()` fires at t+40s** — and if it still tries to call one
   afterward, does it get a clean rejection it surfaces, or does it hang/silently fail?
3. **Is there a change-notification the client's own machinery subscribes to** (something like a
   `toolschanged` event a client's page-side code listens for), or does every client that does
   notice changes do so only by re-calling `getTools()` on its own schedule? (The spec explainer does
   not name a subscription primitive for this as of the HEAD this repo verified against — CLAUDE.md's
   header — so the working assumption is "no such event exists," but this spike is also a chance to
   be wrong about that.)
4. **Does behaviour differ between Chrome's own built-in agent (if reachable without an explicit
   `exposedTo` naming it — CLAUDE.md §3's "Disclose, don't paper over" section) and a separate
   extension-based client**, since they may not share one code path for tool discovery.

## The decision rule

**If no third-party client picks up the change without being told to look again:** the video and
README's tool-lifetime claim is scoped to say so plainly — *"our own in-page panels see this
instantly, because they re-list on every turn; we have not verified this for an arbitrary external
agent holding a longer-lived session."* The submission makes **no claim** about an external agent's
mid-session behaviour, and nothing in the storyboard is re-cut to imply one.

**If a third-party client does pick it up live** (via polling, an event, or simply because it
re-lists before every call the way our own panels do): that is additional, stronger evidence for the
same claim, and can be cited — but only after this file is updated with which client, what it did,
and how it was observed (screen recording or console log), not from memory afterward.

**Either way:** this spike does not change what the project builds or ships. It changes what one
line in the pitch is allowed to say.

## Running it (for whoever executes this — not done yet)

1. `chrome://flags/#enable-webmcp-testing` → Enabled → relaunch, OR use a build with the origin
   trial token for this project's real origins.
2. Open `spike/toolchange.html` directly (`file://` — the spec text CLAUDE.md quotes explicitly
   exempts the `file:` scheme from the origin-isolation check, though Chrome's own docs do not
   separately confirm this, so if it does not register under `file://`, fall back to `npx serve
   spike/` or any static server over `http://localhost`).
3. Watch the on-page log for the three timestamped steps (t+0, t+20s, t+40s).
4. Separately, open a WebMCP-aware third-party surface against the same page — Chrome DevTools →
   Application → WebMCP pane (this always sees the registry directly, so it is the control, not the
   test subject) plus, if available, the Model Context Tool Inspector (Chrome Web Store) or another
   agent extension — and watch whether ITS list of available tools changes at t+20s and t+40s without
   you reloading anything or re-opening that tool.
5. Update this file: replace "UNRUN" with the date run, name the client(s) tested, and answer each
   of the four questions above with what was actually observed, plus how it was captured (screenshot
   or recording path).
