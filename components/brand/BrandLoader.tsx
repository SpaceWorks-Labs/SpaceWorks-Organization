import { cn } from "@/lib/cn";
import { LogoLoader } from "./LogoLoader";

/**
 * Loading indicator: the Space Works box loader (LogoLoader) at a compact size, inline. `size` is the overall width
 * in px. The still, open logo under reduced motion. Compact, so `label` is announced politely but not printed.
 */
export function BrandLoader({ size = 48, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return <LogoLoader size={Math.round((size * 126) / 136)} label={label} showLabel={false} className={cn("inline-grid w-auto", className)} />;
}

/**
 * Route-level loading state (every loading.tsx): the box loader centred in the content area, so the sidebar and
 * top bar stay put while the page loads, with its status printed under the box. Patch never stands beside the box
 * logo, so the loader is the box alone.
 */
export function BrandPageLoader({ label = "Loading the page" }: { label?: string }) {
  return <LogoLoader label={label} className="min-h-[50dvh] py-10" />;
}
