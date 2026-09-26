import type { DeliveryDetail } from "../types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export default function DeliveryTimeline({ delivery }: { delivery: DeliveryDetail }) {
  const steps: { title: string; meta: string; tone: "ok" | "fail" | "retry" }[] = [];

  steps.push({
    title: "Created",
    meta: formatTime(delivery.created_at),
    tone: "retry",
  });

  for (const a of delivery.attempts) {
    const ok = a.response_code !== null && a.response_code < 300;
    steps.push({
      title: `Attempt ${a.attempt_number} -- ${ok ? "succeeded" : "failed"}`,
      meta: `${a.response_code ?? "no response"} \u00b7 ${
        a.response_time_ms ?? "?"
      }ms \u00b7 ${formatTime(a.attempted_at)}${a.error ? ` \u00b7 ${a.error}` : ""}`,
      tone: ok ? "ok" : "fail",
    });
  }

  if (delivery.status === "success") {
    steps.push({ title: "Completed", meta: "Delivery confirmed", tone: "ok" });
  } else if (delivery.status === "dead") {
    steps.push({
      title: "Dead-lettered",
      meta: "Retry budget exhausted \u2014 use Redeliver to try again",
      tone: "fail",
    });
  } else if (delivery.status === "failed") {
    steps.push({
      title: "Retry scheduled",
      meta: `Next attempt at ${formatTime(delivery.next_attempt_at)}`,
      tone: "retry",
    });
  } else if (delivery.attempts.length === 0) {
    steps.push({ title: "Queued", meta: "Waiting to be picked up by a worker", tone: "retry" });
  }

  return (
    <div className="timeline">
      {steps.map((s, i) => (
        <div key={i} className={`timeline-step tone-${s.tone}`}>
          <div className="timeline-step-title">{s.title}</div>
          <div className="timeline-step-meta">{s.meta}</div>
        </div>
      ))}
    </div>
  );
}