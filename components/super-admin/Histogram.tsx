export function Histogram(props: {
  title: string;
  buckets: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...props.buckets.map((b) => b.count));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="mb-2 text-sm text-ink-muted">{props.title}</p>
      <div className="flex h-14 items-end gap-1">
        {props.buckets.map((b) => (
          <span
            key={b.label}
            title={`${b.label}: ${b.count}`}
            className="sw-chart-mark block w-3.5 rounded-sm"
            style={{ height: `${Math.max(4, Math.round((b.count / max) * 56))}px`, background: "var(--chart-1)" }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {props.buckets.map((b) => (
          <span key={b.label} className="text-caption text-ink-muted">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
