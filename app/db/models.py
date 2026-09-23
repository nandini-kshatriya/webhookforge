import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    Enum,
    JSON,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship

from app.db.session import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class DeliveryStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    dead = "dead"


class Subscriber(Base):
    __tablename__ = "subscribers"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    target_url = Column(String, nullable=False)
    secret = Column(String, nullable=False)  # used to HMAC-sign deliveries (Phase 2)
    subscribed_events = Column(ARRAY(String), nullable=False, default=list)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    deliveries = relationship("Delivery", back_populates="subscriber")


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_type = Column(String, nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    idempotency_key = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    deliveries = relationship("Delivery", back_populates="event")


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    subscriber_id = Column(String, ForeignKey("subscribers.id"), nullable=False)
    status = Column(
        Enum(DeliveryStatus, name="deliverystatus"),
        default=DeliveryStatus.pending,
        nullable=False,
        index=True,
    )
    attempt_count = Column(Integer, default=0, nullable=False)
    next_attempt_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_response_code = Column(Integer, nullable=True)
    last_response_body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    event = relationship("Event", back_populates="deliveries")
    subscriber = relationship("Subscriber", back_populates="deliveries")
    attempts = relationship(
        "DeliveryAttempt",
        back_populates="delivery",
        order_by="DeliveryAttempt.attempted_at",
    )

class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"

    id = Column(String, primary_key=True, default=gen_uuid)
    delivery_id = Column(String, ForeignKey("deliveries.id"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    response_code = Column(Integer, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    delivery = relationship("Delivery", back_populates="attempts")
