import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import DeliveryTimeline from "../components/DeliveryTimeline";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import type { Delivery, DeliveryDetail, DeliveryStatus, EventItem, Subscriber } from "../types";

const STATUS_OPTIONS: DeliveryStatus[] = ["pending", "success", "failed", "dead"];

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [subscriberFilter, setSubscriberFilter] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [redelivering, setRedelivering] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listDeliveries({
        status: statusFilter || undefined,
        subscriber_id: subscriberFilter || undefined,
      }),
      api.listSubscribers(),
      api.listEvents(),
    ])
      .then(([d, s, e]) => {
        setDeliveries(d);
        setSubscribers(s);
        setEvents(e);
        if (!selectedId && d.length > 0) setSelectedId(d[0].id);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [statusFilter, subscriberFilter]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getDelivery(selectedId)
      .then(setDetail)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const subscriberName = (id: string) => subscribers.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const eventType = (id: string) => events.find((e) => e.id === id)?.event_type ?? "event";

  const handleRedeliver = async () => {
    if (!selectedId) return;
    setRedelivering(true);
    try {
      await api.redeliver(selectedId);
      const refreshed = await api.getDelivery(selectedId);
      setDetail(refreshed);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to redeliver.");
    } finally {
      setRedelivering(false);
    }
  };

  return (
    <div>
      <div className="view-heading">
        <h1>Delivery Inspector</h1>
        <p>Every delivery attempt, with full retry history and payload/response detail.</p>
      </div>

      <div className="explorer-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={subscriberFilter} onChange={(e) => setSubscriberFilter(e.target.value)}>
          <option value="">All subscribers</option>
          {subscribers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : deliveries.length === 0 ? (
        <div className="empty-state">No deliveries match these filters.</div>
      ) : (
        <div className="inspector">
          <div className="inspector-list">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className={`inspector-row ${d.id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(d.id)}
              >
                <div className="inspector-row-top">
                  <span>{eventType(d.event_id)}</span>
                  <StatusBadge status={d.status} />
                </div>
                <div className="inspector-row-meta">
                  <span>{subscriberName(d.subscriber_id)}</span>
                  <span>{new Date(d.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="inspector-detail">
            {detailLoading || !detail ? (
              <div className="empty-state">Select a delivery to inspect it.</div>
            ) : (
              <>
                <div className="inspector-detail-header">
                  <div>
                    <div className="panel-title" style={{ marginBottom: 4 }}>
                      Delivery details
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {detail.id}
                    </span>
                  </div>
                  <button className="btn btn-primary btn-small" onClick={handleRedeliver} disabled={redelivering}>
                    {redelivering ? "Redelivering..." : "Redeliver"}
                  </button>
                </div>

                <div className="kv-row">
                  <span className="k">Event</span>
                  <span className="v">{eventType(detail.event_id)}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Subscriber</span>
                  <span className="v">{subscriberName(detail.subscriber_id)}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Status</span>
                  <span className="v">
                    <StatusBadge status={detail.status} />
                  </span>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className="panel-title">Timeline</div>
                  <DeliveryTimeline delivery={detail} />
                </div>

                <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="panel-title">Request payload</div>
                    <pre className="code-viewer">
                      {JSON.stringify(
                        events.find((e) => e.id === detail.event_id)?.payload ?? {},
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="panel-title">Last response</div>
                    <pre className="code-viewer">
                      {detail.last_response_code
                        ? `HTTP ${detail.last_response_code}${
                            detail.last_response_body ? `\n${detail.last_response_body}` : ""
                          }`
                        : "No response recorded yet"}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Toast message={error} />
    </div>
  );
}