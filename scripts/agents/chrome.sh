#!/usr/bin/env bash
# Launch a throwaway Chrome with remote debugging on localhost and WebMCP's
# testing flag pre-seeded, then open the record. Never your daily profile.
set -euo pipefail
# BOARD_ROOM_CODE is OPTIONAL: the bridge never touches the model proxy, so a
# judge needs neither a code nor a key to open the record and watch. Set it
# only to land straight in a specific room (never write it in a file).
RECORD_URL="${BOARD_RECORD_URL:-https://theboard-record.netlify.app}"
PROFILE="${BOARD_CHROME_PROFILE:-$HOME/.the-board/agent-chrome}"
CHROME="${BOARD_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p "$PROFILE"
if [ -n "${BOARD_ROOM_CODE:-}" ]; then
  URL="$RECORD_URL/?code=$BOARD_ROOM_CODE"
else
  URL="$RECORD_URL/"
fi
# WebMCP is behind a flag in Chrome 152. The command-line switch is what
# chrome://flags/#enable-webmcp-testing expands to (verified 1 Sep 2026). If a
# later Chrome renames the features, seed the profile instead:
#   printf '%s' '{"browser":{"enabled_labs_experiments":["enable-webmcp-testing@1"]}}' > "$PROFILE/Local State"
# Say out loud what this window is. A throwaway Chrome looks exactly like a
# normal one, and the next person to reach for Chrome from the Dock gets this
# window: no extensions, no bookmarks, no sign-in, and a debugging port that
# any local process can drive. Somebody who mistakes it for their own profile
# may sign in to it, which puts a real account behind that open port.
echo "The Board: this is a THROWAWAY Chrome profile with a debugging port on localhost. Quit it when you are done; do not sign in and do not install extensions in it." >&2
exec "$CHROME" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --window-size=1400,1000 \
  --enable-features=WebMCP,DevToolsWebMCPSupport \
  "$URL"
