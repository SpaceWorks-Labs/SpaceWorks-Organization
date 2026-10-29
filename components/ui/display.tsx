import { type HTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { MoodTile, type Mood } from "@/components/brand/MoodTile";
import { Patch } from "@/components/brand/Patch";

/* ---------- Status pills (docs/DESIGN.md §4.5) ---------- */

/**
 * Fully round, 24px tall, and always carrying a word: colour never stands
 * alone. The status tokens give solid brand fills with ink labels in light
 * mode and soft fills with brand-coloured words in dark mode.
 */
export type ChipTone = "neutral" | "success" | "warning" | "info" | "danger" | "accent" | "highlight" | "ink" | "outline";

const chipTones: Record<ChipTone, string> = {
  neutral: "border border-line bg-surface text-ink",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  info: "bg-info-bg text-info-fg",
  danger: "border border-danger-border bg-panel text-danger-fg",
  accent: "bg-accent-soft text-accent-text",
  highlight: "bg-highlight text-on-highlight",
  ink: "bg-inverse text-on-inverse",
  outline: "border border-line-strong bg-panel text-ink-secondary",
};

export function Chip({ tone = "neutral", icon, className, children, size = "md" }: { tone?: ChipTone; icon?: ReactNode; className?: string; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-full font-semibold leading-4 [&_svg]:size-3.5 [&_svg]:shrink-0",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]",
        chipTones[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden className="inline-flex">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ---------- Cards: white panel, 1px hairline, 16px radius, no shadow ---------- */

export function Card({ className, children, padding = "md", as = "div", ...props }: HTMLAttributes<HTMLElement> & { padding?: "none" | "sm" | "md" | "lg"; as?: "div" | "section" | "article" }) {
  const Component = as;
  return (
    <Component
      className={cn(
        "rounded-xl border border-line bg-panel",
        padding === "sm" && "p-4",
        padding === "md" && "p-5",
        padding === "lg" && "p-6 sm:p-8",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, action, className, titleAs: Title = "h2" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; titleAs?: "h2" | "h3" | "h4" }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <Title className="text-title text-ink">{title}</Title>
        {description ? <p className="mt-1 text-body-ui text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ---------- Callout / banner ---------- */

export type CalloutTone = "warning" | "info" | "success" | "danger";

const calloutTones: Record<CalloutTone, { classes: string; icon: ReactNode }> = {
  warning: { classes: "bg-warning-bg text-warning-fg", icon: <AlertTriangle /> },
  info: { classes: "bg-info-bg text-info-fg", icon: <Info /> },
  success: { classes: "bg-success-bg text-success-fg", icon: <CheckCircle2 /> },
  danger: { classes: "bg-danger-bg text-danger-fg", icon: <XCircle /> },
};

export function Callout({ tone = "info", title, children, action, className, role }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; role?: "alert" | "status" }) {
  const { classes, icon } = calloutTones[tone];
  return (
    <div role={role} className={cn("flex flex-col gap-3 rounded-lg px-4 py-3.5 sm:flex-row sm:items-center", classes, className)}>
      <span aria-hidden className="hidden shrink-0 sm:inline-flex [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1 text-body-ui">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ---------- Empty state ---------- */

/**
 * Empty, success or error message in a card. On Space Works Organization' own screens pass a dot
 * face `mood` (Sleepy for empty lists, Sad for errors); organisation-branded public pages
 * leave it out. For a list that has never had anything in it (no members yet, no payments yet), pass
 * `patch` instead to show Patch idling; never on a screen that already has a bold moment.
 */
export function EmptyState({ title, children, action, className, icon, mood, patch }: { title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode; mood?: Mood; patch?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-line bg-panel px-6 py-7 text-center", className)}>
      {patch ? <Patch size={88} className="-my-3" /> : mood ? <MoodTile mood={mood} size={48} className="sw-face mb-1" /> : null}
      {icon ? <span aria-hidden className="text-ink-muted [&_svg]:size-7">{icon}</span> : null}
      {title ? <p className="text-label text-ink">{title}</p> : null}
      {children ? <div className="max-w-md text-body-ui text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ---------- Avatar and org logo live in ./identity ---------- */

export { Avatar, OrgLogo } from "./identity";

/* ---------- Progress & stat tile ---------- */

export function ProgressBar({ value, max, tone = "accent", className, label }: { value: number; max: number; tone?: "accent" | "ink" | "success" | "warning"; className?: string; label?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = { accent: "bg-accent", ink: "bg-primary", success: "bg-success-solid", warning: "bg-warning-solid" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-[360ms] ease-sw", fill)} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function StatTile({ label, value, hint, progress, tone = "default", className, href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; progress?: { value: number; max: number; tone?: "accent" | "ink" | "success" | "warning" }; tone?: "default" | "attention"; className?: string; href?: string }) {
  const body = (
    <>
      <span className="block text-sm text-ink-muted">{label}</span>
      <span className="mt-1 block font-display text-[32px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink">{value}</span>
      {hint ? <span className="mt-0.5 block text-caption text-ink-muted">{hint}</span> : null}
      {progress ? <ProgressBar className="mt-2.5" value={progress.value} max={progress.max} tone={progress.tone ?? "accent"} /> : null}
    </>
  );
  const classes = cn("block rounded-xl border p-4", tone === "attention" ? "border-transparent bg-warning-bg [&_span]:text-warning-fg" : "border-line bg-panel", href && "transition-colors hover:bg-subtle", className);
  return href ? <Link href={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}

/* ---------- Page headings ---------- */

export function PageHeader({ kicker, title, description, actions, className }: { kicker?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {kicker ? <p className="mb-1.5 text-body-ui text-ink-muted">{kicker}</p> : null}
        <h1 className="break-words text-h1 text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-[640px] text-body-ui text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({ title, description, action, className, as: Heading = "h2" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Heading className="text-h4 text-ink">{title}</Heading>
        {description ? <p className="mt-1 text-body-ui text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Settings row: label column (title + helper) on the left, fields on the right. */
export function SettingsRow({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 border-b border-line py-6 last:border-b-0 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-10", className)}>
      <div>
        <h3 className="font-sans text-label text-ink">{title}</h3>
        {description ? <p className="mt-1 text-caption text-ink-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------- Key/value list ---------- */

export function DetailList({ items, className }: { items: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]", className)}>
      {items.map((item, index) => (
        <div key={index} className="contents">
          <dt className="text-overline text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 text-body-ui text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
