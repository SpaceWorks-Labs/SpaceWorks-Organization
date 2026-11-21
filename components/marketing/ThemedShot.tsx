import { cn } from "@/lib/cn";

/** Screenshots in public/screens, captured in both themes by scripts/capture-screens.mjs (1440 × 900 unless noted). */
export type ScreenName = "members" | "payments" | "reports-and-analytics" | "member-cards" | "public-page" | "plans-and-join-forms" | "certificates";

/**
 * One screenshot that follows the page theme: the light capture in light, the dark capture in dark. The theme is
 * the `dark` class on <html> (CR-THEME-01), not the device preference, so this is two images switched by class
 * rather than a <picture> media query. The hidden one is display: none, so a lazy image never downloads.
 */
export function ThemedShot({ name, alt, width = 1440, height = 900, eager = false, crop = false, className }: {
  name: ScreenName;
  alt: string;
  width?: number;
  height?: number;
  /** The first screenshot on the page loads at once; the rest wait until they are near. */
  eager?: boolean;
  /** Show the top 16:10 of the capture, so captures of different heights line up in a grid. */
  crop?: boolean;
  className?: string;
}) {
  const image = (theme: "light" | "dark", display: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- static captures from /public, already sized webp
    <img
      src={`/screens/${name}-${theme}.webp`}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager && theme === "light" ? "high" : undefined}
      className={display}
    />
  );
  return (
    <div className={cn("sw-land-shot", className)} data-crop={crop || undefined}>
      {image("light", "block dark:hidden")}
      {image("dark", "hidden dark:block")}
    </div>
  );
}
