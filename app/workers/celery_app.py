from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "webhookforge",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Register task modules so Celery knows about them (both when this process
# runs as a worker, and when the API process imports celery_app to call
# .delay()/.apply_async() on a task).
from app.workers import delivery_worker  # noqa: F401,E402