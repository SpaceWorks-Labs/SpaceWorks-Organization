import { cn } from "@/lib/cn";

type SparkPoint = { xLabel: string; y: number };

function buildPath(values: number[], w: number, h: number, pad: number) {
  if (values.length === 0) return "";
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(1, maxV - minV);

  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  return values
    .map((v, i) => {
      const t = values.length === 1 ? 0 : i / (values.length - 1);
      const x = pad + t * innerW;
      const y = pad + (1 - (v - minV) / span) * innerH;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function SparklineCard(props: {
  title: string;
  subtitle?: string;
  points: SparkPoint[];
  /** Show this window total instead of the latest day and its day-on-day change. */
  total?: number;
}) {
  const w = 240;
  const h = 56;
  const pad = 6;
  const values = props.points.map((p) => p.y);
  const path = buildPath(values, w, h, pad);
  const latest = values.at(-1) ?? 0;
  const prev = values.length >= 2 ? values.at(-2) ?? 0 : null;
  const delta = props.total != null || prev == null ? null : latest - prev;
  const headline = props.total ?? latest;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm text-ink-muted">{props.title}</span>
        <span className="font-display text-[22px] font-semibold tabular-nums leading-tight text-ink">{headline.toLocaleString()}</span>
        {delta != null ? (
          <span className={cn("text-caption font-semibold", delta === 0 ? "text-ink-muted" : delta > 0 ? "text-success-solid" : "text-warning-solid")}>
            {delta > 0 ? "+" : ""}
            {delta.toLocaleString()}
          </span>
        ) : null}
      </div>
      {props.subtitle ? <p className="text-caption text-ink-muted">{props.subtitle}</p> : null}
      <svg className="mt-2 block w-full text-ink" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={props.title}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      </svg>
    </div>
  );
}
