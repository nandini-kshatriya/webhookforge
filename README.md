# WebhookForge — Phase 0 & 1 Scaffold

This is the working scaffold for Phases 0-1 of the build plan (see webhookforge-plan.md).

## Run locally

1. Copy the env file:
   cp .env.example .env

2. Start everything:
   docker compose up --build

3. Run the initial migration (first time only, in a new terminal):
   docker compose exec api alembic upgrade head

4. Try it out:
   curl http://localhost:8000/api/health

   curl -X POST http://localhost:8000/api/subscribers \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Sub","target_url":"https://example.com/hook","subscribed_events":["order.created"]}'

   curl -X POST http://localhost:8000/api/events \
     -H "Content-Type: application/json" \
     -d '{"event_type":"order.created","payload":{"order_id":123},"idempotency_key":"evt-1"}'

5. Interactive API docs: http://localhost:8000/docs

## What's implemented
- Subscriber CRUD (create/list/get/update/delete)
- Event publishing with idempotency-key deduplication
- Postgres schema via Alembic (subscribers, events, deliveries, delivery_attempts)
- Celery app configured (no tasks registered yet — that's Phase 2)

## What's next (Phase 2)
- app/delivery/signer.py    -- HMAC-SHA256 payload signing
- app/delivery/sender.py    -- HTTP POST to subscriber with timeout
- app/delivery/dispatcher.py -- event -> matching subscribers -> create Delivery rows
- app/workers/delivery_worker.py -- Celery task that sends + records attempts
- app/delivery/backoff.py   -- exponential backoff + jitter, retry scheduling
