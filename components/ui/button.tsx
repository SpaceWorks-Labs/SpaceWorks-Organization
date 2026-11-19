import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Space Works button family (docs/DESIGN.md §4.1):
 * - `primary`: Maker Teal, the screen's main action.
 * - `accent`: the organisation's own colour on its public pages (teal by default).
 * - `secondary` / `neutral`: panel fill with a hairline border.
 * - `ghost`: teal text, soft teal on hover.
 * - `quiet`: text-only link button.
 * - `highlight`: Workshop Orange with an ink label; one bold public moment per layout, never in dashboard chrome.
 * - `danger` / `dangerOutline`: red outline that opens a confirmation.
 * - `dangerSolid`: red fill for the final destructive confirmation.
 * - `inverse`: Warm Cream fill with a Deep Ink label; the main action on dark bands and bars (teal would sink into them).
 * Hover is colour only (no lift or shadow); pressing sinks the control to 0.98 (CR-MOTION-01, never under
 * reduced motion). Disabled is the explicit bg-surface/text-muted/border-line state, never opacity, with hover
 * and press suppressed (CR-DISABLED-01). Prefer native `disabled`; an `aria-disabled` control also ignores
 * clicks, Enter and Space (lib/ariaDisabled.ts, installed once in components/providers.tsx).
 */
export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "neutral"
  | "ghost"
  | "quiet"
  | "highlight"
  | "danger"
  | "dangerOutline"
  | "dangerSolid"
  | "dangerQuiet"
  | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-[background-color,border-color,color,transform] duration-(--sw-dur-fast) ease-sw motion-safe:active:scale-[0.98] disabled:pointer-events-none aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed";

/** Organisation accents are chosen by the organisation, so hover darkens toward Deep Ink in sRGB instead of using a fixed token. */
const accentHover = "hover:bg-[color-mix(in_srgb,var(--sw-accent)_88%,var(--sw-ink))]";

const neutral = "border border-line bg-panel text-ink hover:bg-muted active:bg-emphasis";
const dangerOutline = "border border-danger-fg bg-panel text-danger-fg hover:border-danger-hover hover:bg-muted hover:text-danger-hover";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active",
  accent: cn("bg-accent text-on-accent", accentHover),
  secondary: neutral,
  neutral,
  ghost: "text-accent-text hover:bg-accent-soft active:bg-accent-soft active:text-ink",
  quiet: "text-ink-secondary hover:text-ink hover:underline underline-offset-4",
  highlight: "bg-highlight text-on-highlight hover:bg-highlight-hover",
  danger: dangerOutline,
  dangerOutline,
  dangerSolid: "bg-danger-solid text-on-danger hover:bg-danger-hover",
  dangerQuiet: "text-danger-fg hover:underline underline-offset-4",
  inverse: "bg-sw-cream text-sw-ink hover:bg-[color-mix(in_srgb,var(--sw-cream)_90%,var(--sw-ink))] active:bg-[color-mix(in_srgb,var(--sw-cream)_80%,var(--sw-ink))]",
};

const filledDisabled =
  "disabled:border disabled:border-line disabled:bg-surface disabled:text-ink-muted aria-disabled:border aria-disabled:border-line aria-disabled:bg-surface aria-disabled:text-ink-muted";

const disabledVariants: Partial<Record<ButtonVariant, string>> = {
  primary: filledDisabled,
  accent: filledDisabled,
  highlight: filledDisabled,
  dangerSolid: filledDisabled,
  inverse: filledDisabled,
  secondary: filledDisabled,
  neutral: filledDisabled,
  danger: filledDisabled,
  dangerOutline: filledDisabled,
  ghost: "disabled:text-ink-muted aria-disabled:text-ink-muted",
  quiet: "disabled:text-ink-muted aria-disabled:text-ink-muted",
  dangerQuiet: "disabled:text-ink-muted aria-disabled:text-ink-muted",
};

/** Every size keeps the 44px minimum target; `sm` is only more compact horizontally. */
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 py-2 text-sm",
  md: "min-h-11 px-[18px] py-2.5 text-[15px]",
  lg: "min-h-12 px-6 py-3 text-base",
};

const quietSizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-1.5 text-sm",
  md: "min-h-11 px-2 text-[15px]",
  lg: "min-h-12 px-2.5 text-base",
};

export function buttonClasses(options: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}) {
  const { variant = "secondary", size = "md", fullWidth = false, className } = options;
  const quiet = variant === "quiet" || variant === "dangerQuiet";
  return cn(base, variants[variant], disabledVariants[variant], quiet ? quietSizes[size] : sizes[size], fullWidth && "w-full", className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  /** Render the child element (e.g. a Next.js <Link>) with button styling. */
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", fullWidth, loading = false, loadingLabel, startIcon, endIcon, asChild = false, className, children, disabled, type, ...props },
  ref,
) {
  const classes = buttonClasses({ variant, size, fullWidth, className });
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <>
          <Spinner className="size-4" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {startIcon ? <span aria-hidden className="inline-flex shrink-0 [&>svg]:size-[18px]">{startIcon}</span> : null}
          {children}
          {endIcon ? <span aria-hidden className="inline-flex shrink-0 [&>svg]:size-[18px]">{endIcon}</span> : null}
        </>
      )}
    </button>
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only buttons must be named for assistive technology. */
  label: string;
  variant?: "quiet" | "secondary" | "danger" | "primary";
  size?: "sm" | "md";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "quiet", size = "md", className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,border-color,color,transform] duration-(--sw-dur-fast) ease-sw motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:text-ink-muted aria-disabled:pointer-events-none aria-disabled:text-ink-muted [&_svg]:size-[18px]",
        // sm keeps a 36px visual; the ::after extends its target to 44px (UX-2.1).
        size === "sm" ? "relative size-9 after:absolute after:-inset-1" : "size-11",
        variant === "quiet" && "text-ink-secondary hover:bg-muted hover:text-ink",
        variant === "secondary" && "border border-line bg-panel text-ink hover:bg-muted disabled:bg-surface",
        variant === "danger" && "text-danger-fg hover:bg-danger-bg",
        variant === "primary" && "bg-primary text-on-primary hover:bg-primary-hover disabled:bg-surface disabled:text-ink-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
