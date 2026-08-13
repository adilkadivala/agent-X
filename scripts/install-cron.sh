#!/usr/bin/env bash
# Install user crontab for x-agent (unattended posts).
# Usage: npm run cron:install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
NPM_BIN="$(command -v npm)"
LOG="$ROOT/data/cron.log"
DISPLAY_VAL="${DISPLAY:-:1}"

mkdir -p "$ROOT/data"

# NOTE: Prefer long-running `npm run observe` (keeps X window open).
# Cron one-shot worker still works for legacy engage-only cycles.
# Every 8 minutes — feed engage (no search/watchlist)
CRON_LINE="*/8 * * * * cd \"$ROOT\" && DISPLAY=$DISPLAY_VAL PATH=\"$NODE_BIN:/usr/bin:/bin\" \"$NPM_BIN\" run worker >> \"$LOG\" 2>&1"

# Preserve other crontab lines; replace any existing x-agent worker lines
EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -v 'projects/x-agent' | grep -v 'x-agent.*run worker' || true)"
{
  printf '%s\n' "$FILTERED"
  echo "# x-agent — auto post (see $ROOT/.env DAILY_MAX / POST_WINDOWS / MIN_POST_GAP_MINUTES)"
  echo "$CRON_LINE"
} | grep -v '^$' | crontab -

echo "Installed crontab:"
crontab -l | grep -A1 'x-agent' || crontab -l | tail -3
echo ""
echo "Log: $LOG"
echo "Ensure .env has DRY_RUN=false, PC stays on, and you're logged into X (npm run browser:login)."
echo "Pause anytime: touch $ROOT/data/PAUSED   or   PAUSED=true in .env"
