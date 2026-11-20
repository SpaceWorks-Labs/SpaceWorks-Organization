"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { OwnChromeMain } from "@/components/feedback/OwnChromeMain";
import { SupportReference, useRetry, type RouteError } from "@/components/feedback/SegmentFallbacks";

export default function ErrorBoundary({ error, reset }: { error: RouteError; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error("[ui] route error", error);
    else console.error("[ui] route error");
  }, [error]);
  const retry = useRetry(reset);
  return (
    <OwnChromeMain className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <span aria-hidden className="relative mb-2 block size-16">
        <span className="absolute inset-0 rounded-[16px] bg-sw-sky" />
        <span className="absolute -right-2 -top-2 size-7 rounded-full bg-sw-citron" />
      </span>
      <h1 className="text-h1 text-ink">We couldn’t load this page</h1>
      <p className="text-body-ui text-ink-secondary">Try again. If it keeps happening, let the team that runs this Space Works Organization site know and share the support reference.</p>
      <SupportReference digest={error.digest} />
      <Button variant="primary" onClick={retry}>Try again</Button>
    </OwnChromeMain>
  );
}
