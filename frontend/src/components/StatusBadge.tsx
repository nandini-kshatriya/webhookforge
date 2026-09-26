import type { DeliveryStatus } from "../types";

const CONFIG: Record<DeliveryStatus, { icon: string; label: string }> = {
  pending: { icon: "\u23f3", label: "Queued" },
  success: { icon: "\u2713", label: "Delivered" },
  failed: { icon: "\u21bb", label: "Retrying" },
  dead: { icon: "\u2715", label: "Dead letter" },
};

export default function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = CONFIG[status];
  return (
    <span className={`status-tag status-${status}`}>
      <span aria-hidden="true">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}