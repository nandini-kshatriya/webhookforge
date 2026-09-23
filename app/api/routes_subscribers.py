import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Subscriber
from app.schemas.subscriber import SubscriberCreate, SubscriberUpdate, SubscriberOut

router = APIRouter(prefix="/api/subscribers", tags=["subscribers"])


@router.post("", response_model=SubscriberOut, status_code=201)
def create_subscriber(payload: SubscriberCreate, db: Session = Depends(get_db)):
    """Register a new webhook subscriber. Generates a secret used later
    (Phase 2) to HMAC-sign every delivery to this subscriber's target_url."""
    subscriber = Subscriber(
        name=payload.name,
        target_url=payload.target_url,
        subscribed_events=payload.subscribed_events,
        secret=secrets.token_hex(32),
    )
    db.add(subscriber)
    db.commit()
    db.refresh(subscriber)
    return subscriber


@router.get("", response_model=List[SubscriberOut])
def list_subscribers(db: Session = Depends(get_db)):
    return db.query(Subscriber).order_by(Subscriber.created_at.desc()).all()


@router.get("/{subscriber_id}", response_model=SubscriberOut)
def get_subscriber(subscriber_id: str, db: Session = Depends(get_db)):
    subscriber = db.get(Subscriber, subscriber_id)
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    return subscriber


@router.patch("/{subscriber_id}", response_model=SubscriberOut)
def update_subscriber(
    subscriber_id: str, payload: SubscriberUpdate, db: Session = Depends(get_db)
):
    subscriber = db.get(Subscriber, subscriber_id)
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subscriber, field, value)
    db.commit()
    db.refresh(subscriber)
    return subscriber


@router.delete("/{subscriber_id}", status_code=204)
def delete_subscriber(subscriber_id: str, db: Session = Depends(get_db)):
    subscriber = db.get(Subscriber, subscriber_id)
    if not subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    db.delete(subscriber)
    db.commit()
