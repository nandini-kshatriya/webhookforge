export type DeliveryStatus = "pending" | "success" | "failed" | "dead";

export interface Subscriber {
  id: string;
  name: string;
  target_url: string;
  subscribed_events: string[];
  is_active: boolean;
}

export interface EventItem {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
}

export interface DeliveryAttempt {
  id: string;
  attempt_number: number;
  response_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  attempted_at: string;
}

export interface Delivery {
  id: string;
  event_id: string;
  subscriber_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  next_attempt_at: string;
  last_response_code: number | null;
  last_response_body: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryDetail extends Delivery {
  attempts: DeliveryAttempt[];
}

export interface SubscriberHealth {
  subscriber_id: string;
  subscriber_name: string;
  total_deliveries: number;
  success_count: number;
  dead_count: number;
  success_rate: number | null;
}

export interface DashboardStats {
  total_deliveries: number;
  pending_count: number;
  success_count: number;
  failed_count: number;
  dead_count: number;
  success_rate: number | null;
  avg_attempts: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  subscribers: SubscriberHealth[];
}
