#!/usr/bin/env bash
# Usage: scripts/agents/agent.sh <A|B|seat1|seat2> [--continue] ["initial prompt"]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ACTOR="${1:?actor: A, B, seat1 or seat2}"; shift
# Validate here, not three lines later. An unknown actor otherwise reached
# `mcp_config_for` and produced a config for a panel that does not exist, and
# a brief path that does not exist, and the failure arrived as a cat error
# about a missing file rather than as "that is not one of the four actors".
case "$ACTOR" in A|B|seat1|seat2) ;; *) echo "actor must be A, B, seat1 or seat2" >&2; exit 2;; esac
CFG="$(mcp_config_for "$ACTOR")"
BRIEF="$ROOT/packages/external-agent/briefs/$ACTOR.md"
LIST="$(allowed_tools_for "$ACTOR" | tr ' ' ',' | sed 's/,$//')"
# Portable template: BSD mktemp accepts a bare `-t prefix`, GNU mktemp does
# not — it wants a template containing X's, and rejects this one outright.
cd "$(mktemp -d "${TMPDIR:-/tmp}/the-board-agent.XXXXXX")"  # fresh cwd: no project CLAUDE.md loads
# "$@" (--continue and/or a prompt) goes right after the binary, before any
# option. Build the whole command in one array with conditional appends —
# bash 3.2 (macOS default) throws "unbound variable" under set -u if you
# instead declare an array empty (MODEL_ARGS=()) and expand it unconditionally
# ("${MODEL_ARGS[@]}") later; this array is never empty when expanded, so
# that trap doesn't apply here. --allowedTools stays the LAST option on every
# path. exec can't target a shell function (run_clean), so call env directly.
cmd=(claude "$@" --mcp-config "$CFG" --strict-mcp-config --tools "" --append-system-prompt "$(cat "$BRIEF")")
if [ -n "${BOARD_AGENT_MODEL:-}" ]; then cmd+=(--model "$BOARD_AGENT_MODEL"); fi
cmd+=(--allowedTools "$LIST")
if [ "${BOARD_DRY_RUN:-}" = "1" ]; then
  printf '%q ' "${cmd[@]}"; echo
  exit 0
fi
exec env -u ANTHROPIC_API_KEY -u CLAUDECODE "${cmd[@]}"
