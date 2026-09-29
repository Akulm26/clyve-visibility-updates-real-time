#!/bin/bash
# Install (or reinstall) the launchd timers. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$ROOT/logs"

for label in scan digest trigger; do
  plist="$AGENTS/com.clyve.aeoradar.$label.plist"
  sed "s|__ROOT__|$ROOT|g" "$ROOT/launchd/com.clyve.aeoradar.$label.plist" > "$plist"
  launchctl bootout "gui/$UID/com.clyve.aeoradar.$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$plist"
  echo "installed com.clyve.aeoradar.$label"
done

chmod +x "$ROOT/run.sh"

echo
echo "Scheduled in machine-local time ($(date +%Z)):"
echo "  scan    00:15, 06:15, 12:15, 18:15 daily"
echo "  digest  Monday 09:00"
echo
echo "Phone trigger: email yourself with 'scan' (or 'digest') in the subject."
echo "Checked every 2 minutes. Still silent if there is no news."
echo
echo "Force a run now:   launchctl kickstart -k gui/$UID/com.clyve.aeoradar.scan"
echo "Check they exist:  launchctl list | grep aeoradar"
echo "Remove them:       ./uninstall-schedule.sh"
