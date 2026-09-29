import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_DEV_API_KEY, Settings


def make(**kw):
    # _env_file=None: don't let a developer's local .env leak into the test
    return Settings(_env_file=None, **kw)


@pytest.mark.parametrize(
    "given",
    [
        "postgres://u:p@host/db",          # Render / Heroku style
        "postgresql://u:p@host/db",        # Neon style
        "postgresql+psycopg2://u:p@host/db",
    ],
)
def test_database_url_is_normalized_to_psycopg2(given):
    assert make(DATABASE_URL=given).DATABASE_URL == "postgresql+psycopg2://u:p@host/db"


def test_neon_query_params_survive_normalization():
    url = "postgresql://u:p@ep-x.neon.tech/db?sslmode=require"
    assert make(DATABASE_URL=url).DATABASE_URL.endswith("/db?sslmode=require")


def test_default_api_key_is_refused_in_production():
    with pytest.raises(ValidationError):
        make(ENV="production", API_KEY=DEFAULT_DEV_API_KEY)


def test_real_api_key_is_accepted_in_production():
    assert make(ENV="production", API_KEY="a-real-secret").ENV == "production"


def test_default_api_key_is_fine_in_development():
    assert make(ENV="development").API_KEY == DEFAULT_DEV_API_KEY


def test_allowed_origins_parsing_strips_spaces_and_trailing_slashes():
    s = make(ALLOWED_ORIGINS="https://a.vercel.app/ , https://b.example.com")
    assert s.allowed_origins_list == ["https://a.vercel.app", "https://b.example.com"]


# --- Redis URL handling ----------------------------------------------------

def test_plain_redis_url_is_untouched():
    # docker-compose locally, and Render's private-network Key Value
    assert make(REDIS_URL="redis://red-abc123:6379").REDIS_URL == "redis://red-abc123:6379"


def test_rediss_url_is_made_to_verify_the_server_certificate():
    # A bare rediss:// URL would silently fall back to ssl.CERT_NONE
    url = make(REDIS_URL="rediss://default:pw@eu1-x.upstash.io:6379").REDIS_URL
    assert url.startswith("rediss://default:pw@eu1-x.upstash.io:6379")
    assert "ssl_cert_reqs=required" in url


def test_explicit_cert_policy_is_not_overridden():
    url = make(REDIS_URL="rediss://h:6379?ssl_cert_reqs=none").REDIS_URL
    assert "ssl_cert_reqs=none" in url and "required" not in url


def test_broker_poll_interval_default_is_long_enough_to_protect_free_tiers():
    assert make().BROKER_POLL_INTERVAL_SECONDS >= 30