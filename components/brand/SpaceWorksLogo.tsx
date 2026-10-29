import { cn } from "@/lib/cn";

export type SpaceWorksLogoVariant = "symbol" | "lockup-horizontal" | "lockup-stacked" | "app-icon";
export type SpaceWorksLogoTone = "full" | "reversed" | "ink";

/**
 * Artwork size of each master in public/brand/logo (SpaceWorks-Design/logo,
 * copied unaltered) and the smallest height it may be drawn at: the symbol is
 * never under 48px, a lockup never narrower than 180px. The app-icon tile is
 * the brand's small-size exception (favicons, compact chrome).
 */
export const SPACE_WORKS_LOGO_ARTWORK: Record<SpaceWorksLogoVariant, { width: number; height: number; minHeight: number }> = {
  symbol: { width: 136, height: 126, minHeight: 48 },
  "lockup-horizontal": { width: 360, height: 58, minHeight: Math.ceil((180 * 58) / 360) },
  "lockup-stacked": { width: 360, height: 128, minHeight: Math.ceil((180 * 128) / 360) },
  "app-icon": { width: 240, height: 240, minHeight: 16 },
};

const DEFAULT_HEIGHT: Record<SpaceWorksLogoVariant, number> = {
  symbol: 48,
  "lockup-horizontal": 40,
  "lockup-stacked": 64,
  "app-icon": 32,
};

/** Public URL of a logo master. */
export function spaceWorksLogoSrc(variant: SpaceWorksLogoVariant, tone: SpaceWorksLogoTone = "full"): string {
  if (variant === "app-icon" || tone === "full") return `/brand/logo/${variant}.svg`;
  return `/brand/logo/${variant}-${tone === "ink" ? "one-colour-ink" : "reversed"}.svg`;
}

/** Size of the logo as drawn, after the minimum-size clamp. */
export function spaceWorksLogoSize(variant: SpaceWorksLogoVariant, height?: number): { width: number; height: number } {
  const artwork = SPACE_WORKS_LOGO_ARTWORK[variant];
  const h = Math.max(artwork.minHeight, Math.round(height ?? DEFAULT_HEIGHT[variant]));
  return { width: Math.round((h * artwork.width) / artwork.height), height: h };
}

// Light/dark twins: CSS picks one, so there is no flash or layout shift. Dark is the
// `dark` class on <html>; the operating-system preference is never consulted.
const SHOW_IN_LIGHT = "dark:hidden";
const SHOW_IN_DARK = "hidden dark:block";

type SpaceWorksLogoProps = {
  variant?: SpaceWorksLogoVariant;
  /** full colour on cream/light, ink on white, reversed (cream) on Deep Ink or teal. Ignored for app-icon. */
  tone?: SpaceWorksLogoTone;
  /**
   * Swap a full/ink logo for the reversed artwork in dark mode (default true).
   * Turn off when the logo sits on a surface that does not change with the theme.
   */
  adaptive?: boolean;
  /** Artwork height in px; clamped so the symbol is ≥48px and lockups are ≥180px wide. */
  height?: number;
  /** Pad the artwork with the brand clear space (¼ of the symbol height) on every side. */
  clearSpace?: boolean;
  /** Accessible name; `null` when visible text next to it already names Space Works. */
  label?: string | null;
  /** Layout only (margins, responsive display). Never recolour, filter or transform the logo. */
  className?: string;
};

/**
 * The Space Works logo, drawn from the unaltered master SVGs. Use full colour
 * on cream/light surfaces, ink on white, and reversed on Deep Ink or teal.
 */
export function SpaceWorksLogo({ variant = "lockup-horizontal", tone = "full", adaptive = true, height, clearSpace = false, label = "Space Works", className }: SpaceWorksLogoProps) {
  const size = spaceWorksLogoSize(variant, height);
  const twin = adaptive && tone !== "reversed" && variant !== "app-icon";
  const image = (src: string, display: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG masters from /public
    <img src={src} alt="" width={size.width} height={size.height} className={cn("block max-w-none shrink-0", display)} draggable={false} />
  );
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      data-logo={variant}
      className={cn("inline-flex shrink-0", className)}
      style={clearSpace ? { padding: Math.round(size.height / 4) } : undefined}
    >
      {image(spaceWorksLogoSrc(variant, tone), twin ? SHOW_IN_LIGHT : "")}
      {twin ? image(spaceWorksLogoSrc(variant, "reversed"), SHOW_IN_DARK) : null}
    </span>
  );
}

/**
 * The product lockup for headers: the horizontal Space Works lockup, a thin
 * rule, and "Organization" in Gilroy ExtraBold. The rule and label sit a clear space
 * (¼ of the lockup height) away from the artwork.
 */
export function SpaceWorksProductLogo({ height = 36, label = "Space Works Organization", className }: { height?: number; label?: string | null; className?: string }) {
  const size = spaceWorksLogoSize("lockup-horizontal", height);
  const space = Math.round(size.height / 4);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex shrink-0 items-center", className)}
      style={{ gap: space }}
    >
      <SpaceWorksLogo variant="lockup-horizontal" height={size.height} label={null} />
      <span aria-hidden className="block w-px shrink-0 bg-line-strong" style={{ height: Math.round(size.height * 0.62) }} />
      <span aria-hidden className="font-sans font-semibold leading-none tracking-[-0.01em] text-ink" style={{ fontSize: Math.round(size.height * 0.5) }}>
        Organization
      </span>
    </span>
  );
}
