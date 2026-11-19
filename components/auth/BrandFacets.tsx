import { cn } from "@/lib/cn";
import styles from "@/components/public/motion/motion.module.css";

/*
 * Decorative facets of the open box (brand "Built from the box": flap shapes as quiet accents), after the kit's
 * motion/page-enter BrandFacets. The paths are the symbol master's own top diamond and right face, verbatim, so the
 * hairline gap between them is the logo's. This is never the logo, which is never recoloured, rotated or animated.
 * The facets open once along their own edge slope at page load (never on hover); reduced motion shows them still.
 * Callers place it absolutely inside a rounded, overflow-hidden field whose corner crops it.
 */
const DIAMOND = "M66.49 16.5969C67.2595 16.0528 68.029 16.0528 68.7984 16.5969L111.829 47.0238C112.598 47.568 112.598 48.1121 111.829 48.6562L68.7984 79.0832C68.029 79.627 67.2595 79.627 66.49 79.0832L23.4598 48.6562C22.6904 48.1121 22.6904 47.568 23.4598 47.0238L66.49 16.5969Z";
const FACE = "M68.25 82.368C68.25 81.4257 68.6347 80.6825 69.4042 80.1384L112.272 49.8261C113.042 49.2823 113.426 49.4815 113.426 50.4238V92.5005C113.426 93.4428 113.042 94.1861 112.272 94.7302L69.4042 125.042C68.6347 125.587 68.25 125.387 68.25 124.445V82.368Z";
const WIDTHS = { sm: 128, md: 216, lg: 360 } as const;

export function BrandFacets({ size = "md", className }: { size?: keyof typeof WIDTHS; className?: string }) {
  const width = WIDTHS[size];
  return (
    <svg aria-hidden focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="22 16 92 110" width={width} height={Math.round((width * 110) / 92)} className={cn(styles.facets, "pointer-events-none block max-w-none select-none", className)}>
      <path className="fill-sw-orange" d={DIAMOND} />
      <path className="fill-sw-yellow" d={FACE} />
    </svg>
  );
}
