#!/bin/bash
set -uo pipefail
for label in scan digest trigger; do
  launchctl bootout "gui/$UID/com.clyve.aeoradar.$label" 2>/dev/null && echo "removed $label" || echo "$label was not loaded"
  rm -f "$HOME/Library/LaunchAgents/com.clyve.aeoradar.$label.plist"
done
