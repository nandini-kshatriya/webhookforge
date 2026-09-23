from typing import List

from sqlalchemy.orm import Session

from app.db.models import Delivery, DeliveryStatus, Event, Subscriber


def dispatch(event: Event, db: Session) -> List[Delivery]:
    """Fan out a published event to every active subscriber whose
    subscribed_events includes this event's type. Creates one pending
    Delivery row per matching subscriber and returns them so the caller
    can enqueue a Celery task for each."""
    subscribers = db.query(Subscriber).filter(Subscriber.is_active.is_(True)).all()
    matching = [s for s in subscribers if event.event_type in s.subscribed_events]

    deliveries: List[Delivery] = []
    for subscriber in matching:
        delivery = Delivery(
            event_id=event.id,
            subscriber_id=subscriber.id,
            status=DeliveryStatus.pending,
        )
        db.add(delivery)
        deliveries.append(delivery)

    db.commit()
    for delivery in deliveries:
        db.refresh(delivery)

    return deliveries