#!/bin/sh
# Cold-start a scenario and print its [lab] result lines once it finishes.
#   scripts/run-scenario.sh <metro-log> "/refresh?auto=a" "first successful refresh"
LOG=$1; ROUTE=$2; DONE=$3
c=$(wc -l < "$LOG" | tr -d ' ')
"$(dirname "$0")/cold-start.sh" "$ROUTE"
for i in $(seq 300); do sed -n "$((c+1)),\$p" "$LOG" | grep -q "$DONE" && break; sleep 1; done
sed -n "$((c+1)),\$p" "$LOG" | grep -E "\[(net|result|rt)\]|ERROR" | sed -E 's/^ *LOG  \[lab\] //'
