#!/bin/bash
set -e

echo "[start.sh] Running database migrations..."
alembic upgrade head

# Free tier = 512MB RAM, 0.1 CPU, and no separate worker service, so the
# Celery worker shares this container with the API:
#   --concurrency=1        one child process (default = one per CPU -> OOM risk)
#   --without-gossip/mingle/heartbeat
#                          skip cluster chatter we don't need with one worker
echo "[start.sh] Starting Celery worker..."
celery -A app.workers.celery_app worker \
  --loglevel=info \
  --concurrency=1 \
  --without-gossip --without-mingle --without-heartbeat &
CELERY_PID=$!

echo "[start.sh] Starting FastAPI (uvicorn) on port ${PORT:-8000}..."
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" &
UVICORN_PID=$!

shutdown() {
  kill -TERM "$CELERY_PID" "$UVICORN_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
# Platform stop signal (deploy, spin-down): stop both children cleanly.
trap 'echo "[start.sh] stop signal received"; shutdown; exit 143' TERM INT

# Supervise: exit as soon as EITHER process dies. Without this, a crashed or
# OOM-killed worker leaves the API happily answering while every delivery
# silently piles up in the queue. Exiting makes the platform restart the
# whole container, which is the only self-healing available on one free box.
CODE=0
wait -n || CODE=$?
[ "$CODE" -eq 0 ] && CODE=1   # a long-running process exiting at all is a failure
echo "[start.sh] a process exited unexpectedly (code $CODE); stopping so the platform restarts the container"
shutdown
exit "$CODE"