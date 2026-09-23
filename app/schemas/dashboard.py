from typing import List, Optional

from pydantic import BaseModel


class SubscriberHealthOut(BaseModel):
    subscriber_id: str
    subscriber_name: str
    total_deliveries: int
    success_count: int
    dead_count: int
    success_rate: Optional[float]


class DashboardStatsOut(BaseModel):
    total_deliveries: int
    pending_count: int
    success_count: int
    failed_count: int
    dead_count: int
    success_rate: Optional[float]  # success_count / total_deliveries
    avg_attempts: Optional[float]
    p50_latency_ms: Optional[float]
    p95_latency_ms: Optional[float]
    subscribers: List[SubscriberHealthOut]