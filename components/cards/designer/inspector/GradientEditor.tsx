"use client";

import { Plus, X } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/cn";
import { GRADIENT_STOPS_MAX, GRADIENT_STOPS_MIN, type CardGradient } from "@/lib/cards/design/layerTypes";
import { addStop, removeStop, startGradient } from "@/lib/cards/design/library/paint";
import { SwitchLine } from "../controls";
import { Choice, Slider } from "./fields";
import { C, TARGET } from "./inspectorControls";

/**
 * Gradient on or off, linear or radial, its angle and 2–5 colour stops. Every stop has its own colour
 * picker, position slider and remove button, so nothing needs dragging.
 */
export function GradientEditor({ value, fill, onChange }: { value: CardGradient | null; fill: string | null; onChange: (next: CardGradient | null) => void }) {
  const setStop = (index: number, patch: Partial<CardGradient["stops"][number]>) => value && onChange({ ...value, stops: value.stops.map((stop, at) => (at === index ? { ...stop, ...patch } : stop)) });
  return (
    <div className="flex flex-col gap-2.5">
      <SwitchLine label={C.gradient.label} hint="Replaces the fill colour." checked={Boolean(value)} onCheckedChange={(on) => onChange(on ? startGradient(fill) : null)} />
      {value ? (
        <>
          <Choice<CardGradient["type"]> label={C.gradientType.label} value={value.type} options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]} onChange={(type) => onChange({ ...value, type })} />
          {value.type === "linear" ? <Slider label={C.gradientAngle.label} unit="°" min={0} max={360} step={5} value={value.angleDeg} onChange={(angleDeg) => onChange({ ...value, angleDeg })} /> : null}
          <ol aria-label="Colour stops" className="flex flex-col gap-2">
            {value.stops.map((stop, index) => (
              <li key={index} className="flex flex-col gap-1 rounded-lg border border-line p-2">
                <div className="flex items-center gap-1.5">
                  <ColorPicker
                    plain
                    label={`${C.stopColour.label} ${index + 1}`}
                    value={stop.color}
                    defaultColor={stop.color}
                    onChange={(hex) => hex && setStop(index, { color: hex.toUpperCase() })}
                    trigger={
                      <button type="button" aria-label={`${C.stopColour.label} ${index + 1}: ${stop.color}`} className={cn(TARGET.picker, "inline-flex flex-1 items-center gap-1.5 rounded-control border border-line bg-panel px-3 text-[14px] text-ink hover:bg-muted")}>
                        <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: stop.color }} />
                        <span className="code-text text-caption">{stop.color}</span>
                      </button>
                    }
                  />
                  <button type="button" aria-label={`${C.removeStop.label} (${index + 1})`} title={C.removeStop.label} disabled={value.stops.length <= GRADIENT_STOPS_MIN} onClick={() => onChange(removeStop(value, index))} className="inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-muted disabled:opacity-40">
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
                <Slider label={`${C.stopAt.label} ${index + 1}`} unit="%" min={0} max={100} step={1} value={stop.atPct} onChange={(atPct) => setStop(index, { atPct })} />
              </li>
            ))}
          </ol>
          <button type="button" disabled={value.stops.length >= GRADIENT_STOPS_MAX} onClick={() => onChange(addStop(value))} className={cn(TARGET.button, "inline-flex items-center gap-1.5 self-start rounded-control border border-line bg-panel px-4 text-[14px] font-semibold text-ink hover:bg-muted disabled:opacity-40")}>
            <Plus aria-hidden className="size-4" />
            {C.addStop.label}
          </button>
        </>
      ) : null}
    </div>
  );
}
