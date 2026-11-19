"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { pageAnnouncement } from "./routeAnnouncement";

const SETTLE_MS = 150;

/**
 * Mount once in the root layout. After a client-side page change it says the new page's name in a polite live region.
 * Next.js already announces a page change when `document.title` changes (its own announcer, assertive); this fills
 * the gap it leaves, pages that share a title (for example every tab of a member record), by announcing the page's
 * heading instead. Query-string and hash changes are not page changes and are ignored.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const previous = useRef<{ pathname: string; title: string } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const before = previous.current;
    const timer = setTimeout(() => {
      const title = document.title.trim();
      const heading = document.querySelector("#main-content h1, main h1, h1")?.textContent ?? "";
      const text = pageAnnouncement(before, { pathname, title, heading });
      previous.current = { pathname, title };
      setMessage(text ?? "");
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname]);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
