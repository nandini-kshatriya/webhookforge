# WebhookForge

WebhookForge is a reliable webhook delivery platform that receives events from applications and delivers them to registered subscriber endpoints.

It handles asynchronous delivery, retries, idempotency, HMAC signing, and delivery tracking.

## Features

- Subscriber management
- Event publishing
- Asynchronous webhook delivery
- Retry with exponential backoff and jitter
- HMAC webhook signing
- Idempotency support
- Delivery and attempt history
- Manual redelivery
- Delivery statistics
- PostgreSQL for persistence
- Redis + Celery for background processing
- FastAPI REST API
- Docker-based development

## Tech Stack

- **Backend:** FastAPI, Python
- **Database:** PostgreSQL
- **Queue:** Redis + Celery
- **ORM:** SQLAlchemy
- **Migrations:** Alembic
- **Testing:** Pytest
- **Containerization:** Docker & Docker Compose

## Architecture

```text
Application
     |
     v
 FastAPI
     |
     v
PostgreSQL
     |
     v
Redis / Celery
     |
     v
Webhook Worker
     |
     v
Subscriber Endpoint
