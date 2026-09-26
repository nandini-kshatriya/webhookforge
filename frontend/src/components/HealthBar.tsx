function toneColor(pct: number): string {
  if (pct >= 90) return "var(--ok)";
  if (pct >= 50) return "var(--retry)";
  return "var(--fail)";
}

export default function HealthBar({ pct }: { pct: number }) {
  return (
    <div className="health-bar-track">
      <div
        className="health-bar-fill"
        style={{ width: `${Math.max(pct, 2)}%`, background: toneColor(pct) }}
      />
    </div>
  );
}