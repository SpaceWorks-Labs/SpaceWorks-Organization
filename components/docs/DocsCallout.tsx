import { CircleAlert, Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Each kind has a word and an icon as well as a colour, so it never relies on colour alone. */
const KINDS = {
  note: { label: "Note", Icon: Info, className: "border-info-solid bg-info-bg", ink: "text-info-fg" },
  tip: { label: "Tip", Icon: Lightbulb, className: "border-success-solid bg-success-bg", ink: "text-success-fg" },
  important: { label: "Important", Icon: CircleAlert, className: "border-line-strong bg-highlight-soft", ink: "text-ink" },
  warning: { label: "Warning", Icon: TriangleAlert, className: "border-warning-solid bg-warning-bg", ink: "text-warning-fg" },
  caution: { label: "Caution", Icon: OctagonAlert, className: "border-danger-border bg-danger-bg", ink: "text-danger-fg" },
} as const;

export function DocsCallout({ kind, children }: { kind: string; children: ReactNode }) {
  const { label, Icon, className, ink } = KINDS[kind as keyof typeof KINDS] ?? KINDS.note;
  return (
    <aside aria-label={label} className={cn("my-6 rounded-[12px] border px-5 py-4 text-ink", className)}>
      <p className={cn("flex items-center gap-2 font-semibold", ink)}><Icon size={18} aria-hidden="true" />{label}</p>
      <div className="mt-1.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2">{children}</div>
    </aside>
  );
}
