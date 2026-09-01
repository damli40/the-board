#!/usr/bin/env bash
# Shared settings for the four agent launchers. Nothing secret lives here.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRIDGE="$ROOT/packages/external-agent/src/cli.mjs"
CDP="${BOARD_CDP_URL:-http://127.0.0.1:9222}"
BOARD_AGENT="${BOARD_AGENT:-claude}"  # claude|codex, per one-shot session
# macOS ships bash 3.2 (no associative arrays), so origins are a function.
if [ "${BOARD_LOCAL:-}" = "1" ]; then
  RECORD_URL="${BOARD_RECORD_URL:-http://localhost:8080}"
  panel_for() { case "$1" in A) echo http://localhost:8081;; B) echo http://localhost:8082;; seat1) echo http://localhost:8083;; seat2) echo http://localhost:8084;; *) echo "unknown actor: $1" >&2; return 2;; esac; }
else
  RECORD_URL="${BOARD_RECORD_URL:-https://theboard-record.netlify.app}"
  panel_for() { case "$1" in A) echo https://theboard-a.netlify.app;; B) echo https://theboard-b.netlify.app;; seat1) echo https://theboard-seat1.netlify.app;; seat2) echo https://theboard-seat2.netlify.app;; *) echo "unknown actor: $1" >&2; return 2;; esac; }
fi
ALL_TOOLS="file_exhibit file_fact concede dispute open_exhibit read_board object extract_text search_exhibits record_assessment cite draft_verdict spend_appeal"

actor_slug() { echo "the-board-$(echo "$1" | tr '[:upper:]' '[:lower:]')"; }

mcp_config_for() {  # $1 = actor  → prints a path to a temp JSON config (Claude Code)
  local actor="$1" slug; slug="$(actor_slug "$actor")"
  # Portable template — see agent.sh: GNU mktemp rejects a bare `-t prefix`.
  local cfg; cfg="$(mktemp "${TMPDIR:-/tmp}/the-board-mcp.XXXXXX")"
  cat > "$cfg" <<EOF
{"mcpServers":{"$slug":{"command":"node","args":["$BRIDGE","--actor","$actor","--record-url","$RECORD_URL","--panel-url","$(panel_for "$actor")","--cdp","$CDP"]}}}
EOF
  echo "$cfg"
}

codex_mcp_args_toml_for() {  # $1 = actor → args array, same bridge args as mcp_config_for's
  # A JSON array of plain strings is also a valid TOML array, so one line serves both.
  local actor="$1"
  printf '["%s","--actor","%s","--record-url","%s","--panel-url","%s","--cdp","%s"]' \
    "$BRIDGE" "$actor" "$RECORD_URL" "$(panel_for "$actor")" "$CDP"
}

allowed_tools_for() {  # $1 = actor → space-separated mcp__<slug>__<tool> list
  local slug; slug="$(actor_slug "$1")"
  for t in $ALL_TOOLS; do printf 'mcp__%s__%s ' "$slug" "$t"; done
}

run_clean() { env -u ANTHROPIC_API_KEY -u CLAUDECODE "$@"; }  # call as a function, never exec (can't exec a shell function)

# run_one_shot <actor> <prompt> [max_turns=10] — a single non-interactive turn,
# via Claude Code (BOARD_AGENT=claude, default) or Codex (BOARD_AGENT=codex).
# Runs from a fresh temp dir so no project CLAUDE.md/AGENTS.md loads, holds
# only the actor's MCP tools (no built-in Bash/Read/etc.), and never reads
# the real stdin (both `claude -p` and `codex exec` will otherwise block on
# it). Set BOARD_DRY_RUN=1 to print the command instead of running it.
run_one_shot() {
  local actor="$1" prompt="$2" max_turns="${3:-10}"
  local brief; brief="$ROOT/packages/external-agent/briefs/$actor.md"
  local tmpdir; tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/the-board-agent.XXXXXX")"
  case "$BOARD_AGENT" in
    claude)
      local cfg list cmd
      cfg="$(mcp_config_for "$actor")"
      list="$(allowed_tools_for "$actor" | tr ' ' ',' | sed 's/,$//')"
      cmd=(claude -p "$prompt" --mcp-config "$cfg" --strict-mcp-config --tools "" \
        --append-system-prompt "$(cat "$brief")" --max-turns "$max_turns")
      if [ -n "${BOARD_AGENT_MODEL:-}" ]; then cmd+=(--model "$BOARD_AGENT_MODEL"); fi
      cmd+=(--allowedTools "$list")  # last on every path: never let a variadic option follow it
      if [ "${BOARD_DRY_RUN:-}" = "1" ]; then
        printf '%q ' "${cmd[@]}"; printf '< /dev/null\n'
        return 0
      fi
      ( cd "$tmpdir" && run_clean "${cmd[@]}" < /dev/null )
      ;;
    codex)
      # Codex ignores `-c mcp_servers.<name>.command/args` overrides: on 2 Sep 2026
      # the turn ran and reported no Board tools at all, twice. A config file does
      # work, so write one into a throwaway CODEX_HOME. The real Codex home is only
      # read, for the sign-in it holds; nothing global changes.
      local slug args_toml full_prompt codex_home auth_src cmd status
      slug="$(actor_slug "$actor")"
      args_toml="$(codex_mcp_args_toml_for "$actor")"
      full_prompt="Your role and rules:
$(cat "$brief")

Task:
$prompt"
      codex_home="$(mktemp -d "${TMPDIR:-/tmp}/the-board-codex.XXXXXX")"
      auth_src="${CODEX_HOME:-$HOME/.codex}/auth.json"
      # default_tools_approval_mode covers the Board's own server, in this throwaway
      # config, for this one run: it never touches the user's ~/.codex/config.toml or
      # any other MCP server. Without it a call that changes the record comes back as
      # `user cancelled MCP tool call`. With it, Codex keeps its own shell sandbox,
      # so the run needs no bypass flag of any kind.
      cat > "$codex_home/config.toml" <<EOF
[mcp_servers.$slug]
command = "node"
args = $args_toml
default_tools_approval_mode = "approve"
EOF
      cmd=(CODEX_HOME="$codex_home" codex exec --skip-git-repo-check --sandbox read-only -C "$tmpdir")
      if [ -n "${BOARD_AGENT_MODEL:-}" ]; then cmd+=(--model "$BOARD_AGENT_MODEL"); fi
      cmd+=("$full_prompt")
      if [ "${BOARD_DRY_RUN:-}" = "1" ]; then
        printf '# codex config: %s\n' "$codex_home/config.toml"
        printf '%q ' "${cmd[@]}"; printf '< /dev/null\n'
        return 0
      fi
      if [ ! -f "$auth_src" ]; then
        echo 'codex is not logged in: run `codex login` first' >&2
        return 2
      fi
      cp "$auth_src" "$codex_home/auth.json"
      status=0
      run_clean "${cmd[@]}" < /dev/null || status=$?
      rm -f "$codex_home/auth.json"  # do not leave a second copy of the sign-in in /tmp
      return "$status"
      ;;
    *) echo "BOARD_AGENT must be claude or codex, got: $BOARD_AGENT" >&2; return 2 ;;
  esac
}
