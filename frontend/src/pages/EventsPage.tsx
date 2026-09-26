import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Toast from "../components/Toast";
import type { Delivery, DeliveryStatus, EventItem, Subscriber } from "../types";

function newIdempotencyKey() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `evt-${Date.now()}-${Math.random()}`;
}

interface PrefillState {
  prefillEventType?: string;
  prefillSubscriberName?: string;
}

type TimeRange = "all" | "1h" | "24h" | "7d";

const RANGE_MS: Record<TimeRange, number | null> = {
  all: null,
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

export default function EventsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | DeliveryStatus>("");
  const [rangeFilter, setRangeFilter] = useState<TimeRange>("all");

  const [selected, setSelected] = useState<EventItem | null>(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState<Delivery[]>([]);

  const [showPublish, setShowPublish] = useState(false);
  const [eventType, setEventType] = useState("order.created");
  const [payloadText, setPayloadText] = useState('{\n  "order_id": 123\n}');
  const [idempotencyKey, setIdempotencyKey] =
    useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  // Handle navigation from the "Send test event" button
  useEffect(() => {
    const state = location.state as PrefillState | null;

    if (state?.prefillEventType) {
      setEventType(state.prefillEventType);
      setIdempotencyKey(newIdempotencyKey());
      setShowPublish(true);

      setPrefillNotice(
        state.prefillSubscriberName
          ? `Pre-filled for ${state.prefillSubscriberName} (subscribed to "${state.prefillEventType}")`
          : `Pre-filled with event type "${state.prefillEventType}"`
      );

      navigate(location.pathname, {
        replace: true,
        state: null,
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const load = () => {
    setLoading(true);

    Promise.all([
      api.listEvents(),
      api.listDeliveries(),
      api.listSubscribers(),
    ])
      .then(([e, d, s]) => {
        setEvents(e);
        setDeliveries(d);
        setSubscribers(s);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.event_type))).sort(),
    [events]
  );

  const deliveriesByEvent = useMemo(() => {
    const map = new Map<string, Delivery[]>();

    for (const d of deliveries) {
      const arr = map.get(d.event_id) ?? [];
      arr.push(d);
      map.set(d.event_id, arr);
    }

    return map;
  }, [deliveries]);

  const filtered = useMemo(() => {
    const rangeMs = RANGE_MS[rangeFilter];

    return events.filter((evt) => {
      if (typeFilter && evt.event_type !== typeFilter) {
        return false;
      }

      const ds = deliveriesByEvent.get(evt.id) ?? [];

      if (rangeMs !== null) {
        // EventItem has no timestamp of its own.
        // Use earliest delivery created_at as a proxy.
        if (ds.length === 0) {
          return false;
        }

        const earliest = Math.min(
          ...ds.map((d) => new Date(d.created_at).getTime())
        );

        if (Date.now() - earliest > rangeMs) {
          return false;
        }
      }

      if (
        statusFilter &&
        !ds.some((d) => d.status === statusFilter)
      ) {
        return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();

        const hay =
          `${evt.event_type} ${evt.id} ${evt.idempotency_key}`.toLowerCase();

        if (!hay.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [
    events,
    typeFilter,
    statusFilter,
    search,
    deliveriesByEvent,
    rangeFilter,
  ]);

  const openEvent = (evt: EventItem) => {
    setSelected(evt);

    api
      .listDeliveries({ event_id: evt.id })
      .then(setSelectedDeliveries)
      .catch((e: ApiError) => setError(e.message));
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(payloadText);
    } catch {
      setFormError("Payload must be valid JSON.");
      return;
    }

    if (!eventType.trim()) {
      setFormError("Event type is required.");
      return;
    }

    setSubmitting(true);

    try {
      await api.publishEvent({
        event_type: eventType.trim(),
        payload,
        idempotency_key: idempotencyKey,
      });

      setIdempotencyKey(newIdempotencyKey());
      setShowPublish(false);
      setPrefillNotice(null);

      load();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Failed to publish event."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const subscribersFor = (type: string) =>
    subscribers.filter((s) =>
      s.subscribed_events.includes(type)
    );

  return (
    <div>
      <div
        className="view-heading"
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1>Event Explorer</h1>
          <p>
            Every event published to the platform, and where it fanned out
            to.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setShowPublish((v) => !v);
            setPrefillNotice(null);
          }}
        >
          {showPublish ? "Cancel" : "Publish event"}
        </button>
      </div>

      {showPublish && (
        <form
          className="inline-panel"
          onSubmit={handlePublish}
          style={{ maxWidth: 480 }}
        >
          {prefillNotice && (
            <div
              className="mono"
              style={{
                fontSize: 11.5,
                color: "var(--accent)",
                marginBottom: 12,
                padding: "6px 10px",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
              }}
            >
              {prefillNotice}
            </div>
          )}

          <div className="field">
            <label htmlFor="evt-type">Event type</label>

            <input
              id="evt-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="evt-payload">Payload (JSON)</label>

            <textarea
              id="evt-payload"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="evt-key">Idempotency key</label>

            <input
              id="evt-key"
              className="mono"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
            />
          </div>

          {formError && (
            <div className="form-error">
              {formError}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Publishing..." : "Publish"}
          </button>
        </form>
      )}

      <div className="explorer-toolbar">
        <input
          type="text"
          placeholder="Search events, ids, idempotency keys..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All event types</option>

          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as "" | DeliveryStatus
            )
          }
        >
          <option value="">Any delivery status</option>
          <option value="pending">Queued</option>
          <option value="success">Delivered</option>
          <option value="failed">Retrying</option>
          <option value="dead">Dead letter</option>
        </select>

        <select
          value={rangeFilter}
          onChange={(e) =>
            setRangeFilter(e.target.value as TimeRange)
          }
        >
          <option value="all">All time</option>
          <option value="1h">Last hour</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
        </select>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          No events match these filters.
        </div>
      ) : (
        <div className="event-list">
          {filtered.map((evt) => {
            const ds = deliveriesByEvent.get(evt.id) ?? [];

            const earliest = ds.length
              ? new Date(
                  Math.min(
                    ...ds.map((d) =>
                      new Date(d.created_at).getTime()
                    )
                  )
                )
              : null;

            return (
              <div
                className="event-row"
                key={evt.id}
                onClick={() => openEvent(evt)}
              >
                <div>
                  <div className="event-row-type">
                    {evt.event_type}
                  </div>

                  <div className="event-row-id">
                    {evt.id}
                  </div>
                </div>

                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                  }}
                >
                  {ds.length}{" "}
                  {ds.length === 1 ? "delivery" : "deliveries"}
                </div>

                <div className="event-row-time">
                  {earliest
                    ? earliest.toLocaleTimeString()
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          className="drawer-overlay"
          onClick={() => setSelected(null)}
        >
          <div
            className="drawer-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <h2
                className="panel-title"
                style={{ marginBottom: 0 }}
              >
                Event detail
              </h2>

              <button
                className="drawer-close"
                onClick={() => setSelected(null)}
              >
                &times;
              </button>
            </div>

            <div className="kv-row">
              <span className="k">Event ID</span>
              <span className="v">{selected.id}</span>
            </div>

            <div className="kv-row">
              <span className="k">Event type</span>
              <span className="v">
                {selected.event_type}
              </span>
            </div>

            <div className="kv-row">
              <span className="k">Idempotency key</span>
              <span className="v">
                {selected.idempotency_key}
              </span>
            </div>

            <div className="kv-row">
              <span className="k">Subscribers</span>

              <span className="v">
                {subscribersFor(selected.event_type)
                  .map((s) => s.name)
                  .join(", ") || "none"}
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="panel-title">
                Payload
              </div>

              <pre className="code-viewer">
                {JSON.stringify(
                  selected.payload,
                  null,
                  2
                )}
              </pre>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="panel-title">
                Delivery attempts
              </div>

              {selectedDeliveries.length === 0 ? (
                <div className="empty-state">
                  No deliveries recorded.
                </div>
              ) : (
                selectedDeliveries.map((d) => {
                  const sub = subscribers.find(
                    (s) => s.id === d.subscriber_id
                  );

                  return (
                    <div
                      className="retry-item"
                      key={d.id}
                    >
                      <div className="retry-item-top">
                        <span>
                          {sub?.name ??
                            d.subscriber_id.slice(0, 8)}
                        </span>

                        <StatusBadge status={d.status} />
                      </div>

                      <div className="retry-item-meta">
                        <span>
                          {d.attempt_count} attempt(s)
                        </span>

                        <span>
                          {d.last_response_code ??
                            "no response"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <Toast message={error} />
    </div>
  );
}