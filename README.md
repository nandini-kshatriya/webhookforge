WebhookForge

A reliable asynchronous webhook delivery platform: publish an event, it
fans out to every subscriber listening for it, and each delivery is
retried with exponential backoff on failure until it succeeds or is
dead-lettered. Built as a portfolio project focused on the
distributed-systems part of the problem --- retry semantics,
idempotency, delivery guarantees, and observability --- not just CRUD.

Stack: FastAPI · PostgreSQL · Redis · Celery · React + TypeScript

Live demo:
webhookforge-zeta.vercel.app ---
free-tier hosted (see Deployment), so the first load
after idle can take about a minute while the backend wakes up.

Screenshots

Overview --- the event pipeline (Events → Queued → Delivered →
Retrying → Dead letter), a live delivery stream, subscriber health, and
active retries, all on one operations-console page instead of a generic
stat-card dashboard.



Event Explorer --- every event published, searchable and filterable
by type/status/time, with a detail drawer showing the raw payload and
everywhere it fanned out to.



Subscriber Registry --- each subscriber as a service card (status,
target URL, subscribed events, delivery success rate) with inline edit,
enable/disable, and a one-click "Send test event" shortcut.



Delivery Inspector --- split-view: pick any delivery on the left,
see its full retry timeline, request payload, and last response on the
right.



Why this exists

Webhook delivery looks simple until you ask a few honest questions: What
happens when the subscriber's server is down for ten minutes? What if
your own producer retries the same publish call? How do you prove to a
subscriber that a request really came from you? What happens after five
failed attempts --- silently drop the event forever? WebhookForge
answers each of those explicitly, in code, not just in a slide deck.

Core guarantees

At-least-once delivery, not exactly-once. WebhookForge will call
your endpoint at least once per delivery, and may call it more
than once (e.g. if your server received the request but the response
timed out before we saw it). This is stated plainly rather than
glossed over, because pretending otherwise is how subtle bugs get
built downstream.

Idempotency on both sides. Publishing an event with an
idempotency key that's already been used returns the original event
instead of creating a duplicate --- safe for a producer to retry its
own publish call. Every delivery also carries a stable delivery_id
in its payload so a subscriber can dedupe on their side too, for
the at-least-once case above.

Authenticity via HMAC-SHA256. Every delivery is signed with a
per-subscriber secret (shown exactly once, at registration --- the
same pattern Stripe and GitHub use for webhook secrets). Subscribers
verify X-Webhook-Signature before trusting a payload.

Bounded retries with exponential backoff + jitter, then
dead-lettering. A delivery isn't retried forever; after
MAX_DELIVERY_ATTEMPTS (default 5), it's marked dead and surfaced
in the dashboard, with a manual "Redeliver" action.

Full per-attempt audit trail. Every attempt --- success or
failure, with response code, latency, and error --- is recorded and
never overwritten, so a delivery's history is always fully
reconstructable.

Architecture

flowchart LR
    subgraph Producer
        P[POST /api/events]
    end

    subgraph API["FastAPI"]
        P --> DISPATCH[Dispatcher]
        DISPATCH -->|match event_type<br/>to active subscribers| DB[(PostgreSQL)]
    end

    DISPATCH -->|enqueue one task<br/>per subscriber| Q[(Redis)]

    subgraph Worker["Celery Worker"]
        Q --> SEND[Sender: HMAC-sign<br/>+ POST with timeout]
        SEND -->|2xx| OK[Mark success]
        SEND -->|non-2xx / timeout| RETRY{attempts < max?}
        RETRY -->|yes| BACKOFF[Compute backoff + jitter,<br/>requeue with countdown]
        RETRY -->|no| DEAD[Mark dead-lettered]
        BACKOFF --> Q
    end

    OK --> DB
    DEAD --> DB
    SEND -->|subscriber's endpoint| SUB[Subscriber's server]

    subgraph Frontend["React Dashboard"]
        UI[Event Pipeline / Live Stream /<br/>Subscriber Health / Delivery Inspector]
    end
    DB --> UI

Delivery lifecycle (sequence)

sequenceDiagram
    participant P as Producer
    participant API as FastAPI
    participant DB as PostgreSQL
    participant Q as Redis (broker)
    participant W as Celery Worker
    participant S as Subscriber

    P->>API: POST /api/events (idempotency_key)
    API->>DB: dedupe check, insert Event
    API->>DB: match active subscribers, insert Delivery rows (pending)
    API->>Q: enqueue deliver_webhook(delivery_id) per subscriber
    API-->>P: 201 Created

    Q->>W: deliver_webhook(delivery_id)
    W->>DB: load Delivery + Event + Subscriber
    W->>W: HMAC-sign payload with subscriber secret
    W->>S: POST with X-Webhook-Signature, X-Webhook-Delivery-Id
    alt 2xx response
        S-->>W: 200 OK
        W->>DB: record attempt, status = success
    else non-2xx or timeout
        S-->>W: 500 / timeout
        W->>DB: record attempt
        alt attempts < MAX_DELIVERY_ATTEMPTS
            W->>W: compute_next_attempt_at (exponential backoff + jitter)
            W->>DB: status = failed, next_attempt_at
            W->>Q: requeue with countdown
        else attempts exhausted
            W->>DB: status = dead
        end
    end

Project layout

app/
  api/            REST endpoints (subscribers, events, deliveries, dashboard)
  core/           config, structured logging, API-key auth
  db/             SQLAlchemy models + session
  delivery/       signer (HMAC), sender (HTTP), backoff, dispatcher
  workers/        Celery app + the delivery task itself
  schemas/        Pydantic request/response models
migrations/       Alembic
tests/            pytest (backoff math, etc.)
tools/
  test_receiver.py   standalone webhook consumer for demos (see below)
frontend/         React + TypeScript operations console

Running it locally

cp .env.example .env
docker compose up --build

# first time only, in a new terminal:
docker compose exec -e PYTHONPATH=/app api alembic upgrade head

API: http://localhost:8000 --- interactive docs at /docs

Frontend: cd frontend && npm install && npm run dev →
http://localhost:5173

Write endpoints (POST/PATCH/DELETE) require an X-API-Key header
--- set via API_KEY in .env (defaults to dev-local-api-key
locally; the bundled frontend already sends this). GET endpoints are
open so the dashboard and /docs stay browsable without a key.

Trying it end to end with a real receiver

tools/test_receiver.py is a small, dependency-free FastAPI app that
stands in for a real subscriber --- it verifies the HMAC signature
itself (independently of WebhookForge's own code) and logs everything it
receives. It's deliberately not wired into the main app, because
that's the point: it's meant to look like what a subscriber would
actually run, not an internal test harness.

# after creating a subscriber, copy the `secret` from the response (shown once)
RECEIVER_SECRET=<that secret> python tools/test_receiver.py
# register the subscriber's target_url as http://localhost:9000/webhook
# (or http://localhost:9000/webhook/fail to exercise retries/dead-lettering)

Structured logging & correlation IDs

Every API request gets a correlation ID (an incoming X-Request-Id is
honored, otherwise one is minted), echoed back in the response header
and attached to every log line emitted while handling that request.
Every delivery task gets its own correlation ID (delivery:<id>), so
the full retry lifecycle of one delivery --- potentially several
separate task invocations over minutes --- greps out as one correlated
sequence:

{"timestamp": "...", "level": "INFO", "logger": "app.workers.delivery_worker", "message": "Delivery 63e0... succeeded on attempt 1", "correlation_id": "delivery:63e0f7c5-326f-4164-a777-d47a2066be14"}

Testing

pytest                 # backoff math, etc.

Deployment

Deployable end to end on free tiers with no card and no paid-API
dependency: Neon (Postgres), Render (one free web service
running the API and the Celery worker via a supervising start.sh,
plus a free Key Value instance as the broker), Vercel (frontend).
Step-by-step guide, smoke test, and honest free-tier caveats:
DEPLOYMENT.md. Infra is defined
in render.yaml, Dockerfile, start.sh and frontend/vercel.json.

Production behavior worth knowing: the app refuses to boot with
ENV=production and the default API key; CORS is restricted to
ALLOWED_ORIGINS; the worker polls Redis every 30 s instead of every 1
s (a blocked poll returns the instant a task arrives, measured at ~11
ms pickup, but idle Redis traffic drops from ~60 commands/min to ~3).

What's deliberately out of scope

This is a portfolio-scale project, and some simplifications are
intentional rather than oversights:

One static API key, not per-client keys or OAuth --- noted in
app/core/security.py. On the deployed demo it is compiled into the
public frontend bundle, so treat write access as open.

No validation of subscriber target URLs (the server will POST to
whatever is registered) --- fine for a demo, the first thing to
harden for real use.

No recovery sweeper: on the free tier the queue is in-memory, so a
broker restart loses queued retries; those deliveries can be re-run
with Redeliver.

No secret rotation endpoint yet --- if a subscriber's signing secret
is lost, there's no way to retrieve or regenerate it (matches how
Stripe/GitHub show secrets exactly once, but a rotation endpoint
would be a natural next addition).

Retry attempt numbering restarts at 1 after a manual "Redeliver" ---
past attempts stay in history, distinguishable by timestamp, but
aren't renumbered into a single continuous sequence.

License

MIT