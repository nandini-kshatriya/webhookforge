import logging
from datetime import datetime

from app.core.config import settings
from app.db.models import Delivery, DeliveryAttempt, DeliveryStatus, Event, Subscriber
from app.db.session import SessionLocal
from app.delivery.backoff import compute_next_attempt_at
from app.delivery.sender import send_delivery
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="deliver_webhook")
def deliver_webhook(delivery_id: str) -> None:
    db = SessionLocal()
    try:
        delivery = db.get(Delivery, delivery_id)
        if delivery is None:
            logger.warning("Delivery %s not found, skipping", delivery_id)
            return

        # Already resolved -- e.g. a manual redeliver ran before a stale
        # queued task for the same delivery got picked up.
        if delivery.status in (DeliveryStatus.success, DeliveryStatus.dead):
            return

        subscriber = db.get(Subscriber, delivery.subscriber_id)
        event = db.get(Event, delivery.event_id)
        if subscriber is None or event is None:
            logger.error(
                "Delivery %s missing subscriber/event, marking dead", delivery_id
            )
            delivery.status = DeliveryStatus.dead
            db.commit()
            return

        attempt_number = delivery.attempt_count + 1

        result = send_delivery(
            target_url=subscriber.target_url,
            secret=subscriber.secret,
            delivery_id=delivery.id,
            event_type=event.event_type,
            event_payload=event.payload,
        )

        db.add(
            DeliveryAttempt(
                delivery_id=delivery.id,
                attempt_number=attempt_number,
                response_code=result.response_code,
                response_time_ms=result.response_time_ms,
                error=result.error,
            )
        )
        delivery.attempt_count = attempt_number
        delivery.last_response_code = result.response_code
        delivery.last_response_body = result.error

        if result.success:
            delivery.status = DeliveryStatus.success
            db.commit()
            logger.info("Delivery %s succeeded on attempt %d", delivery_id, attempt_number)
            return

        if attempt_number >= settings.MAX_DELIVERY_ATTEMPTS:
            delivery.status = DeliveryStatus.dead
            db.commit()
            logger.warning(
                "Delivery %s exhausted %d attempts, marked dead",
                delivery_id,
                attempt_number,
            )
            return

        # Schedule a retry with exponential backoff + jitter.
        delivery.status = DeliveryStatus.failed
        delivery.next_attempt_at = compute_next_attempt_at(attempt_number)
        db.commit()

        delay_seconds = max(
            (delivery.next_attempt_at - datetime.utcnow()).total_seconds(), 0
        )
        deliver_webhook.apply_async(args=[delivery.id], countdown=delay_seconds)
        logger.info(
            "Delivery %s failed attempt %d, retrying in %.0fs",
            delivery_id,
            attempt_number,
            delay_seconds,
        )
    finally:
        db.close()