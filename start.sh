#!/bin/sh
set -e

echo "[start.sh] Running database migrations..."
alembic upgrade head

echo "[start.sh] Starting Celery worker in background..."
celery -A app.workers.celery_app worker --loglevel=info &

echo "[start.sh] Starting FastAPI (uvicorn) on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
