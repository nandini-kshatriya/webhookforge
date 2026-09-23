import random
from datetime import datetime, timedelta

from app.core.config import settings


def compute_next_attempt_at(attempt_number: int) -> datetime:
    """attempt_number = the attempt that just failed (1-indexed).

    delay = base * 2^(attempt_number - 1), capped at the delay a final
    attempt would produce, plus up to 25% random jitter so many failing
    deliveries don't all retry in lockstep.
    """
    base = settings.BACKOFF_BASE_SECONDS
    max_delay = base * (2 ** (settings.MAX_DELIVERY_ATTEMPTS - 1))
    delay = min(base * (2 ** (attempt_number - 1)), max_delay)
    jitter = random.uniform(0, delay * 0.25)
    return datetime.utcnow() + timedelta(seconds=delay + jitter)