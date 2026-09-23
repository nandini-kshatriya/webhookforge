from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import configure_logging
from app.api import routes_dashboard, routes_deliveries, routes_events, routes_subscribers

configure_logging()

app = FastAPI(title="WebhookForge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your deployed frontend origin before sharing publicly
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_subscribers.router)
app.include_router(routes_events.router)
app.include_router(routes_deliveries.router)
app.include_router(routes_dashboard.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}
