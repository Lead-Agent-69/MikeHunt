#!/bin/sh
set -u

XVFB_PID=""
XVFB_OWNED=0
if [ -f /tmp/.X99-lock ]; then
  LOCK_PID="$(tr -cd '0-9' < /tmp/.X99-lock 2>/dev/null || true)"
  if [ -n "$LOCK_PID" ] && [ "$(cat "/proc/$LOCK_PID/comm" 2>/dev/null || true)" = "Xvfb" ]; then
    XVFB_PID="$LOCK_PID"
  else
    # Docker can preserve the lock/socket across a process restart even though
    # the old display server is gone. Remove only display 99's stale markers.
    rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  fi
fi
if [ -z "$XVFB_PID" ]; then
  Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -ac &
  XVFB_PID=$!
  XVFB_OWNED=1
  sleep 1
  if ! kill -0 "$XVFB_PID" 2>/dev/null; then
    echo "[xvfb] display 99 failed to start" >&2
    exit 1
  fi
fi
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
if [ "$XVFB_OWNED" -eq 1 ]; then
  kill "$XVFB_PID" 2>/dev/null || true
  wait "$XVFB_PID" 2>/dev/null || true
fi
exit "$EXIT_CODE"
