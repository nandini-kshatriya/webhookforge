from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "WebhookForge"
    ENV: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://webhookforge:webhookforge@localhost:5432/webhookforge"

    # Redis / Celery broker
    REDIS_URL: str = "redis://localhost:6379/0"

    # Delivery tuning (used from Phase 2 onward)
    DELIVERY_TIMEOUT_SECONDS: int = 10
    MAX_DELIVERY_ATTEMPTS: int = 5
    BACKOFF_BASE_SECONDS: int = 30

    # Simple shared-secret auth for write endpoints (Phase 7)
    API_KEY: str = "dev-local-api-key"


settings = Settings()
