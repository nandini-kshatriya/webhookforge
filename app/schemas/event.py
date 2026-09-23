from typing import Any, Dict

from pydantic import BaseModel


class EventCreate(BaseModel):
    event_type: str
    payload: Dict[str, Any]
    idempotency_key: str


class EventOut(BaseModel):
    id: str
    event_type: str
    payload: Dict[str, Any]
    idempotency_key: str

    model_config = {"from_attributes": True}
