"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { templateForPath } from "@/lib/telemetry/routes";

/**
 * Sends one count per public page view to this site's own server: the route template (and the organisation's
 * slug under /o/), nothing else. Same origin, no cookie, no storage, no consent needed because nothing personal is
 * kept. Signed-in and signed-out visitors alike. Pages with no approved template send nothing.
 */
export function VisitBeacon() {
  const pathname = usePathname();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || sent.current === pathname) return;
    sent.current = pathname;
    const route = templateForPath(pathname);
    if (!route || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    const orgSlug = route.startsWith("/o/") ? pathname.split("/")[2] : undefined;
    try { navigator.sendBeacon("/api/visits", JSON.stringify(orgSlug ? { route, orgSlug } : { route })); } catch { /* counting never affects the page */ }
  }, [pathname]);
  return null;
}
