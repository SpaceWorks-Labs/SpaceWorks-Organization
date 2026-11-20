import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { actionHref } from "@/lib/publicPage/live";
import type { PageAction } from "@/lib/publicPage/sections";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Where a page's buttons can go: its plans, whether it takes members and the plans section to scroll to. */
export type ActionContext = Parameters<typeof actionHref>[1];

/** Attributes for a link an organisation typed in: outside links open in a new tab and pass no referrer or ranking. */
export const externalProps = (external: boolean) => (external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {});

/** A readable measure for prose (UX-5.7). */
export const PROSE = "max-w-[720px]";
export const LEDE = "max-w-[720px] whitespace-pre-wrap text-body-l text-ink-secondary text-pretty";

/** A muted line for a section with nothing to show yet. Only the editor preview shows these; visitors see no section. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-body-ui text-ink-muted">{children}</p>;
}

/** One button from the editor's action fields, or nothing when it has nowhere to go. */
export function ActionLink({ action, context, variant }: { action: PageAction; context: ActionContext; variant: "accent" | "secondary" | "inverse" }) {
  const target = actionHref(action, context);
  if (!target) return null;
  const classes = buttonClasses({ variant, size: "lg" });
  const content = (
    <>
      {action.label}
      {target.external ? <ArrowUpRight aria-hidden className="size-4" /> : <ArrowRight aria-hidden className="size-4" />}
      {target.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </>
  );
  if (target.external || !target.href.startsWith("/")) {
    return <a href={target.href} className={classes} {...externalProps(target.external)}>{content}</a>;
  }
  return <Link href={target.href} className={classes}>{content}</Link>;
}

/** A primary and a secondary button side by side, wrapping on phones. */
export function ActionRow({ primary, secondary, context, className, onDark = false }: { primary: PageAction; secondary?: PageAction; context: ActionContext; className?: string; onDark?: boolean }) {
  const first = actionHref(primary, context);
  const second = secondary ? actionHref(secondary, context) : null;
  if (!first && !second) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <ActionLink action={primary} context={context} variant="accent" />
      {secondary ? <ActionLink action={secondary} context={context} variant={onDark ? "inverse" : "secondary"} /> : null}
    </div>
  );
}
