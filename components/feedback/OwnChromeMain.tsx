"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { chromeFor } from "@/components/chrome/ChromeSwitch";

/**
 * Root fallbacks (app/error.tsx, app/not-found.tsx) render straight under ChromeSwitch. Site and auth paths already
 * get its `<main id="main-content">`; paths that bring their own chrome do not, so the fallback supplies it there.
 * Either way the page has exactly one main landmark.
 */
export function OwnChromeMain({ className, children }: { className?: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (chromeFor(pathname) !== "own") return <div className={className}>{children}</div>;
  return (
    <main id="main-content" tabIndex={-1} className={`${className ?? ""} focus:outline-none`}>
      {children}
    </main>
  );
}
