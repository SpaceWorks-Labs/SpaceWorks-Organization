"use client";

import { useState } from "react";
import { Crop, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoCropDialog } from "./LogoCropDialog";
import { LogoMakerDialog } from "./LogoMakerDialog";

/**
 * Under the profile's logo picker: crop and zoom the chosen image to a square before it uploads, or make a
 * simple logo. Both hand their result back to the profile form, which saves it with "Save changes".
 */
export function LogoTools({ organisationSlug, organisationName, brandColours, previewUrl, disabled, onCropped, onMade }: {
  organisationSlug: string;
  organisationName: string;
  brandColours: readonly string[];
  /** The image the cropper starts from: the chosen file or the current logo. */
  previewUrl: string;
  disabled: boolean;
  onCropped: (file: File, previewUrl: string) => void;
  onMade: (url: string) => void;
}) {
  const [making, setMaking] = useState(false);
  const [cropping, setCropping] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" startIcon={<Sparkles />} disabled={disabled} onClick={() => setMaking(true)}>
        Make a logo
      </Button>
      {previewUrl ? (
        <Button size="sm" variant="secondary" startIcon={<Crop />} disabled={disabled} onClick={() => setCropping(true)}>
          Crop and zoom
        </Button>
      ) : null}
      {making ? <LogoMakerDialog organisationSlug={organisationSlug} organisationName={organisationName} brandColours={brandColours} open={making} onOpenChange={setMaking} onMade={onMade} /> : null}
      {cropping && previewUrl ? <LogoCropDialog key={previewUrl} src={previewUrl} open={cropping} onOpenChange={setCropping} onCropped={onCropped} /> : null}
    </div>
  );
}
