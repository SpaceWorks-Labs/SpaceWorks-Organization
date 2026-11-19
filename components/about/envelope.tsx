import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HAIRLINE, INK, LETTER, Lines, MUTED_INK, PAPER } from "./letter";

// An airmail envelope in Sky Blue, shaded only with brand cream and Deep Ink.
const SKY = "var(--sw-brand-sky-blue)";
const SKY_LIGHT = "color-mix(in srgb, var(--sw-brand-sky-blue) 62%, var(--sw-brand-warm-cream))";
const SKY_DEEP = "color-mix(in srgb, var(--sw-brand-sky-blue) 76%, var(--sw-brand-deep-ink))";
const ENVELOPE = `linear-gradient(160deg, ${SKY}, ${SKY_DEEP})`;
const ENVELOPE_FLAP = `linear-gradient(172deg, ${SKY_LIGHT} 10%, ${SKY} 85%)`;
const ENVELOPE_POCKET = `linear-gradient(12deg, ${SKY}, ${SKY_LIGHT})`;
// The side folds, a shade lighter than the body (opaque mixes, no alpha fills).
const SKY_SIDE = "color-mix(in srgb, var(--sw-brand-sky-blue) 84%, var(--sw-brand-deep-ink))";
const ENVELOPE_SIDES = `linear-gradient(115deg, ${SKY}, ${SKY_SIDE})`;
const FLAP_EDGE = "drop-shadow(0 1.5px 0 color-mix(in srgb, var(--sw-brand-deep-ink) 30%, transparent))";
// Airmail stripes in Maker Teal along the edge of the envelope.
const AIRMAIL = "repeating-linear-gradient(-45deg, var(--sw-brand-maker-teal) 0 7px, var(--sw-brand-warm-cream) 7px 14px)";
// The inside of the flap: Maker Teal with a Citron dot lining.
const LINER = "radial-gradient(circle, color-mix(in srgb, var(--sw-brand-citron) 60%, var(--sw-brand-maker-teal)) 1.4px, transparent 1.6px) 0 0 / 11px 11px, var(--sw-brand-maker-teal)";
const FLAP_CLIP = "polygon(0 0, 100% 0, 50% 100%)";
const FLAP_BACK_CLIP = "polygon(0 100%, 100% 100%, 50% 0)";
export const ENVELOPE_RATIO = 1.62;

function EnvelopeBody() {
  return (
    <>
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE, boxShadow: `inset 0 0 0 1px ${HAIRLINE}` }} />
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE_SIDES, clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE_SIDES, transform: "scaleX(-1)", clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
    </>
  );
}

function Pocket({ children }: { children?: ReactNode }) {
  return (
    <span className="absolute inset-0 rounded-[10px]">
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE_POCKET, clipPath: "polygon(0 100%, 0 0, 50% 54%, 100% 0, 100% 100%)" }} />
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] p-[5px]"
        style={{ background: AIRMAIL, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }}
      />
      {children}
    </span>
  );
}

function Label() {
  return (
    <span className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-3 text-left" style={{ color: INK }}>
      <span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: MUTED_INK }}>{LETTER.overline}</span>
        <span className="mt-0.5 block font-accent text-[16px] font-medium leading-tight">{LETTER.title}</span>
      </span>
      <span className="hidden shrink-0 text-[12px] font-semibold text-(--note-muted) transition-colors duration-(--sw-dur-fast) group-hover:text-(--note-ink) sm:inline" style={{ ["--note-muted" as string]: MUTED_INK, ["--note-ink" as string]: INK }}>Open the letter →</span>
    </span>
  );
}

/** A small isometric box pressed into the seal (a drawing, not the logo). */
function BoxGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3 20 7.5 12 12 4 7.5Z" />
      <path d="M4 7.5V16.5L12 21V12" />
      <path d="M20 7.5V16.5L12 21" />
    </svg>
  );
}

/** The seal: the page's one Workshop Orange moment, with a Deep Ink box pressed into it. */
function WaxSeal({ className, half, style }: { className?: string; half?: "left" | "right"; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cn("grid place-items-center rounded-[47%_53%_49%_51%] text-sw-ink", className)}
      style={{
        background: "radial-gradient(circle at 32% 26%, color-mix(in srgb, var(--sw-brand-workshop-orange) 78%, var(--sw-brand-warm-cream)), var(--sw-brand-workshop-orange) 70%)",
        boxShadow: `inset 0 0 0 1.5px ${HAIRLINE}`,
        // A jagged crack down the middle when split.
        clipPath:
          half === "left"
            ? "polygon(0 0, 54% 0, 47% 18%, 55% 33%, 44% 52%, 53% 70%, 45% 86%, 51% 100%, 0 100%)"
            : half === "right"
              ? "polygon(54% 0, 100% 0, 100% 100%, 51% 100%, 45% 86%, 53% 70%, 44% 52%, 55% 33%, 47% 18%)"
              : undefined,
        ...style,
      }}
    >
      <span className="grid size-[64%] place-items-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--sw-brand-deep-ink)_35%,var(--sw-brand-workshop-orange))]">
        <BoxGlyph />
      </span>
    </span>
  );
}

/**
 * The sealed envelope on the page. A delight moment (docs/DESIGN.md "Easter eggs"): on hover with a mouse or pen, and
 * only without reduced motion, the flap lifts a little and the seal turns (slow token, enter curve).
 */
export function ClosedEnvelope() {
  return (
    <span className="relative block size-full">
      <EnvelopeBody />
      <Pocket>
        <Label />
      </Pocket>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[58%] origin-top rounded-t-[10px] transition-transform duration-(--sw-dur-slow) ease-sw-enter [transform:perspective(900px)_rotateX(0deg)] motion-safe:group-hover:[transform:perspective(900px)_rotateX(16deg)] motion-reduce:transition-none"
        style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: FLAP_EDGE }}
      />
      <WaxSeal className="absolute left-1/2 top-[58%] size-[60px] -translate-x-1/2 -translate-y-1/2 transition-transform duration-(--sw-dur-slow) ease-sw-enter motion-safe:group-hover:rotate-[-12deg] motion-reduce:transition-none" />
    </span>
  );
}

/**
 * The opening, all in CSS (app/styles/eggs.css): the seal cracks and its halves tumble away, the flap swings
 * back to show its lining, the folded letter slides out, and the envelope drops away. `width` is the
 * envelope's width in px.
 */
export function OpeningScene({ width }: { width: number }) {
  const height = width / ENVELOPE_RATIO;
  const panel = Math.round(height * 0.56);
  return (
    <div className="sw-note-scene relative [perspective:1400px]" style={{ width, height, ["--note-lift" as string]: `${-height * 0.66}px` }}>
      <div className="sw-note-env absolute inset-0" style={{ zIndex: 1 }}>
        <EnvelopeBody />
      </div>
      <div className="sw-note-sheet absolute overflow-hidden rounded-[3px] px-6 py-4" style={{ left: "7%", right: "7%", top: height * 0.08, height: panel, zIndex: 2, background: PAPER, color: INK, boxShadow: `inset 0 0 0 1px ${HAIRLINE}` }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: MUTED_INK }}>{LETTER.overline}</p>
        <p className="mt-1 font-accent text-[15px] font-medium leading-tight">{LETTER.title}</p>
        <span className="mt-3 block"><Lines count={3} /></span>
      </div>
      <div className="sw-note-env absolute inset-0" style={{ zIndex: 3 }}>
        <Pocket>
          <span className="sw-note-label absolute inset-0"><Label /></span>
        </Pocket>
      </div>
      <div className="sw-note-flapwrap pointer-events-none absolute inset-0 [perspective:1400px]" style={{ zIndex: 4 }}>
        <div className="sw-note-flap absolute inset-x-0 top-0 h-[58%] origin-top [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-t-[10px] [backface-visibility:hidden]" style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: FLAP_EDGE }} />
          {/* The lining sits on the flipped back face, drawn upside down so it lands the right way up. */}
          <div className="absolute inset-0 rounded-b-[10px] [backface-visibility:hidden] [transform:rotateX(180deg)]" style={{ background: LINER, clipPath: FLAP_BACK_CLIP }} />
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[58%]" style={{ zIndex: 6 }}>
        <WaxSeal half="left" className="sw-note-seal-left absolute -left-[30px] -top-[30px] size-[60px]" />
        <WaxSeal half="right" className="sw-note-seal-right absolute -left-[30px] -top-[30px] size-[60px]" />
      </div>
    </div>
  );
}
