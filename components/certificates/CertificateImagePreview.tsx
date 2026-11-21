"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { LogoLoader } from "@/components/brand/LogoLoader";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

/**
 * The issued certificate as it prints, drawn on request (a full 300 dpi page takes a moment and every drawing is a
 * recorded download), with the box loader while it draws.
 */
export function CertificateImagePreview({ src, widthMm, heightMm, alt }: { src: string; widthMm: number; heightMm: number; alt: string }) {
  const [state, setState] = useState<"idle" | "loading" | "shown" | "failed">("idle");
  if (state === "idle") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-subtle p-6 text-center" style={{ aspectRatio: `${widthMm} / ${heightMm}` }}>
        <p className="max-w-sm text-body-ui text-ink-secondary">See the certificate exactly as it prints, drawn from the approved design.</p>
        <Button variant="secondary" startIcon={<Eye />} onClick={() => setState("loading")}>Show preview</Button>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-subtle" style={{ aspectRatio: `${widthMm} / ${heightMm}` }}>
      {state === "loading" ? <div className="absolute inset-0 flex items-center justify-center"><LogoLoader label="Drawing the certificate" className="py-6" /></div> : null}
      {state === "failed" ? <div className="absolute inset-0 flex items-center justify-center p-4"><Callout tone="danger" role="alert">The preview couldn&apos;t be drawn. Try the PNG or PDF download instead.</Callout></div> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn on demand for this viewer, never cached */}
      <img src={src} alt={alt} onLoad={() => setState("shown")} onError={() => setState("failed")} className={state === "shown" ? "size-full object-contain" : "sr-only"} />
    </div>
  );
}
