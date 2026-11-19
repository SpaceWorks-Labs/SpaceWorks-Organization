import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The V1 type scale (app/globals.css) uses named text-* classes. Register them as
// font sizes so a later text colour doesn't silently drop the type style.
const twMerge = extendTailwindMerge({
  extend: {
    // `rounded-control` is the 10px control radius for buttons and inputs (app/globals.css --radius-control).
    theme: { radius: ["control"] },
    classGroups: {
      "font-size": [{ text: ["display-xl", "display-l", "display-m", "h1", "h2", "h3", "h4", "title", "body", "body-l", "body-ui", "label", "caption", "overline"] }],
    },
  },
});

/** Merge conditional class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
