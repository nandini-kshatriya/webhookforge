from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from app.db.models import Delivery, DeliveryStatus, Subscriber
from app.db.session import get_db
from app.schemas.dashboard import DashboardStatsOut, SubscriberHealthOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStatsOut)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(Delivery.id)).scalar() or 0

    status_counts = dict(
        db.query(Delivery.status, func.count(Delivery.id)).group_by(Delivery.status).all()
    )
    pending = status_counts.get(DeliveryStatus.pending, 0)
    success = status_counts.get(DeliveryStatus.success, 0)
    failed = status_counts.get(DeliveryStatus.failed, 0)
    dead = status_counts.get(DeliveryStatus.dead, 0)

    success_rate = (success / total) if total else None

    avg_attempts_raw = db.query(func.avg(Delivery.attempt_count)).scalar()
    avg_attempts = float(avg_attempts_raw) if avg_attempts_raw is not None else None

    p50, p95 = _latency_percentiles(db)

    return DashboardStatsOut(
        total_deliveries=total,
        pending_count=pending,
        success_count=success,
        failed_count=failed,
        dead_count=dead,
        success_rate=success_rate,
        avg_attempts=avg_attempts,
        p50_latency_ms=p50,
        p95_latency_ms=p95,
        subscribers=_subscriber_health(db),
    )


def _latency_percentiles(db: Session):
    """P50/P95 across every recorded delivery attempt that got a response
    (success or failure -- this measures subscriber endpoint latency, not
    just successful calls). Uses Postgres's native percentile_cont."""
    row = db.execute(
        text(
            """
            SELECT
                percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95
            FROM delivery_attempts
            WHERE response_time_ms IS NOT NULL
            """
        )
    ).first()
    if row is None:
        return None, None
    p50 = float(row.p50) if row.p50 is not None else None
    p95 = float(row.p95) if row.p95 is not None else None
    return p50, p95


def _subscriber_health(db: Session) -> List[SubscriberHealthOut]:
    rows = (
        db.query(
            Subscriber.id,
            Subscriber.name,
            func.count(Delivery.id).label("total"),
            func.sum(case((Delivery.status == DeliveryStatus.success, 1), else_=0)).label(
                "success"
            ),
            func.sum(case((Delivery.status == DeliveryStatus.dead, 1), else_=0)).label("dead"),
        )
        .outerjoin(Delivery, Delivery.subscriber_id == Subscriber.id)
        .group_by(Subscriber.id, Subscriber.name)
        .order_by(Subscriber.name)
        .all()
    )

    result = []
    for row in rows:
        total = row.total or 0
        success = int(row.success or 0)
        dead = int(row.dead or 0)
        rate = (success / total) if total else None
        result.append(
            SubscriberHealthOut(
                subscriber_id=row.id,
                subscriber_name=row.name,
                total_deliveries=total,
                success_count=success,
                dead_count=dead,
                success_rate=rate,
            )
        )
    return result