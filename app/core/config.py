from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEV_API_KEY = "dev-local-api-key"


def normalize_database_url(url: str) -> str:
    """Managed Postgres providers (Neon, Render, Heroku...) hand out
    `postgres://` or `postgresql://` URLs. SQLAlchemy needs to be told which
    driver to use, so rewrite the scheme to `postgresql+psycopg2://`.
    Query params (e.g. Neon's `?sslmode=require`) are preserved, and
    already-qualified URLs are left alone."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


def normalize_redis_url(url: str) -> str:
    """Make a `rediss://` (TLS) broker URL verify the server certificate.

    Left bare, kombu passes no `ssl_cert_reqs` and redis-py then falls back to
    `ssl.CERT_NONE`: the connection is encrypted but the server's identity is
    never checked, so a man-in-the-middle would be accepted (verified against
    a self-signed test server -- a bare URL connects, `required` rejects it).
    Managed Redis services that expose TLS (e.g. Upstash) use publicly-trusted
    certificates, so `required` is the right default. An explicit
    `ssl_cert_reqs` in the URL is respected. Plain `redis://` URLs --
    docker-compose locally, and Render's private-network Key Value -- are
    left untouched."""
    parts = urlsplit(url)
    if parts.scheme != "rediss":
        return url
    query = dict(parse_qsl(parts.query))
    query.setdefault("ssl_cert_reqs", "required")
    return urlunsplit(parts._replace(query=urlencode(query)))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "WebhookForge"
    ENV: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://webhookforge:webhookforge@localhost:5432/webhookforge"

    # Redis / Celery broker
    REDIS_URL: str = "redis://localhost:6379/0"

    # Delivery tuning
    DELIVERY_TIMEOUT_SECONDS: int = 10
    MAX_DELIVERY_ATTEMPTS: int = 5
    BACKOFF_BASE_SECONDS: int = 30

    # How long an idle Celery worker blocks on Redis before re-polling.
    # A blocked poll returns the instant a task arrives, so this does NOT add
    # delivery latency (measured: ~11ms pickup with a 30s setting) -- it only
    # cuts idle Redis traffic from ~60 commands/min to ~3/min. That matters
    # on metered Redis and on the free tier's 0.1 CPU.
    BROKER_POLL_INTERVAL_SECONDS: int = 30

    # Shared-secret auth for write endpoints
    API_KEY: str = DEFAULT_DEV_API_KEY

    # Comma-separated browser origins allowed to call the API cross-origin.
    # "*" is convenient locally; in production set the exact frontend origin.
    ALLOWED_ORIGINS: str = "*"

    @field_validator("DATABASE_URL")
    @classmethod
    def _fix_database_url(cls, v: str) -> str:
        return normalize_database_url(v)

    @field_validator("REDIS_URL")
    @classmethod
    def _fix_redis_url(cls, v: str) -> str:
        return normalize_redis_url(v)

    @model_validator(mode="after")
    def _refuse_dev_api_key_in_production(self):
        # The default key is public (it's in this repo). Fail loudly at boot
        # rather than quietly deploy an API anyone can write to.
        if self.ENV.lower() == "production" and self.API_KEY == DEFAULT_DEV_API_KEY:
            raise ValueError(
                "API_KEY is still the public development default; "
                "set a real secret before running with ENV=production."
            )
        return self

    @property
    def allowed_origins_list(self) -> list[str]:
        # Browsers send `Origin` without a trailing slash and CORS matching
        # is exact, so "https://x.vercel.app/" would silently never match.
        return [o.strip().rstrip("/") for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()