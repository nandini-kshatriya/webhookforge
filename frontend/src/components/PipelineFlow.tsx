interface Stage {
  label: string;
  value: number;
  tone: "idle" | "ok" | "retry" | "fail";
}

export default function PipelineFlow({ stages }: { stages: Stage[] }) {
  return (
    <div className="pipeline">
      {stages.map((stage, i) => (
        <div key={stage.label} style={{ display: "contents" }}>
          <div className={`pipeline-stage tone-${stage.tone}`}>
            <div className="pipeline-stage-label">{stage.label}</div>
            <div className="pipeline-stage-value">{stage.value.toLocaleString()}</div>
          </div>
          {i < stages.length - 1 && <div className="pipeline-arrow">&#8594;</div>}
        </div>
      ))}
    </div>
  );
}