import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import Toast from "../components/Toast";
import type { DashboardStats, Subscriber } from "../types";

export default function SubscribersPage() {
  const navigate = useNavigate();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [eventsCsv, setEventsCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editEventsCsv, setEditEventsCsv] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.listSubscribers(), api.getDashboardStats()])
      .then(([subs, s]) => {
        setSubscribers(subs);
        setStats(s);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const healthFor = (id: string) => stats?.subscribers.find((s) => s.subscriber_id === id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !targetUrl.trim()) {
      setFormError("Name and target URL are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createSubscriber({
        name: name.trim(),
        target_url: targetUrl.trim(),
        subscribed_events: eventsCsv.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setName("");
      setTargetUrl("");
      setEventsCsv("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create subscriber.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (sub: Subscriber) => {
    setEditingId(sub.id);
    setEditName(sub.name);
    setEditUrl(sub.target_url);
    setEditEventsCsv(sub.subscribed_events.join(", "));
  };

  const saveEdit = async (id: string) => {
    try {
      await api.updateSubscriber(id, {
        name: editName.trim(),
        target_url: editUrl.trim(),
        subscribed_events: editEventsCsv.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setEditingId(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update subscriber.");
    }
  };

  const toggleActive = async (sub: Subscriber) => {
    try {
      await api.updateSubscriber(sub.id, { is_active: !sub.is_active });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update subscriber.");
    }
  };

  const remove = async (sub: Subscriber) => {
    if (!confirm(`Delete subscriber "${sub.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteSubscriber(sub.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete subscriber.");
    }
  };
  const sendTestEvent = (sub: Subscriber) => {
  if (sub.subscribed_events.length === 0) return;

  navigate("/events", {
    state: {
      prefillEventType: sub.subscribed_events[0],
      prefillSubscriberName: sub.name,
    },
  });
};

  return (
    <div>
      <div className="view-heading" style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>Subscriber Registry</h1>
          <p>Endpoints registered to receive webhook deliveries.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Register subscriber"}
        </button>
      </div>

      {showForm && (
        <form className="inline-panel" onSubmit={handleCreate} style={{ maxWidth: 480 }}>
          <div className="field">
            <label htmlFor="sub-name">Name</label>
            <input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="payments-api" />
          </div>
          <div className="field">
            <label htmlFor="sub-url">Target URL</label>
            <input id="sub-url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://example.com/webhooks" />
          </div>
          <div className="field">
            <label htmlFor="sub-events">Subscribed events (comma-separated)</label>
            <input id="sub-events" value={eventsCsv} onChange={(e) => setEventsCsv(e.target.value)} placeholder="order.created, order.refunded" />
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Registering..." : "Register"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : subscribers.length === 0 ? (
        <div className="empty-state">No subscribers registered yet.</div>
      ) : (
        <div className="registry-grid">
          {subscribers.map((sub) => {
            const health = healthFor(sub.id);
            const pct = health?.success_rate !== null && health?.success_rate !== undefined
              ? (health.success_rate * 100).toFixed(1)
              : "--";
            const isEditing = editingId === sub.id;
            return (
              <div className="registry-card" key={sub.id}>
                <div className="registry-card-top">
                  <span className="registry-card-name">{sub.name}</span>
                  <span className={`registry-status ${sub.is_active ? "on" : "off"}`}>
                    <span className="dot" />
                    {sub.is_active ? "ACTIVE" : "PAUSED"}
                  </span>
                </div>
                <div className="registry-card-url">{sub.target_url}</div>

                {isEditing ? (
                  <div style={{ marginBottom: 12 }}>
                    <div className="field">
                      <label>Name</label>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Target URL</label>
                      <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Subscribed events</label>
                      <input value={editEventsCsv} onChange={(e) => setEditEventsCsv(e.target.value)} />
                    </div>
                    <div className="registry-card-actions">
                      <button className="btn btn-primary btn-small" onClick={() => saveEdit(sub.id)}>
                        Save
                      </button>
                      <button className="btn btn-small" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="registry-card-events">
                      Events: {sub.subscribed_events.join(", ") || "none"}
                    </div>
                    <div className="registry-card-stats">
                      <div className="registry-stat">
                        <span className="n">{health?.total_deliveries ?? 0}</span>
                        <span className="l">Deliveries</span>
                      </div>
                      <div className="registry-stat">
                        <span className="n">{pct}%</span>
                        <span className="l">Success</span>
                      </div>
                    </div>
                    <div className="registry-card-actions">
  <button className="btn btn-small" onClick={() => startEdit(sub)}>
    Edit
  </button>

  <button className="btn btn-small" onClick={() => toggleActive(sub)}>
    {sub.is_active ? "Disable" : "Enable"}
  </button>

  <button
    className="btn btn-small"
    onClick={() => sendTestEvent(sub)}
    disabled={sub.subscribed_events.length === 0}
    title={
      sub.subscribed_events.length === 0
        ? "This subscriber has no subscribed event types"
        : `Publish a ${sub.subscribed_events[0]} event`
    }
  >
    Send test event
  </button>

  <button className="btn btn-small btn-danger" onClick={() => remove(sub)}>
    Delete
  </button>
</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Toast message={error} />
    </div>
  );
}