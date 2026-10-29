import { cn } from "@/lib/cn";
import { AvatarImage } from "./avatar-image";

/* ---------- Avatar & org logo ---------- */

function initials(name: string | null | undefined, fallback = "?") {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`).toUpperCase();
}

const avatarSizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" } as const;
type AvatarSize = keyof typeof avatarSizes;

/** Photo if present, else 1–2 initials on a tint (docs/DESIGN.md §3). */
export function Avatar({ name, src, size = "md", tone = "neutral", className }: { name?: string | null; src?: string | null; size?: AvatarSize; tone?: "neutral" | "accent" | "success" | "warning" | "ink"; className?: string }) {
  const toneClass = {
    neutral: "bg-emphasis text-ink-secondary",
    accent: "bg-accent-soft text-accent-text",
    success: "bg-success-bg text-success-fg",
    warning: "bg-warning-bg text-warning-fg",
    ink: "bg-primary text-on-primary",
  }[tone];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold", avatarSizes[size], toneClass, className)}>
      {src ? (
        <AvatarImage src={src} fallback={<span aria-hidden>{initials(name)}</span>} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {name ? <span className="sr-only">{name}</span> : null}
    </span>
  );
}

const logoSizes = { sm: "size-8 rounded-[9px] text-xs", md: "size-10 rounded-[10px] text-sm", lg: "size-14 rounded-[14px] text-lg", xl: "size-24 rounded-[24px] text-3xl" } as const;

/** Square organisation logo; falls back to initials on ink. */
export function OrgLogo({ name, src, size = "md", className }: { name: string; src?: string | null; size?: keyof typeof logoSizes; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden border border-line font-semibold", logoSizes[size], src ? "bg-panel" : "bg-primary text-on-primary", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- organisation logos are served by the app's own upload route
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

