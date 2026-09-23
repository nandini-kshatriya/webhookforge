from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Event
from app.delivery.dispatcher import dispatch
from app.schemas.event import EventCreate, EventOut
from app.workers.delivery_worker import deliver_webhook

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def publish_event(payload: EventCreate, db: Session = Depends(get_db)):
    """Publish an event. If idempotency_key has already been used, the
    existing event is returned instead of creating a duplicate -- this is
    what makes it safe for a producer to retry its own publish call."""
    existing = (
        db.query(Event)
        .filter(Event.idempotency_key == payload.idempotency_key)
        .first()
    )
    if existing:
        return existing

    event = Event(
        event_type=payload.event_type,
        payload=payload.payload,
        idempotency_key=payload.idempotency_key,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        # Race: two requests with the same idempotency_key landed concurrently.
        db.rollback()
        existing = (
            db.query(Event)
            .filter(Event.idempotency_key == payload.idempotency_key)
            .first()
        )
        return existing
    db.refresh(event)

    # Fan out to every active subscriber for this event_type, then enqueue
    # a Celery delivery task per subscriber.
    deliveries = dispatch(event, db)
    for delivery in deliveries:
        deliver_webhook.delay(delivery.id)

    return event


@router.get("", response_model=List[EventOut])
def list_events(db: Session = Depends(get_db)):
    return db.query(Event).order_by(Event.created_at.desc()).all()
