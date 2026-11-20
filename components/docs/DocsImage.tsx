import { resolveDocImage } from "@/lib/docs/links";
import { screenExists } from "@/lib/docs/pages";

const imageClass = "h-auto max-w-full rounded-[16px] border border-line";

function Missing({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} className="text-label flex min-h-32 items-center justify-center rounded-[16px] border border-dashed border-line-strong bg-muted p-6 text-center text-ink-muted">
      Screenshot to come: {label}
    </div>
  );
}

/** One image from /screens or /brand; a screenshot not captured yet shows as a note, never a broken image. */
export function DocsImage({ src, alt }: { src: string | undefined; alt: string }) {
  const safe = resolveDocImage(src);
  if (!safe) return null;
  const shown = !safe.startsWith("/screens/") || screenExists(safe);
  return (
    <span className="my-6 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {shown ? <img src={safe} alt={alt} loading="lazy" className={imageClass} /> : <Missing label={alt} />}
    </span>
  );
}

/** A light and a dark screenshot of the same screen: only the one matching the current theme is shown. */
export function DocsScreenPair({ light, dark, alt }: { light: string; dark: string; alt: string }) {
  const lightSrc = resolveDocImage(light);
  const darkSrc = resolveDocImage(dark);
  if (!lightSrc || !darkSrc) return null;
  const label = alt.replace(/ in the light theme$/i, "");
  if (!screenExists(lightSrc) || !screenExists(darkSrc)) return <figure className="my-6"><Missing label={label} /></figure>;
  return (
    <figure className="my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lightSrc} alt={label} loading="lazy" className={`${imageClass} dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={darkSrc} alt={label} loading="lazy" className={`${imageClass} hidden dark:block`} />
      <figcaption className="text-caption mt-2 text-ink-muted">{label}</figcaption>
    </figure>
  );
}
