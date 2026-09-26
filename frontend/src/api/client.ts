import type {
  DashboardStats,
  Delivery,
  DeliveryDetail,
  EventItem,
  Subscriber,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.detail ? JSON.stringify(body.detail) : "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Subscribers
  listSubscribers: () => request<Subscriber[]>("/api/subscribers"),
  createSubscriber: (data: {
    name: string;
    target_url: string;
    subscribed_events: string[];
  }) =>
    request<Subscriber>("/api/subscribers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSubscriber: (
    id: string,
    data: Partial<{
      name: string;
      target_url: string;
      subscribed_events: string[];
      is_active: boolean;
    }>
  ) =>
    request<Subscriber>(`/api/subscribers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteSubscriber: (id: string) =>
    request<void>(`/api/subscribers/${id}`, { method: "DELETE" }),

  // Events
  listEvents: () => request<EventItem[]>("/api/events"),
  publishEvent: (data: {
    event_type: string;
    payload: Record<string, unknown>;
    idempotency_key: string;
  }) =>
    request<EventItem>("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Deliveries
  listDeliveries: (
    filters: { status?: string; subscriber_id?: string; event_id?: string } = {}
  ) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return request<Delivery[]>(`/api/deliveries${qs ? `?${qs}` : ""}`);
  },
  getDelivery: (id: string) => request<DeliveryDetail>(`/api/deliveries/${id}`),
  redeliver: (id: string) =>
    request<Delivery>(`/api/deliveries/${id}/redeliver`, { method: "POST" }),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>("/api/dashboard/stats"),
};

export { ApiError };
