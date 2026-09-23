from datetime import datetime, timedelta

from app.core.config import settings
from app.delivery.backoff import compute_next_attempt_at


def test_delay_grows_exponentially():
    """Each successive attempt number should produce a strictly larger
    (or equal, once capped) minimum delay than the one before it."""
    base = settings.BACKOFF_BASE_SECONDS
    now = datetime.utcnow()

    prev_min_delay = 0
    for attempt_number in range(1, settings.MAX_DELIVERY_ATTEMPTS + 1):
        next_at = compute_next_attempt_at(attempt_number)
        delay = (next_at - now).total_seconds()
        expected_min = base * (2 ** (attempt_number - 1))
        assert delay >= expected_min - 2
        assert delay >= prev_min_delay
        prev_min_delay = expected_min


def test_delay_is_capped_at_max_attempts_value():
    """Delay must never exceed what the final allowed attempt would produce,
    even if called with an attempt_number beyond MAX_DELIVERY_ATTEMPTS."""
    base = settings.BACKOFF_BASE_SECONDS
    max_delay = base * (2 ** (settings.MAX_DELIVERY_ATTEMPTS - 1))
    now = datetime.utcnow()

    next_at = compute_next_attempt_at(settings.MAX_DELIVERY_ATTEMPTS + 5)
    delay = (next_at - now).total_seconds()

    assert delay <= max_delay * 1.25 + 2


def test_jitter_adds_randomness_not_negative_time():
    """next_attempt_at must always be in the future, and repeated calls for
    the same attempt_number should not all return the exact same instant."""
    now = datetime.utcnow()
    results = [compute_next_attempt_at(2) for _ in range(10)]

    assert all(r > now for r in results)
    assert len(set(results)) > 1