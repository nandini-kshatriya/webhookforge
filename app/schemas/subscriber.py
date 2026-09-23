from typing import List, Optional

from pydantic import BaseModel, Field


class SubscriberCreate(BaseModel):
    name: str
    target_url: str
    subscribed_events: List[str] = Field(default_factory=list)


class SubscriberUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    subscribed_events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class SubscriberOut(BaseModel):
    id: str
    name: str
    target_url: str
    subscribed_events: List[str]
    is_active: bool

    model_config = {"from_attributes": True}
