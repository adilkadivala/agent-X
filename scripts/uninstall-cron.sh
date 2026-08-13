#!/usr/bin/env bash
# Remove x-agent lines from user crontab.
set -euo pipefail
EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -v 'projects/x-agent' | grep -v 'x-agent.*run worker' | grep -v '^# x-agent' || true)"
if [ -z "$(echo "$FILTERED" | grep -v '^$' || true)" ]; then
  crontab -r 2>/dev/null || true
  echo "Crontab cleared (was only x-agent)."
else
  printf '%s\n' "$FILTERED" | crontab -
  echo "Removed x-agent cron lines. Remaining:"
  crontab -l
fi
