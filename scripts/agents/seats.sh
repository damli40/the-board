#!/usr/bin/env bash
# Usage: scripts/agents/seats.sh review|verdict
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
PHASE="${1:?review or verdict}"
case "$PHASE" in
  review)  PROMPT="The board is in REVIEW. Call read_board with section facts to see what both sides filed, then call search_exhibits or open_exhibit on every exhibit a contested fact points at, extract_text for pdf pages you rely on, then record_assessment on each fact that is disputed or countered. Quote exactly. Say which facts you assessed and your finding for each." ;;
  verdict) PROMPT="The board is in DRAFT VERDICT. Call cite on each fact your outcome rests on, then draft_verdict with outcome UPHELD or OVERTURNED, giving your grounds in three sentences (the tool's field for them is called reasoning). Say what you drafted." ;;
  *) echo "phase must be review or verdict" >&2; exit 2 ;;
esac
run_seat() {
  local seat="$1"
  run_one_shot "$seat" "$PROMPT" 24 | sed "s/^/[$seat] /"
}
run_seat seat1 & run_seat seat2 & wait
