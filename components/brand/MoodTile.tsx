import { CircleCheck, CloudRain, Heart, Hourglass, Lightbulb, Moon, PartyPopper, Smile, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export const MOODS = ["happy", "cheering", "wink", "love", "done", "waiting", "surprised", "thinking", "sleepy", "sad"] as const;
export type Mood = (typeof MOODS)[number];

/** Each mood is a brand icon on a brand fill; ink icons keep contrast on every fill in both modes. */
const MOOD_TILES: Record<Mood, { icon: LucideIcon; fill: string }> = {
  happy: { icon: Smile, fill: "bg-sw-citron" },
  cheering: { icon: PartyPopper, fill: "bg-sw-citron" },
  wink: { icon: Sparkles, fill: "bg-sw-yellow" },
  love: { icon: Heart, fill: "bg-sw-sky" },
  done: { icon: CircleCheck, fill: "bg-sw-citron" },
  waiting: { icon: Hourglass, fill: "bg-sw-sky" },
  surprised: { icon: Zap, fill: "bg-sw-yellow" },
  thinking: { icon: Lightbulb, fill: "bg-sw-yellow" },
  sleepy: { icon: Moon, fill: "bg-sw-sky" },
  sad: { icon: CloudRain, fill: "bg-sw-cream" },
};

/**
 * A decorative mood tile: Space Works' dot faces in
 * empty states, greetings and activity rows. `size` is the tile edge in px.
 * The icon gives a quick wiggle when the tile itself is hovered (a delight
 * moment: mouse or pen only, never from the card around it, still under
 * reduced motion).
 */
export function MoodTile({ mood, size = 48, className }: { mood: Mood; size?: number; className?: string }) {
  const { icon: Icon, fill } = MOOD_TILES[mood];
  return (
    <span
      aria-hidden
      className={cn("sw-wiggle-host inline-flex shrink-0 items-center justify-center text-sw-ink", fill, className)}
      style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size / 4)) }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} className="sw-wiggle" />
    </span>
  );
}
