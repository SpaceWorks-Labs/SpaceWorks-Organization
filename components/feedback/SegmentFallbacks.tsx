"use client";

import Link from "next/link";
import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";

export type RouteError = Error & { digest?: string };

/** A retry that re-fetches the server segment (router.refresh) and clears the boundary, in one transition. */
export function useRetry(reset: () => void) {
  const router = useRouter();
  return () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
}

/** Logs the error once (details only in development) and returns the retry. */
export function useRouteRetry(error: RouteError, reset: () => void) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error("[ui] route error", error);
    else console.error("[ui] route error");
  }, [error]);
  return useRetry(reset);
}

/** The digest matches the server log line, so support can find the failure without seeing its details. */
export function SupportReference({ digest }: { digest?: string }) {
  if (!digest) return null;
  return (
    <p className="text-caption text-ink-muted">
      Support reference: <span className="code-text select-all">{digest}</span>
    </p>
  );
}

/** Error state for a segment inside its shell: the sidebar or top bar stays, only the content area changes. */
export function SegmentError({
  error,
  reset,
  title = "We couldn’t load this page",
  body = "Try again. If it keeps happening, share the support reference with whoever runs this site.",
  backHref,
  backLabel,
}: {
  error: RouteError;
  reset: () => void;
  title?: string;
  body?: string;
  backHref: string;
  backLabel: string;
}) {
  const retry = useRouteRetry(error, reset);
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-start gap-4 py-10">
      <h1 className="text-h2 text-ink">{title}</h1>
      <p className="text-body-ui text-ink-secondary">{body}</p>
      <SupportReference digest={error.digest} />
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={retry}>Try again</Button>
        <Link href={backHref} className={buttonClasses({ variant: "secondary" })}>{backLabel}</Link>
      </div>
    </div>
  );
}

/** Not-found state for a segment inside its shell. */
export function SegmentNotFound({
  title,
  body,
  backHref,
  backLabel,
}: {
  title: string;
  body: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-start gap-4 py-10">
      <p className="text-label text-ink-muted">404</p>
      <h1 className="text-h2 text-ink">{title}</h1>
      <p className="text-body-ui text-ink-secondary">{body}</p>
      <Link href={backHref} className={buttonClasses({ variant: "secondary" })}>{backLabel}</Link>
    </div>
  );
}
