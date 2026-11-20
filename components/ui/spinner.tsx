import { BoxArt, BoxSpinner } from "@/components/brand/BoxSpinner";

/**
 * Compact progress indicator: the box loader in the surrounding text colour (mono BoxSpinner), so filled buttons
 * keep their own colours. Decorative unless `label` is given; pair it with visible text such as "Saving…".
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  if (label) return <BoxSpinner label={label} size={16} mono className={className} />;
  return <BoxArt size={16} mono className={className} />;
}
