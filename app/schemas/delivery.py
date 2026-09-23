from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.db.models import DeliveryStatus


class DeliveryOut(BaseModel):
    id: str
    event_id: str
    subscriber_id: str
    status: DeliveryStatus
    attempt_count: int
    next_attempt_at: datetime
    last_response_code: Optional[int]
    last_response_body: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeliveryAttemptOut(BaseModel):
    id: str
    attempt_number: int
    response_code: Optional[int]
    response_time_ms: Optional[int]
    error: Optional[str]
    attempted_at: datetime

    model_config = {"from_attributes": True}


class DeliveryDetailOut(DeliveryOut):
    """Same fields as DeliveryOut, plus the full per-attempt audit trail."""

    attempts: List[DeliveryAttemptOut] = []