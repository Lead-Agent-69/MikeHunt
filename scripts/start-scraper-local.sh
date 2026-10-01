#!/bin/sh
set -u

Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -ac &
XVFB_PID=$!
export DISPLAY=:99

npx tsx scripts/scrape-local.ts &
RUNNER_PID=$!

forward_signal() {
  kill -TERM "$RUNNER_PID" 2>/dev/null || true
  wait "$RUNNER_PID" 2>/dev/null || true
}
trap forward_signal INT TERM

wait "$RUNNER_PID"
EXIT_CODE=$?
trap - INT TERM
kill "$XVFB_PID" 2>/dev/null || true
wait "$XVFB_PID" 2>/dev/null || true
exit "$EXIT_CODE"
