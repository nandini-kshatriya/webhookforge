import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging, correlation_id_var
from app.api import routes_dashboard, routes_deliveries, routes_events, routes_subscribers

configure_logging()

app = FastAPI(title="WebhookForge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,  # ALLOWED_ORIGINS env var; "*" only for local dev
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Every request gets a correlation id: an incoming X-Request-Id is
    honored (useful if a frontend/proxy already generates one), otherwise a
    fresh one is minted. It's attached to every log line emitted while
    handling this request, and echoed back so the caller can correlate
    their own logs with ours."""
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    token = correlation_id_var.set(request_id)
    try:
        response = await call_next(request)
    finally:
        correlation_id_var.reset(token)
    response.headers["X-Request-Id"] = request_id
    return response


app.include_router(routes_subscribers.router)
app.include_router(routes_events.router)
app.include_router(routes_deliveries.router)
app.include_router(routes_dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}