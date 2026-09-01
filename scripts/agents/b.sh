#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
PROMPT="Read your side's file below, then act. First call read_board with section facts to see what A has filed. Then file ONE exhibit (kind text) from the file's 'Exhibit to file' block and ONE fact that points at it and answers A's latest fact (set counters to that fact's id). Say what you filed, with ids.

After that, dispute A's newest fact with a verbatim quote. Call read_board with section facts and section exhibits to find A's newest fact and the exhibit it points at. Call open_exhibit on that exhibit; this records your read receipt. Then call dispute on A's newest fact with exhibitId set to that exhibit's id, quote set to an exact passage copied verbatim from the textPreview field that open_exhibit returned (never paraphrase it), and because set to one sentence saying that passage is a client statement, not a record of sending. If dispute is refused, quote the refusal you got back and try once more, following whatever 'next move' it names. Report the dispute id, or the refusal, in one line.

$(cat "$ROOT/cases/demo/b-side.md")"
run_one_shot B "$PROMPT" 16
