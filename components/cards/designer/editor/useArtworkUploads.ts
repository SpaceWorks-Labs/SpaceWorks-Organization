"use client";

import { useState } from "react";
import { uploadCardArtwork, uploadCardWatermark } from "@/app/actions/card-design";

type Result = { ok: true; data?: { url: string | null } } | { ok: false; error: string };

/** Uploads for the designer: card artwork (layers, background) and the watermark image. */
export function useArtworkUploads({ organisationSlug, planId, roleId, onError }: { organisationSlug: string; planId: string | null; roleId: string | null; onError: (message: string | null) => void }) {
  const [uploading, setUploading] = useState(false);

  /** The new URL, null when removed, undefined when it failed (the error is shown). */
  const upload = async (send: () => Promise<Result>) => {
    setUploading(true);
    onError(null);
    try {
      const result = await send();
      if (result.ok) return result.data?.url ?? null;
      onError(result.error);
    } catch {
      onError("The image didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
    return undefined;
  };
  const form = (file: File | null) => {
    const data = new FormData();
    data.set("organisationSlug", organisationSlug);
    if (planId) data.set("planId", planId);
    if (roleId) data.set("roleId", roleId);
    if (file) data.set("file", file);
    else data.set("remove", "1");
    return data;
  };

  return {
    uploading,
    uploadArtwork: async (file: File) => (await upload(() => uploadCardArtwork(form(file)))) ?? null,
    uploadWatermark: (file: File | null) => upload(() => uploadCardWatermark(form(file))),
  };
}

/** Width over height of a picture, for a new image layer of the same shape. */
export async function imageAspect(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const aspect = bitmap.width / bitmap.height;
    bitmap.close();
    return aspect;
  } catch {
    return 1;
  }
}
