import { cn } from "@/lib/cn";
import { logoMasters } from "./boxOpen/logoPaths";
import { LogoBoxOverlay, type LogoShape } from "./boxOpen/LogoBoxOverlay";

export type AnimatedLogoTone = "full" | "reversed" | "ink";
type MasterKey = keyof typeof logoMasters;
type Artwork = { viewBox: string; paths: readonly { fill: string; d: string }[]; clip?: { width: number; height: number; count: number } };

const FLAPS = ["tl", "tr", "bl", "br"] as const;

function masterKey(shape: LogoShape, tone: AnimatedLogoTone): MasterKey {
  if (tone === "reversed") return `${shape}-reversed`;
  if (tone === "ink") return `${shape}-one-colour-ink`;
  return shape;
}

/** Symbol paths carry `sw-logo-sym` (hidden while the hover cycle plays); the four flaps also `sw-logo-flap`. */
function pathClass(symbol: boolean, flap: number) {
  if (!symbol) return undefined;
  return flap >= 0 && flap < 4 ? `sw-logo-sym sw-logo-flap sw-logo-flap-${FLAPS[flap]}` : "sw-logo-sym";
}

/** One master, drawn inline from its verbatim paths. The horizontal lockup's symbol is clipped by a nested viewport. */
function Master({ artwork, width, height, className }: { artwork: Artwork; width: number; height: number; className?: string }) {
  const { clip, paths } = artwork;
  const symbolCount = clip ? clip.count : artwork.viewBox === "0 0 136 126" ? paths.length : paths.length - 1;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={artwork.viewBox}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={cn("block max-w-none shrink-0", className)}
    >
      {clip ? (
        <>
          <svg x={0} y={0} width={clip.width} height={clip.height} viewBox={`0 0 ${clip.width} ${clip.height}`} overflow="hidden">
            {paths.slice(0, clip.count - 4).map((path, index) => (
              <path key={index} fill={path.fill} d={path.d} className="sw-logo-sym" />
            ))}
          </svg>
          {paths.slice(clip.count - 4).map((path, index) => (
            <path key={index} fill={path.fill} d={path.d} className={pathClass(index < 4, index)} />
          ))}
        </>
      ) : (
        paths.map((path, index) => <path key={index} fill={path.fill} d={path.d} className={pathClass(index < symbolCount, index - symbolCount + 4)} />)
      )}
    </svg>
  );
}

/**
 * THE way the Space Works mark is drawn (CR-MOTION-01, CR-LOGO-01; kit motion/box-open). At rest it is the static
 * master, inline. On hover (mouse or pen) and keyboard focus of its link or button the box folds shut and opens
 * again, once (600 + 1600ms), then the still mark returns. Never on touch or under reduced motion, never a size
 * change, never focusable itself. Tenant logos are never drawn with this and never animate.
 *
 * `adaptive` draws the reversed (cream) master in dark mode beside the light one; CSS picks one from the `dark`
 * class on <html>, so there is no flash. Decorative: the caller names it (SpaceWorksLogo does).
 */
export function AnimatedLogoMark({
  shape,
  tone = "full",
  adaptive = true,
  width,
  height,
  className,
}: {
  shape: LogoShape;
  tone?: AnimatedLogoTone;
  adaptive?: boolean;
  width: number;
  height: number;
  className?: string;
}) {
  const twin = adaptive && tone !== "reversed";
  const ground = twin ? undefined : tone === "reversed" ? "dark" : "light";
  return (
    <span data-logo-mark={shape} className={cn("relative inline-flex shrink-0", className)} style={{ width, height }}>
      <Master artwork={logoMasters[masterKey(shape, tone)]} width={width} height={height} className={twin ? "dark:hidden" : undefined} />
      {twin ? <Master artwork={logoMasters[masterKey(shape, "reversed")]} width={width} height={height} className="hidden dark:block" /> : null}
      <LogoBoxOverlay shape={shape} width={width} height={height} ground={ground} mono={tone === "ink"} />
    </span>
  );
}
