#!/bin/bash
# Wrapper for launchd, which starts with almost no PATH and no shell profile.
set -uo pipefail

cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p logs
LOG="logs/$(date +%Y-%m).log"
CMD="${1:-scan}"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $CMD ==="
  node pipeline.mjs "$CMD"
  echo "--- exit $? ---"
} >>"$LOG" 2>&1

# Keep the state ledger in git so there is a record of what was sent when.
if [ -n "$(git status --porcelain state/ 2>/dev/null)" ]; then
  git add state/ >>"$LOG" 2>&1
  git commit -q -m "state: $CMD $(date -u +%Y-%m-%dT%H:%MZ)" >>"$LOG" 2>&1
  git push -q >>"$LOG" 2>&1 || echo "push failed (offline?)" >>"$LOG"
fi
