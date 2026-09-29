import math

from celery import Celery

from app.core.config import settings
from app.core.logging import configure_logging

# Configure structured JSON logging for this process. main.py does the same
# for the API process; this call is what makes it actually happen for a
# real Celery worker started via `celery -A app.workers.celery_app worker`,
# which never imports main.py.
configure_logging()

# No result backend: nothing in this project ever calls .get() on a task
# result -- delivery state lives in Postgres, not in Celery. Dropping the
# backend removes a whole class of Redis writes (and the extra TLS/URL
# config it would need against a managed Redis).
celery_app = Celery("webhookforge", broker=settings.REDIS_URL)

# Retries are scheduled with Celery's `countdown`, so a task can sit
# reserved-but-unacknowledged in a worker until its ETA. If the worker dies
# (e.g. a free-tier host spins down), Redis only re-delivers unacked tasks
# after `visibility_timeout`. It must be LONGER than the longest countdown
# we ever schedule, or live ETA tasks get delivered twice; but no longer
# than needed, or retries stall for the default full hour after a restart.
_longest_countdown = (
    settings.BACKOFF_BASE_SECONDS * (2 ** (settings.MAX_DELIVERY_ATTEMPTS - 1)) * 1.25
)
_visibility_timeout = math.ceil(_longest_countdown) + 300

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        "polling_interval": settings.BROKER_POLL_INTERVAL_SECONDS,
        "visibility_timeout": _visibility_timeout,
    },
)

# Register task modules so Celery knows about them (both when this process
# runs as a worker, and when the API process imports celery_app to call
# .delay()/.apply_async() on a task).
from app.workers import delivery_worker  # noqa: F401,E402