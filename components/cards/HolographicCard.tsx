"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./cards.module.css";

/*
 * A card you can hold: it tilts towards the pointer (or the phone's tilt),
 * catches a Citron and Sky Blue sheen, and flips to show its back. Plain CSS
 * 3D transforms; no WebGL. With reduced motion the card stays flat and the
 * flip is an instant swap. `celebrate` plays the one-time "card issued" entrance: the card rises
 * into place and a Citron and Sky Blue sweep crosses it once (still under reduced motion).
 * `delight={false}` is the organisation's playful-touches opt-out (Organisation.delightEnabled): the card stays
 * flat with no sheen, sweep or phone tilt, and still flips.
 */

type Tilt = { x: number; y: number };

const MAX_TILT_DEG = 9;

const noop = () => () => undefined;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
}

/** "auto": orientation events just work; "ask": iOS needs a tap to allow them; "none": no sensor. */
function gyroSupport(): "auto" | "ask" | "none" {
  if (!("DeviceOrientationEvent" in window) || !window.matchMedia("(pointer: coarse)").matches) return "none";
  const ctor = window.DeviceOrientationEvent as unknown as OrientationPermission;
  return typeof ctor.requestPermission === "function" ? "ask" : "auto";
}

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

export function HolographicCard({
  front,
  back,
  widthMm,
  heightMm,
  label,
  celebrate = false,
  delight = true,
}: {
  front: ReactNode;
  back: ReactNode | null;
  widthMm: number;
  heightMm: number;
  label: string;
  celebrate?: boolean;
  delight?: boolean;
}) {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const support = useSyncExternalStore(noop, gyroSupport, () => "none" as const);
  const [granted, setGranted] = useState(false);
  // Phones tilt the card; iOS asks first, so it offers a button.
  const gyro = !delight ? "off" : support === "auto" || granted ? "on" : support === "ask" ? "ask" : "off";
  const frame = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const schedule = (next: Tilt) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setTilt(next);
    });
  };

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    if (gyro !== "on" || reduced) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const x = Math.max(-1, Math.min(1, event.gamma / 30));
      const y = Math.max(-1, Math.min(1, (event.beta - 45) / 30));
      schedule({ x, y });
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [gyro, reduced]);

  const enableGyro = async () => {
    const ctor = window.DeviceOrientationEvent as unknown as OrientationPermission;
    try {
      setGranted((await ctor.requestPermission?.()) === "granted");
    } catch {
      setGranted(false);
    }
  };

  const active = !reduced && delight;
  const celebrating = celebrate && delight;
  const rotateY = (flipped ? 180 : 0) + (active ? tilt.x * MAX_TILT_DEG : 0);
  const rotateX = active ? -tilt.y * MAX_TILT_DEG : 0;
  const sheenX = 50 + tilt.x * 40;
  const sheenY = 50 + tilt.y * 40;
  const aspect = `${widthMm} / ${heightMm}`;

  const faceStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    borderRadius: 14,
    overflow: "hidden",
    // A filter on the turning element would flatten the 3D scene, so each face carries its own lift.
    boxShadow: "0 18px 32px -12px color-mix(in srgb, var(--sw-brand-deep-ink) 35%, transparent)",
  };

  const sheen = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        mixBlendMode: "soft-light",
        opacity: active ? 0.55 + Math.min(0.35, Math.hypot(tilt.x, tilt.y) * 0.35) : 0,
        // Longhand only: React warns when the `background` shorthand is mixed with backgroundSize/Position on re-render.
        backgroundImage: `radial-gradient(circle at ${sheenX}% ${sheenY}%, color-mix(in srgb, white 75%, transparent), transparent 42%), linear-gradient(${110 + tilt.x * 25}deg, transparent 22%, color-mix(in srgb, var(--sw-brand-citron) 65%, transparent) 38%, color-mix(in srgb, var(--sw-brand-sky-blue) 70%, transparent) 50%, color-mix(in srgb, var(--sw-brand-warm-cream) 60%, transparent) 60%, transparent 76%)`,
        backgroundSize: "100% 100%, 220% 220%",
        backgroundPosition: `center, ${sheenX}% ${sheenY}%`,
      }}
    />
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={stage}
        className={celebrating ? `w-full ${styles.issued}` : "w-full"}
        style={{ perspective: 1200, maxWidth: widthMm > heightMm ? 420 : 280 }}
        onPointerMove={(event) => {
          if (!active || event.pointerType === "touch") return;
          const box = event.currentTarget.getBoundingClientRect();
          schedule({ x: ((event.clientX - box.left) / box.width) * 2 - 1, y: ((event.clientY - box.top) / box.height) * 2 - 1 });
        }}
        onPointerLeave={() => schedule({ x: 0, y: 0 })}
      >
        <div
          role="img"
          aria-label={`${label}, ${flipped ? "back" : "front"}`}
          onClick={() => back && setFlipped((value) => !value)}
          className="relative w-full cursor-pointer select-none"
          style={{
            aspectRatio: aspect,
            transformStyle: "preserve-3d",
            transform: reduced ? undefined : `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            // The tilt eases after the pointer over 2.5 × slow (600ms) on the enter curve.
            transition: reduced ? undefined : "transform calc(var(--sw-dur-slow) * 2.5) var(--sw-ease-enter)",
          }}
        >
          <div style={{ ...faceStyle, visibility: reduced && flipped ? "hidden" : undefined }}>
            {front}
            {sheen}
            {celebrating ? <span aria-hidden className={styles.sweep} /> : null}
          </div>
          {back ? (
            <div style={{ ...faceStyle, transform: reduced ? undefined : "rotateY(180deg)", visibility: reduced && !flipped ? "hidden" : undefined }}>
              {back}
              {sheen}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {back ? (
          <Button size="sm" variant="secondary" startIcon={<RotateCcw />} onClick={() => setFlipped((value) => !value)} aria-pressed={flipped}>
            {flipped ? "Show the front" : "Flip to the back"}
          </Button>
        ) : null}
        {gyro === "ask" ? (
          <Button size="sm" variant="quiet" startIcon={<Smartphone />} onClick={enableGyro}>Tilt with your phone</Button>
        ) : null}
      </div>
    </div>
  );
}
