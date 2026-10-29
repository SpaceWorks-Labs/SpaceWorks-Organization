import { cn } from "@/lib/cn";

type PatchPose = "idle" | "sneeze" | "walk";

/** Native frame sizes of the artwork in public/brand/patch/ (never shown larger than this). */
export const PATCH_FRAME = { pose: 272, walk: { width: 256, height: 176 } } as const;

/** Clear space around Patch: a quarter of the badge's height (SpaceWorks-Design mascot/README.md). */
export function patchClearSpace(size: number) {
  return Math.round(size / 4);
}

/**
 * Patch, the Space Works painted wolf, drawn from the design system's own frames (scripts/sync-patch.mjs).
 *
 * - `idle`: breathes, blinks and twitches each ear (frames 1–4 of the concept loop, without the sneeze).
 *   For empty states and the About page.
 * - `sneeze`: plays the sneeze (frames 5–8) once, then rests. Saved for moments when the community acts
 *   together, like an organisation being approved or a member being let in.
 * - `walk`: trots in place on the walk cycle. For loading.
 *
 * Patch is never recoloured, mirrored, stretched or shown past its native size, carries its clear space as
 * padding, and is never put beside the box logo. Decorative by default; pass `label` when Patch carries
 * meaning. Every pose rests on its first frame under reduced motion.
 */
export function Patch({ pose = "idle", size = 96, label, className }: { pose?: PatchPose; size?: number; label?: string; className?: string }) {
  const walking = pose === "walk";
  const width = Math.min(size, walking ? PATCH_FRAME.walk.width : PATCH_FRAME.pose);
  return (
    <span
      className={cn("sw-patch inline-block shrink-0", className)}
      data-pose={pose}
      style={{ padding: patchClearSpace(walking ? (width * PATCH_FRAME.walk.height) / PATCH_FRAME.walk.width : width) }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <span className="sw-patch-sprite block" style={{ width }} />
    </span>
  );
}
