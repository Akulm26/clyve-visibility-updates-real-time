#!/bin/bash
# Wrapper for launchd, which starts with almost no PATH and never reads a shell
# profile. Everything this script needs has to be located explicitly.
set -uo pipefail

cd "$(dirname "$0")" || exit 1

# nvm installs node under a version-specific directory that launchd knows
# nothing about, so pick the newest installed version rather than hard-coding a
# path that breaks on the next upgrade. Homebrew and system paths follow as
# fallbacks for a non-nvm setup.
NVM_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NVM_BIN:+$NVM_BIN:}$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p logs
LOG="logs/$(date +%Y-%m).log"
CMD="${1:-scan}"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $CMD ==="

  # Fail loudly and specifically. A missing binary here means every scheduled
  # run silently does nothing, which is the worst possible failure for a tool
  # whose normal state is silence.
  missing=0
  for bin in node claude git; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      echo "FATAL: '$bin' not found on PATH ($PATH)"
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "--- aborted: fix the PATH in run.sh ---"
    exit 127
  fi

  echo "node $(node -v) at $(command -v node)"
  # A scan takes minutes; without this the Mac can idle-sleep halfway through
  # and every remaining fetch and model call stalls until it wakes. -i holds
  # off idle sleep, -s system sleep on mains power. Neither can keep a closed
  # lid on battery awake — pipeline.mjs refuses to start in that state.
  caffeinate -i -s node pipeline.mjs "$CMD"
  echo "--- exit $? ---"
} >>"$LOG" 2>&1

# Keep the state ledger in git so there is a record of what was sent when.
if [ -n "$(git status --porcelain state/ 2>/dev/null)" ]; then
  {
    git add state/
    git commit -q -m "state: $CMD $(date -u +%Y-%m-%dT%H:%MZ)"
    git push -q || echo "push failed (offline?)"
  } >>"$LOG" 2>&1
fi
