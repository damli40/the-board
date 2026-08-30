# Pre-submission checklist

Controller ruling (Task 10): the commands below are **not run by the build agent**. Publishing a
repo, pushing to a remote, and deploying five live hosts are irreversible, outward-facing actions
that stay with the project owner. This file is that owner's checklist: run each command yourself,
in order, after you have actually created the public repo and deployed the five origins, and confirm
the expected output before treating the submission as ready.

None of these have been run as part of this task. Nothing has been pushed, published, or deployed.

---

## 1. Licence and visibility

```bash
gh repo view --json licenseInfo,visibility --jq '{licence:.licenseInfo.spdxId, vis:.visibility}'
```

**Expected output:**
```json
{"licence":"MIT","vis":"PUBLIC"}
```

`LICENSE` at the repo root already reads MIT (see `LICENSE`), so this command should pass as soon as
the repo exists on GitHub and is set to public. If `licence` comes back `null`, GitHub has not
recognised the file, usually because it is not named exactly `LICENSE` at the repo root or its
contents do not match a recognised SPDX template closely enough; if `vis` comes back anything other
than `PUBLIC`, the repo's visibility setting needs changing before submitting.

## 2. The real WebMCP call is in the shipped code

```bash
grep -rn "modelContext.registerTool" packages/ | head -1
```

**Expected output:** at least one match, for example:
```
packages/record/src/webmcp/registry.ts:37:        await this.mc.registerTool({
```

(The exact call is `this.mc.registerTool(...)`, where `this.mc` is `document.modelContext ??
navigator.modelContext` under the hood, feature-detected in
`packages/record/src/webmcp/env.ts`; a grep for the literal string `modelContext.registerTool` will
only match wherever that variable is itself named `modelContext`, so if this specific grep comes back
empty, also check `grep -rn "registerTool" packages/` before concluding the call is missing.)

## 3. Origin-Agent-Cluster on all five live hosts

```bash
for h in theboard-record.netlify.app theboard-a.netlify.app theboard-b.netlify.app \
         theboard-seat1.netlify.app theboard-seat2.netlify.app; do
  curl -sI "https://$h" | grep -qi 'origin-agent-cluster' && echo "$h OK" || echo "$h MISSING HEADER"
done
```

**Expected output:** five lines, each ending `OK`.

**This only applies once the five sites above are live.** As of this checklist's last edit they are
not: this project runs locally on five `localhost` ports (`8080`–`8084`, see `README.md`'s
quickstart and `packages/record/src/config/origins.ts`'s `DEV_ORIGINS`), and the five
`theboard-*.netlify.app` sites named above (`PROD_ORIGINS` in that same file) have not been created
or deployed yet. `docs/evidence/deploy.md` is the runbook for creating and deploying them. Do not run
this command, or cite its result, before all five sites are actually deployed. When you do run it, a
`MISSING HEADER` line means that origin's Netlify site is not serving the `Origin-Agent-Cluster`
header from its `netlify.toml`; check that site's deployed `netlify.toml` matches the one in this
repo (`packages/record/netlify.toml` for the parent, `packages/panel/netlify.toml` for the four panel
sites) and that its `Permissions-Policy` and `Origin-Agent-Cluster` origin values match `PROD_ORIGINS`
/ `PROD_PARENT_ORIGIN`, not the localhost dev values.

## 4. Naming-rule sweep (irreversible if skipped)

```bash
grep -rniE '<organisation>|<counterparty>|<sector>|<event-name>|\$[0-9]' \
  README.md SUBMISSION.md DESCRIPTION.md DESCRIPTION2.md docs/ packages/ \
  --include='*.md' --include='*.ts' --include='*.tsx'
```

**Expected output:** no matches (empty output, exit code 1 from grep).

Replace the bracketed placeholders in that command with the actual organisation name, counterparty
name, sector and event type from the real dispute before running it; the pattern above is a template,
not the literal command. Also run it against the video script and the Devpost form text once those
exist, not just the files in this repository. A public artifact cannot be un-published: if this
command finds anything, stop and fix it before the repo goes public, not after.

A version of this sweep (dollar amounts, organisation/sector/event keywords, proper nouns, third-party
URLs, run by hand against `README.md`, `SUBMISSION.md`, `DESCRIPTION.md`, `DESCRIPTION2.md`, `docs/`
and `packages/`) came back clean while writing these submission artefacts. The one file it flagged,
a working note that named resolvable organisations and dollar figures from already-public third-party
incidents, has since been untracked and is no longer part of the published repository, so the sweep
is now clean on the published tree with no exception to carry. Nothing personal was ever exposed by
it; it was removed because it breached the naming rule as written, and because it argued for a design
concept this project abandoned. Re-run the literal command above yourself before publishing
regardless, since anything added since (a video script, the Devpost form itself) has not been swept,
and a summary of a past run is not a substitute for running it again on the current state of the
repo.

## 5. Secrets sweep on the built bundle

Not one of the brief's original four checks, but named in `CLAUDE.md §0` as a rule that overrides
everything else: **no secrets in client code**, checked before any deploy.

```bash
npm run build --workspace=packages/record
npm run build --workspace=packages/panel
grep -rn "sk-\|sk_live\|sk_test" packages/record/dist packages/panel/dist
```

**Expected output:** no matches. This project uses exactly one secret, `MODEL_API_KEY`, read only in
[`packages/panel/netlify/functions/model-proxy.ts`](../../packages/panel/netlify/functions/model-proxy.ts),
which runs server-side as a Netlify Function (deployed unchanged to all four panel sites, each with
its own environment variable value) and is never bundled into the client build.
[`packages/record/netlify/functions/capture.ts`](../../packages/record/netlify/functions/capture.ts)
needs no key at all; it only fetches a URL. This command is the mechanical proof that neither
function's secret leaks into a client bundle, not an assumption to trust by reading the source.

---

## Acceptance

Do not consider this project ready to submit until every command above has actually been run against
the live, published state (repo and deploys), and every expected output was observed, not assumed.
