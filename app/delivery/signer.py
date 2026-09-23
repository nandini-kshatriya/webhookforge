import hashlib
import hmac
import json


def canonical_json(payload: dict) -> bytes:
    """Deterministic JSON encoding so the signature is stable regardless
    of dict key insertion order."""
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()


def sign_payload(secret: str, payload: dict) -> str:
    """HMAC-SHA256 signature (hex) over the canonical JSON body, using the
    subscriber's per-subscription secret. Sent as X-Webhook-Signature so
    subscribers can verify a delivery genuinely came from WebhookForge."""
    body = canonical_json(payload)
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()