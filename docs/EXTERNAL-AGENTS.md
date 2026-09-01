# Use Claude Code or Codex as a Board actor

The Board's browser panels can run model APIs internally. This bridge covers a different case: an
existing Claude Code or Codex agent occupies one of the four Board origins and receives that origin's
live tools as native MCP tools. Nobody needs a provider key or a room code to do it.

This is the long-form version of the README's Path C. The README is the fast path; this file carries
the reasoning, the security boundary, and the full troubleshooting table.

```text
Claude Code / Codex
        │ MCP over stdio
        ▼
The Board external-agent bridge
        │ CDP (the Chrome DevTools Protocol, the debugging
        │ channel a program uses to run code inside a tab)
        ▼
the selected cross-origin panel frame
        │ getTools({ fromOrigins }) / executeTool(...)
        ▼
the record origin's WebMCP registry
```

The bridge does not call the record's internal stores or HTTP endpoints. It evaluates inside the
selected panel frame, asks the browser which WebMCP tools that origin currently holds, and invokes
the browser's returned tool object. Actor identity therefore still comes from the origin. There is no
`actor` or `as` argument for the coding agent to forge.

## Why it is a raw CDP client, and not Playwright

Three Chrome facts shaped the bridge. All three were found by running it on Chrome 152 on
1 Sep 2026.

1. **Playwright cannot see the frame.** On Chrome 152, `connectOverCDP` reports cross-origin iframes
   with empty URLs, so the actor's frame is never found and there is nothing to evaluate inside. The
   bridge therefore speaks CDP directly, with no browser automation library underneath it.
2. **Chrome hands `inputSchema` over as a JSON string**, not as an object. The bridge parses it per
   tool, and a single unparseable schema costs that one tool rather than blinding the whole list.
3. **Chrome replaces a rejected tool call's message with a generic error.** So the record returns its
   refusals as data instead of throwing them: every call resolves to `{"ok":true,"result":…}` or
   `{"refused":true,"reason":…}`. The bridge unwraps that envelope once. A refusal reaches the MCP
   client as an error reading `refused: …`, which Claude Code reports as a refused call. This was
   verified live on 1 Sep 2026.

The page fires a `toolchange` event on `document.modelContext`, which is real but awkward to consume
from outside the tab. The bridge polls the browser's tool list every 750 ms instead, and sends MCP's
`tools/list_changed` when the list actually changes.

## 1. Install

```bash
npm install
```

Node 22 or later. Chrome 149 or later; Chrome 152 is the version every run below was made on.

For the local five-origin setup instead of the deployed one:

```bash
npm run demo
```

The local defaults are record `http://localhost:8080`, Advocate A `:8081`, Advocate B `:8082`,
Seat 1 `:8083`, Seat 2 `:8084`. Set `BOARD_LOCAL=1` and the scripts point at those instead of the
deployed sites.

## 2. Open the bench Chrome

```bash
scripts/agents/chrome.sh
```

That opens a throwaway profile at `~/.the-board/agent-chrome`, turns WebMCP on with
`--enable-features=WebMCP,DevToolsWebMCPSupport` (what `chrome://flags/#enable-webmcp-testing`
expands to on Chrome 152), loads the deployed record page, and listens for a debugger on
`127.0.0.1:9222`.

Chrome deliberately requires a non-default `--user-data-dir` before it will open a remote debugging
port, which is why the script makes its own profile rather than reusing yours. Closing that browser
ends the bridge's access.

If a later Chrome renames those features, seed the profile's `Local State` file instead:

```bash
printf '%s' '{"browser":{"enabled_labs_experiments":["enable-webmcp-testing@1"]}}' \
  > "$HOME/.the-board/agent-chrome/Local State"
```

**The room code is optional.** The script appends `?code=$BOARD_ROOM_CODE` only when that variable is
set. The bridge never touches this project's model proxy, so a judge needs neither a code nor a
provider key. Set it only to land straight in a specific room, and never write a real code into a
file. The local dev server accepts `board-demo-2026`.

Confirm that all four embedded panels render and that Advocate A shows filing tools before going on.

## 3. Be Advocate A

```bash
scripts/agents/agent.sh A
```

An ordinary interactive Claude Code session that holds only The Board's tools. It runs from a
temporary directory with `--tools ""`, so no project `CLAUDE.md` or `AGENTS.md` loads and no
built-in file, shell or web tools come with it, and it unsets `ANTHROPIC_API_KEY` first so the
session runs on your own Claude Code sign-in.

`BOARD_AGENT_MODEL` picks the model for any of these scripts. `BOARD_DRY_RUN=1` prints the command
the script would run instead of running it.

### Registering the server by hand

If you would rather have the bridge inside a session you started yourself:

```bash
claude mcp add --scope local the-board-a -- \
  node /absolute/path/to/the-board/packages/external-agent/src/cli.mjs \
  --actor A \
  --record-url https://theboard-record.netlify.app \
  --panel-url https://theboard-a.netlify.app \
  --cdp http://127.0.0.1:9222
```

```bash
codex mcp add the-board-a -- \
  node /absolute/path/to/the-board/packages/external-agent/src/cli.mjs \
  --actor A \
  --record-url https://theboard-record.netlify.app \
  --panel-url https://theboard-a.netlify.app \
  --cdp http://127.0.0.1:9222
```

Start a fresh session after registering. Approve the local-scoped MCP server if Claude Code asks.

Being Advocate A in an interactive Codex session works. That form was run on 2 Sep 2026 against the
deployed record: Codex listed exactly Advocate A's six tools, called `read_board` live, and showed a
refusal word for word.

Codex will stop and ask you to approve each call that changes the record. That is Codex's own approval
policy, not the Board's, and it is a second consent layer sitting on top of the browser's. The browser
decides what this origin may call at all. Then a person decides whether this particular filing goes
through. To stop the asking, add one line to that server's block in `~/.codex/config.toml`:

```toml
default_tools_approval_mode = "approve"
```

That is per server. It says nothing about any other MCP server you have registered.

The tools shown are the bare WebMCP capabilities currently visible to Advocate A, such as
`file_exhibit` and `file_fact` during filing. There is no permanent generic "act as anyone" tool.

## 4. Drive the advocate

Three lines to start with:

> "what do you hold right now?"

> "File this as a text exhibit named Completion email: 'Sent the delivery summary to the recipient on
> the day of completion. Subject: Delivery complete. No bounce, no reply.' Then file the fact it
> supports: the delivery summary was emailed to the recipient on the day of completion."

> "any update?"

The filing sentence is A's own, out of `cases/demo/a-side.md`. A coding agent can also read evidence
from its own workspace with its own filesystem tools and pass the contents to `file_exhibit`. The
Board records the action as Advocate A because the bridge executed inside Advocate A's origin.

`read_board` is a sectioned, read-only view of the case. The parties hold it from FILING through
VERDICT; the seats hold it in REVIEW and VERDICT. Its sections are `summary`, `facts`, `exhibits`,
`disputes`, `objections`, `assessments`, `verdicts` and `ledger`, and each one is paged with `rows`
and `more` so a section fits inside the record's 1,500-character tool-output budget. It never returns
exhibit text or pages. Opening a document is its own step, and its own row on the record.

## 5. The rest of the case

```bash
scripts/agents/b.sh                                   # Advocate B answers, one shot
# click "Open review" on the record page
scripts/agents/seats.sh review                        # both seats read and assess
# click "Ask the seats to draft" on the record page
scripts/agents/seats.sh verdict                       # both seats draft
```

`BOARD_AGENT=codex` aims any of these at Codex instead of Claude Code. Either client works, for
reading and for filing.

The Codex path writes a throwaway config into a temporary `CODEX_HOME`, which is the form that exposes
the bridge's tools, and copies your existing Codex sign-in into it so the session is logged in. That
config carries the `default_tools_approval_mode` line from section 3, so a one-shot can file with
nobody sitting there to answer a prompt. It covers the Board's own server, in that temporary config,
for that one run. Your `~/.codex/config.toml` is never touched and Codex keeps its own sandbox. The
copied sign-in is deleted when the run ends.

Then ask Advocate A whether to spend the appeal, and end the case yourself: scroll to "The one
control no agent can reach," type a name, press `[ confirm ]`. The phase rail labels this step
*Hand to a person*; if you do not see that button, the confirm bar is reachable directly.

## What the phase change actually does

When the controller closes filing, the browser aborts those registrations. The bridge notices the
changed WebMCP list and emits MCP's tool-list-changed notification. A subsequent call is also checked
against a fresh browser list, so even a client with a stale cached schema cannot execute a withdrawn
tool; it gets `<tool> is not granted to this origin in the current phase`.

Observed on 1 Sep 2026, in the owner's own long-lived session: after clicking "Open review," the same
Claude Code 2.1.252 session answered "Tools I hold now: `read_board` and `object`. That's it." No
restart. After the final confirmation, the same client reported
`No such tool available: mcp__the-board-a__read_board`, which is the same mechanism in the other
direction. `scripts/agents/agent.sh A --continue` remains the fallback if a future client version
ignores the notice.

## Other actors and deployed origins

Run one bridge process per actor and give each MCP server a distinct name. Change `--actor` and
`--panel-url` together:

| Actor | Local panel URL | Deployed panel URL |
|---|---|---|
| `A` | `http://localhost:8081` | `https://theboard-a.netlify.app` |
| `B` | `http://localhost:8082` | `https://theboard-b.netlify.app` |
| `seat1` | `http://localhost:8083` | `https://theboard-seat1.netlify.app` |
| `seat2` | `http://localhost:8084` | `https://theboard-seat2.netlify.app` |

For a deployed Board, pass the exact HTTPS record and panel URLs. The record must already be open in
the Chrome instance attached at `--cdp`.

## Security boundary

- A process with Chrome DevTools Protocol access can control that dedicated browser profile. Treat
  the port like local privileged access.
- The bridge binds no network listener of its own; Claude Code or Codex launches it over stdio.
- The bridge never receives provider API keys and does not use the panel's model proxy.
- It exposes only the tools returned by the browser to the chosen panel origin.
- `confirm` and `return_with_note` remain absent because they are never WebMCP tools.
- `confirm` proves that a person pressed it, not which person. The bar takes any name typed into it.
  That is an identity problem this build does not solve, and nothing here should be read as verifying
  the name on a confirmation.
- Use a dedicated disposable Chrome profile and close it after the run.

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `cannot reach Chrome's debugging port at … (ECONNREFUSED)` | Chrome was not launched with remote debugging. | Run `scripts/agents/chrome.sh`. |
| `exec: …/Google Chrome: No such file or directory` | `chrome.sh` looks for Chrome at the macOS bundle path. | Set `BOARD_CHROME_BIN` to your own Chrome binary. |
| `no iframe for <origin> in the Chrome at <cdp url>` | The record page is not open in that Chrome, or `--panel-url` does not match its iframe origin exactly. | Open the record there, then check the panel URL you passed. |
| `WebMCP is not available in this panel` | WebMCP is disabled in that Chrome profile, or a required security header is missing. | Use `scripts/agents/chrome.sh`, or seed `Local State`, relaunch, and verify the ordinary panel first. |
| `<tool> is not granted to this origin in the current phase` | The agent asked for a tool absent from its current browser surface. | Working as intended. Ask it what it holds now; do not bypass the phase. |
| `the panel frame detached mid-call (navigation or reload)` | The record page reloaded or navigated while a call was in flight. | Ask the agent to read the board again before acting. |
| `the record's machinery failed (this is not a refusal): …` | A genuine crash inside the record, not a boundary decision. | The cause is on the record page's ledger row for that call. |
| `API Error: … safeguards flagged this message … [reasoning_extraction]` | Your account's default model refused the seats' verdict prompt on 1 Sep 2026. | Re-run with `BOARD_AGENT_MODEL=opus`. |
| `user cancelled MCP tool call` (Codex) | Codex's own approval policy stopped a state-changing call. This is not a Board refusal. | Approve the call when Codex asks, or add the `default_tools_approval_mode` line from section 3 to that server's block. The scripts already carry it in the config they write. |

## What is verified, and what is not

Verified on 1 Sep 2026, on the deployed sites, with the full case run twice to `CONFIRMED`: once with
all four parties as one-shot `claude -p` sessions, once with the owner's own interactive Claude Code
session as Advocate A. Codex was driven against the same deployed record on 2 Sep 2026. The list
below is those runs' receipt.

- Per-frame partition, queried inside each frame over CDP: Advocate A's frame lists `a__*` only,
  Advocate B's lists `b__*` only, the seats' frames list nothing during FILING.
- Refusals reaching an MCP client as errors, in Claude Code.
- `tools/list_changed` honoured live by Claude Code 2.1.252, in both directions.
- A call to a withdrawn tool refused against a fresh browser list.
- Missing or invalid required fields refused with a plain reason. Chrome does not validate tool input
  against the declared schema, so the record does it.
- At `CONFIRMED`, every actor's hand is empty; only the visiting observer's `read_board` is still
  registered.

**Codex, verified 2 Sep 2026.** Registered with `codex mcp add` (the form shown in section 3), Codex
listed exactly Advocate A's six tools (`file_fact`, `read_board`, `concede`, `open_exhibit`,
`dispute`, `file_exhibit`), called `read_board {section:"summary"}` against the deployed record
(phase `FILING`, 5 exhibits, 7 facts), and received a refusal as a failed tool call carrying the
record's wording verbatim: `refused: no such exhibit: E9; use an exhibit id that was actually filed`.

**A Codex write reached the record on the same day, with Codex's sandbox on.** With the
`default_tools_approval_mode` line on that server's block, `codex exec --sandbox read-only` called
`file_fact` and the call went through to the record, which answered with that same refusal. Without
the line, the identical run stopped at `user cancelled MCP tool call`, which is Codex's own policy
speaking and not the record's.

**The scripted path ran end to end the same day.** `scripts/agents/b.sh` with `BOARD_AGENT=codex`
filed exhibit `E6`, filed fact `F8` countering `F7` and pointing at `E6`, then opened Advocate A's
exhibit and filed dispute `D1` quoting `E4`. Every call landed on the record under Advocate B's own
origin, with Codex's sandbox left on. The `-c mcp_servers.<name>` command and args overrides do not
expose the tools at all, which is why the scripts write a config file into a temporary `CODEX_HOME`
instead.

Two caveats remain. Neither is about the bridge:

- **The Codex desktop app was not used.** Everything above was the `codex` CLI. The app reads the
  same `~/.codex/config.toml`, so a hand-registered server should behave the same way there. That has
  not been run.
- **Whether an interactive Codex session refreshes its tool list mid-phase is unchecked.** Claude
  Code 2.1.252 was verified for `tools/list_changed` in both directions on 1 Sep 2026; Codex was not.
  Assume you may need to restart a Codex session after a phase moves.
