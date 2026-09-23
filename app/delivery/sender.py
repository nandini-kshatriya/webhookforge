import time
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import settings
from app.delivery.signer import canonical_json, sign_payload


@dataclass
class SendResult:
    success: bool
    response_code: Optional[int]
    response_time_ms: int
    error: Optional[str]


def send_delivery(
    target_url: str,
    secret: str,
    delivery_id: str,
    event_type: str,
    event_payload: dict,
) -> SendResult:
    """POST a signed webhook to the subscriber's target_url.

    The body includes delivery_id so subscribers can dedupe on their side
    too (at-least-once delivery: this platform may call the same URL more
    than once for the same delivery in edge cases like a timeout where the
    subscriber actually received it).
    """
    body_obj = {
        "delivery_id": delivery_id,
        "event_type": event_type,
        "payload": event_payload,
    }
    body_bytes = canonical_json(body_obj)
    signature = sign_payload(secret, body_obj)

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Delivery-Id": delivery_id,
    }

    start = time.monotonic()
    try:
        response = httpx.post(
            target_url,
            content=body_bytes,
            headers=headers,
            timeout=settings.DELIVERY_TIMEOUT_SECONDS,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        success = 200 <= response.status_code < 300
        return SendResult(
            success=success,
            response_code=response.status_code,
            response_time_ms=elapsed_ms,
            error=None if success else f"Non-2xx response: {response.status_code}",
        )
    except httpx.TimeoutException:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return SendResult(
            success=False,
            response_code=None,
            response_time_ms=elapsed_ms,
            error="Request timed out",
        )
    except httpx.RequestError as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return SendResult(
            success=False,
            response_code=None,
            response_time_ms=elapsed_ms,
            error=str(exc),
        )