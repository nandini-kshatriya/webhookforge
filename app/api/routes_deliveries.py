from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import Delivery, DeliveryStatus
from app.db.session import get_db
from app.schemas.delivery import DeliveryDetailOut, DeliveryOut
from app.workers.delivery_worker import deliver_webhook

router = APIRouter(prefix="/api/deliveries", tags=["deliveries"])


@router.get("", response_model=List[DeliveryOut])
def list_deliveries(
    status: Optional[DeliveryStatus] = Query(None, description="Filter by delivery status"),
    subscriber_id: Optional[str] = Query(None),
    event_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Delivery)
    if status is not None:
        query = query.filter(Delivery.status == status)
    if subscriber_id is not None:
        query = query.filter(Delivery.subscriber_id == subscriber_id)
    if event_id is not None:
        query = query.filter(Delivery.event_id == event_id)
    return query.order_by(Delivery.created_at.desc()).all()


@router.get("/{delivery_id}", response_model=DeliveryDetailOut)
def get_delivery(delivery_id: str, db: Session = Depends(get_db)):
    """Full delivery detail including every DeliveryAttempt, oldest first
    (relies on the `attempts` relationship's order_by in db/models.py)."""
    delivery = db.get(Delivery, delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return delivery


@router.post("/{delivery_id}/redeliver", response_model=DeliveryOut)
def redeliver(delivery_id: str, db: Session = Depends(get_db)):
    """Manually retry a delivery -- resets it to a fresh attempt cycle and
    re-enqueues it immediately, regardless of its current status (useful
    for both `dead` deliveries and ones you just want to force again).
    Past attempts stay in delivery_attempts as history; the new cycle's
    attempt numbering starts over from 1 for this delivery."""
    delivery = db.get(Delivery, delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    delivery.status = DeliveryStatus.pending
    delivery.attempt_count = 0
    delivery.next_attempt_at = datetime.utcnow()
    delivery.last_response_code = None
    delivery.last_response_body = None
    db.commit()
    db.refresh(delivery)

    deliver_webhook.delay(delivery.id)

    return delivery