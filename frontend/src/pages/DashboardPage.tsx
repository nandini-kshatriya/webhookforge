import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import HealthBar from "../components/HealthBar";
import PipelineFlow from "../components/PipelineFlow";
import Toast from "../components/Toast";
import type { DashboardStats, Delivery, DeliveryDetail, EventItem, Subscriber } from "../types";

const STREAM_SIZE = 12;

interface StreamRow {
  delivery: Delivery;
  eventType: string;
  subscriberName: string;
  latencyMs: number | null;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statsRes, eventsRes, subsRes, deliveriesRes] = await Promise.all([
        api.getDashboardStats(),
        api.listEvents(),
        api.listSubscribers(),
        api.listDeliveries(),
      ]);
      setStats(statsRes);
      setEvents(eventsRes);
      setSubscribers(subsRes);
      setDeliveries(deliveriesRes);

      // Live stream needs per-attempt latency, which only the detail
      // endpoint returns -- fetch details for just the most recent N so
      // this stays cheap (existing GET /api/deliveries/{id}, no new API).
      const recent = deliveriesRes.slice(0, STREAM_SIZE);
      const eventMap = new Map(eventsRes.map((e) => [e.id, e.event_type]));
      const subMap = new Map(subsRes.map((s) => [s.id, s.name]));

      const details: DeliveryDetail[] = await Promise.all(
        recent.map((d) => api.getDelivery(d.id))
      );

      setStream(
        details.map((d) => ({
          delivery: d,
          eventType: eventMap.get(d.event_id) ?? "unknown",
          subscriberName: subMap.get(d.subscriber_id) ?? d.subscriber_id.slice(0, 8),
          latencyMs: d.attempts.length ? d.attempts[d.attempts.length - 1].response_time_ms : null,
        }))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load overview data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tick every second so "next retry in Ns" countdowns stay live.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="empty-state">Loading operational overview...</div>;
  if (!stats) return <Toast message={error} />;

  const retrying = deliveries.filter((d) => d.status === "failed");

  return (
    <div>
      <div className="view-heading" style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Webhook Delivery Operations</h1>
          <p>Monitor event processing, subscriber health, delivery attempts and retries.</p>
        </div>
        <button className="btn btn-small" onClick={load} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <PipelineFlow
        stages={[
          { label: "Events", value: events.length, tone: "idle" },
          { label: "Queued", value: stats.pending_count, tone: "idle" },
          { label: "Delivered", value: stats.success_count, tone: "ok" },
          { label: "Retrying", value: stats.failed_count, tone: "retry" },
          { label: "Dead letter", value: stats.dead_count, tone: "fail" },
        ]}
      />

      <div className="op-grid">
        <div>
          <div className="op-panel">
            <div className="panel-title">Live delivery activity</div>
            {stream.length === 0 ? (
              <div className="empty-state">No deliveries yet -- publish an event to see activity.</div>
            ) : (
              stream.map((row) => (
                <div className="stream-row" key={row.delivery.id}>
                  <span className="stream-time">
                    {new Date(row.delivery.updated_at).toLocaleTimeString()}
                  </span>
                  <span className="stream-event">{row.eventType}</span>
                  <span className="stream-subscriber">{row.subscriberName}</span>
                  <span className="stream-code">{row.delivery.last_response_code ?? "--"}</span>
                  <span className="stream-latency">
                    {row.latencyMs !== null ? `${row.latencyMs}ms` : "--"}
                  </span>
                  <span>
                    <StatusTagCompact status={row.delivery.status} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="op-panel">
            <div className="panel-title">Subscriber health</div>
            {stats.subscribers.length === 0 ? (
              <div className="empty-state">No subscribers registered yet.</div>
            ) : (
              stats.subscribers.map((s) => {
                const pct = s.success_rate === null ? 0 : s.success_rate * 100;
                const lastDelivery = deliveries.find((d) => d.subscriber_id === s.subscriber_id);
                return (
                  <div className="health-row" key={s.subscriber_id}>
                    <div className="health-row-top">
                      <span className="health-name">{s.subscriber_name}</span>
                      <span className="health-pct">{pct.toFixed(1)}%</span>
                    </div>
                    <HealthBar pct={pct} />
                    <div className="health-meta">
                      {s.total_deliveries} deliveries
                      {lastDelivery ? ` \u00b7 last ${relativeTime(lastDelivery.created_at)}` : ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="op-panel">
            <div className="panel-title">Retry activity</div>
            <div className="retry-summary">
              <div className="retry-summary-item">
                <span className="n" style={{ color: "var(--retry)" }}>
                  {retrying.length}
                </span>
                active
              </div>
              <div className="retry-summary-item">
                <span className="n" style={{ color: "var(--fail)" }}>
                  {stats.dead_count}
                </span>
                dead-lettered
              </div>
              <div className="retry-summary-item">
                <span className="n">{stats.avg_attempts?.toFixed(1) ?? "--"}</span>
                avg attempts
              </div>
            </div>
            {retrying.length === 0 ? (
              <div className="empty-state">No deliveries currently retrying.</div>
            ) : (
              retrying.slice(0, 6).map((d) => {
                const sub = subscribers.find((s) => s.id === d.subscriber_id);
                const evt = events.find((e) => e.id === d.event_id);
                return (
                  <div className="retry-item" key={d.id}>
                    <div className="retry-item-top">
                      <span className="retry-item-event mono">{evt?.event_type ?? "event"}</span>
                      <span>{sub?.name ?? d.subscriber_id.slice(0, 8)}</span>
                    </div>
                    <div className="retry-item-meta">
                      <span>Attempt {d.attempt_count}</span>
                      <span>Next retry: {secondsUntil(d.next_attempt_at)}s</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Toast message={error} />
    </div>
  );
}

function StatusTagCompact({ status }: { status: Delivery["status"] }) {
  const map: Record<Delivery["status"], { icon: string; cls: string }> = {
    pending: { icon: "\u23f3", cls: "status-pending" },
    success: { icon: "\u2713", cls: "status-success" },
    failed: { icon: "\u21bb", cls: "status-failed" },
    dead: { icon: "\u2715", cls: "status-dead" },
  };
  const m = map[status];
  return <span className={`status-tag ${m.cls}`}>{m.icon}</span>;
}