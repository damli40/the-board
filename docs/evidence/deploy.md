# Deploy runbook: the five Netlify origins

This is the project owner's checklist for taking this repo from "tests pass locally" to "a judge
can click a live URL." Nothing in this file has been run against a real Netlify account by the
build agent that wrote it: creating sites, linking them, and deploying are irreversible or
account-scoped actions that stay with the owner. Everything here that *could* be checked without
doing any of those three things (config validation, a local build, the header logic) was checked,
with the netlify-cli already installed on this machine (`netlify-cli/26.1.0`), and the transcript
is below each step. Everything that could not be checked is called out explicitly, in its own
section at the end.

**Read this before starting:** step 3 (functions) documents a real bug this task found and fixed.
The first draft of `[functions] directory` pointed at a shared folder above each package, and
`netlify build` rejected it outright. If you are re-deriving this setup from scratch, do not repeat
that path; use the layout in step 3 as written.

---

## 0. Preconditions

- This repo is pushed to a GitHub repo the owner controls, public, MIT licensed (`LICENSE` at the
  repo root already reads MIT). Pushing and creating that repo are the owner's own steps, not
  covered here.
- `npm test` and `npx tsc --noEmit` both pass locally (210/210 tests, clean typecheck, as of this
  commit).
- `netlify login` has been run once on the machine doing the deploy (this machine already shows a
  logged-in session under the owner's account, so this may already be done).

## 1. Create the five sites

Five separate Netlify sites, one per origin, with these exact names so the origin each one gets is
the fixed one this project's code and headers expect:

```bash
netlify sites:create --name theboard-record --disable-linking
netlify sites:create --name theboard-a       --disable-linking
netlify sites:create --name theboard-b       --disable-linking
netlify sites:create --name theboard-seat1   --disable-linking
netlify sites:create --name theboard-seat2   --disable-linking
```

`--disable-linking` matters here: `packages/panel` is the build source for four different sites
(A, B, seat1, seat2), so no single local folder can be "the" linked folder for all four. Every
command below targets a site by name with `--site <name>` instead of relying on a link.

**Expect after each command:** a "project created" message naming the exact site name you passed
and its URL, for example `https://theboard-record.netlify.app`. If the printed URL does not match
the name you asked for, Netlify could not use that exact name (already taken) and gave you a
different one; stop and pick a different naming scheme consistently across the five sites,
`origins.ts`, and both `netlify.toml` files, rather than deploying with a mismatch.

## 2. Point each site at its package directory and connect the repo

For continuous deployment from GitHub, each site needs: the repo connected, a base directory, and
the build command/publish directory (already declared in that package's own `netlify.toml`, so
Netlify only needs to be told where to look).

In the Netlify dashboard, for each of the five sites: **Site settings > Build & deploy > Continuous
deployment**, connect it to this repo and branch, then set:

| Site | Base directory |
|---|---|
| `theboard-record` | `packages/record` |
| `theboard-a` | `packages/panel` |
| `theboard-b` | `packages/panel` |
| `theboard-seat1` | `packages/panel` |
| `theboard-seat2` | `packages/panel` |

With the base directory set, Netlify looks for `netlify.toml` inside that directory and finds the
one already committed there (`packages/record/netlify.toml` or `packages/panel/netlify.toml`),
which already declares `command = "npm run build"` and `publish = "dist"`. You do not need to
re-enter those in the UI; they come from the file.

If you would rather not connect GitHub at all and deploy straight from this machine, the CLI path
per site is:

```bash
cd packages/record && netlify deploy --prod --site theboard-record
cd packages/panel   && netlify deploy --prod --site theboard-a
cd packages/panel   && netlify deploy --prod --site theboard-b
cd packages/panel   && netlify deploy --prod --site theboard-seat1
cd packages/panel   && netlify deploy --prod --site theboard-seat2
```

`netlify deploy` runs the build command from that directory's `netlify.toml` before uploading
(drop `--prod` first to push a draft preview and eyeball it before it goes live). This CLI path
was not run end to end here (it uploads to a real site), but the config it depends on was: see
step 3.

## 3. Functions: what broke, and the fix

`netlify/functions/model-proxy.ts` and `capture.ts` used to live at the repo root, one directory
above every package. The first draft of this setup pointed each site's `[functions] directory` back
at that shared folder with `"../../netlify/functions"`. Running the real check surfaced a real
problem:

```
$ cd packages/record && netlify build --dry
 ›   Error: When resolving config file /Users/Admin/Desktop/the-board/packages/record/netlify.toml:
Configuration property "functionsDirectory" "../../netlify/functions" must be inside the
repository root directory.
```

Netlify treats the folder holding `netlify.toml` as the boundary for every relative path in that
file (`functions.directory`, `build.base`, and so on), and refuses any path that climbs above it,
whether by one `../` or two. A shared functions folder living outside every package's own tree
cannot be referenced from inside that tree at all; there is no flag that relaxes this. So this
project moved the files instead of the third option in that menu (a `[functions]` setting or a
`base` setting):

- `netlify/functions/capture.ts` moved to `packages/record/netlify/functions/capture.ts`
  (the record/parent origin is the natural owner of exhibit capture; no other origin calls it today)
- `netlify/functions/model-proxy.ts` moved to `packages/panel/netlify/functions/model-proxy.ts`
  (every panel origin calls `/.netlify/functions/model-proxy`, and `packages/panel/netlify.toml`
  deploys unchanged to all four panel sites, so this one copy covers A, B, seat1 and seat2 alike)

Both `netlify.toml` files now declare `directory = "netlify/functions"`, a path that stays inside
their own package, which is exactly what the error above ruled out for the old path.

**This was checked locally, offline, with no site created and none linked**, using
`netlify build --offline`, which runs the same build-and-bundle steps a real deploy would without
uploading anything:

```
$ cd packages/panel && netlify build --offline
...
❯ Functions bundling
Packaging Functions from netlify/functions directory:
 - model-proxy.ts
(Functions bundling completed in 904ms)

$ cd packages/record && netlify build --offline
...
❯ Functions bundling
Packaging Functions from netlify/functions directory:
 - capture.ts
(Functions bundling completed in 51ms)
```

Neither of those two files' own code changed; only their location did (`git mv`, both tracked as
renames), and `tsconfig.json`'s `include` list was updated from `"netlify/functions"` to
`"packages/*/netlify/functions"` so `tsc --noEmit` still type-checks them at their new paths (both
show up under `tsc --listFiles`).

**What this did not check:** whether a real Netlify site, built through GitHub-connected CI rather
than this local CLI run, resolves the same way, and whether the deployed function actually answers
a live request at `/.netlify/functions/model-proxy`. See the "cannot verify" section below.

## 4. Environment variables (panel sites only)

Each panel site (`theboard-a`, `theboard-b`, `theboard-seat1`, `theboard-seat2`) needs two
environment variables so `model-proxy.ts` can reach a model provider without the key ever shipping
to the browser: `MODEL_API_KEY` and `MODEL_BASE_URL`. `theboard-record` does not need either; its
only function, `capture.ts`, fetches a public URL and needs no credential.

**These are set once per site, in the Netlify UI, and are never committed to this repo.** Site
settings > Environment variables, or the equivalent CLI form:

```bash
netlify env:set MODEL_API_KEY  "<the real key>"  --site theboard-a     --context production
netlify env:set MODEL_BASE_URL "<the endpoint>"  --site theboard-a     --context production
netlify env:set MODEL_API_KEY  "<the real key>"  --site theboard-b     --context production
netlify env:set MODEL_BASE_URL "<the endpoint>"  --site theboard-b     --context production
netlify env:set MODEL_API_KEY  "<the real key>"  --site theboard-seat1 --context production
netlify env:set MODEL_BASE_URL "<the endpoint>"  --site theboard-seat1 --context production
netlify env:set MODEL_API_KEY  "<the real key>"  --site theboard-seat2 --context production
netlify env:set MODEL_BASE_URL "<the endpoint>"  --site theboard-seat2 --context production
```

This project's design deliberately uses more than one model provider across the two board seats,
for independence (a shared provider between seat1 and seat2 would mean a correlated failure looks
like agreement). If A/B and seat1/seat2 use different providers, the key and base URL values will
differ across sites; that is expected, not a mistake.

Before the first deploy, and again before submitting, run the secrets sweep from
`docs/evidence/pre-submission-checklist.md` (Section 5) against the built output: it greps
`packages/record/dist` and `packages/panel/dist` for the key's own prefix and must come back empty.

## 5. Verify the headers on all five live hosts

Every origin needs `Origin-Agent-Cluster: ?1` (WebMCP requires an origin-isolated document), and
the parent additionally needs a `Permissions-Policy` naming the four panel origins under `tools=`
(without it, `registerTool()` on the parent fails closed with `NotAllowedError`, and no panel ever
gets a tool). This loop checks both, on the real hosts, once they are live:

```bash
for h in theboard-record theboard-a theboard-b theboard-seat1 theboard-seat2; do
  echo "== $h =="
  curl -sI "https://$h.netlify.app/" | grep -i 'origin-agent-cluster\|permissions-policy'
done
```

**Expected output**, for every one of the five hosts:

```
Origin-Agent-Cluster: ?1
```

and, on `theboard-record` only, additionally:

```
Permissions-Policy: tools=(self "https://theboard-a.netlify.app" "https://theboard-b.netlify.app" "https://theboard-seat1.netlify.app" "https://theboard-seat2.netlify.app")
```

and on each of the four panel hosts:

```
Permissions-Policy: tools=(self "https://theboard-record.netlify.app")
```

If a host prints neither line at all, its deploy did not pick up that package's `netlify.toml`
(wrong base directory, most likely, see step 2). If the values do not match the strings above
exactly, the deployed `netlify.toml` is stale relative to what is in this repo right now; redeploy
that site rather than editing around it.

## 6. What a judge does to view it

1. Chrome 149 or later. (Edge 150 also runs its own WebMCP origin trial, and ChatGPT Desktop already
   ships support, so this is not strictly a one-browser requirement, but this project is built and
   tested against Chrome.)
2. Open `chrome://flags/#enable-webmcp-testing`, set it to **Enabled**.
3. Relaunch the browser (the flags page prompts a "Relaunch" button; the flag does not take effect
   until Chrome restarts).
4. Open `https://theboard-record.netlify.app`. The parent page loads the four panel origins as
   cross-origin iframes on its own; there is nothing else to open by hand.

No origin trial token is needed or used anywhere in this project; the flag above is the only
requirement. If a token meta tag or a token requirement shows up anywhere in this repo, that is
stale and should be removed, not followed.

## 7. If it breaks on the day

**The parent shows tools failing to register, or the panels never light up at all.** Check the
parent's own `Permissions-Policy` header first (step 5's first curl block). A missing or malformed
header on `theboard-record` means `registerTool()` is rejecting with `NotAllowedError` on the
parent itself, before any panel is even involved; nothing downstream will work until this one
header is right. Fastest fix: confirm `packages/record/netlify.toml` in the repo has the correct
four panel origins, then trigger a redeploy of `theboard-record` specifically (the CLI path in
step 2, or "Trigger deploy" in the dashboard).

**A panel loads but shows no tools (empty tool list, not an error).** This is the silent case, not
a thrown one: a well-formed `fromOrigins` call to an origin that simply did not grant that panel
anything returns `[]`, with no exception. Two different causes produce the same symptom:
- That panel's own origin is missing from the parent's `Permissions-Policy` list (recheck step 5).
- The registry on the parent registered that tool with the wrong `exposedTo` origin, or didn't
  register it for the current phase at all. This is app logic, not a deploy config problem; if the
  same panel shows tools correctly in the local five-port dev setup but not on the deployed site,
  it is a deploy config problem (most likely step 5's header), and if it is missing in both, it is
  not something this runbook fixes.

**A panel's agent loop fails outright, not just an empty tool list.** Check `MODEL_API_KEY` /
`MODEL_BASE_URL` are actually set on that specific panel site (step 4); a 500 from
`/.netlify/functions/model-proxy` with body `proxy not configured` means one of the two is missing
on that site.

---

## What this could not verify without an actual deploy

Everything below needs a real Netlify site, which this task was explicitly not allowed to create:

1. **Whether Netlify's hosted build (via GitHub-connected CI) installs this npm-workspaces
   monorepo's dependencies correctly** when a site's base directory is a package rather than the
   repo root. Locally, `npm install` was already run once at the repo root before any of this
   task's `netlify build --offline` runs, so those runs proved the *build command and functions
   bundling* work once `node_modules` exists; they did not exercise Netlify's own dependency
   install step at all, which is a different code path on Netlify's hosted builders than on this
   machine.
2. **Whether the deployed `/.netlify/functions/model-proxy` and `/.netlify/functions/capture`
   endpoints actually answer a live HTTPS request.** The local `netlify build --offline` runs
   proved the functions are found, bundled, and included in the build output; they did not invoke
   either function or open a network port.
3. **Whether five site names created via `netlify sites:create --name ...` all land on the exact
   subdomains this project's code and headers assume**, rather than a suffixed fallback name if one
   was already taken.
4. **Whether `netlify deploy --site <name>` genuinely deploys to an unlinked site by name alone**,
   as its own `--help` text states, without ever running `netlify link` first. This is documented
   CLI behaviour but was not exercised, since exercising it means deploying.
5. **The five-host curl loop in step 5**, which needs the sites to exist and have finished a build.
6. **The actual model provider calls in production** (step 4's "pre-flight both providers" advice
   from `docs/STORYBOARD.md`), including whether the two providers' free-tier quotas hold up on
   camera.
7. **DNS/TLS behaviour on the `*.netlify.app` subdomains**, though this is Netlify's own managed
   domain and has no project-specific risk beyond the above.
