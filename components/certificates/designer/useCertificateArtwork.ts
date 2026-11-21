"use client";

import { useState } from "react";
import { uploadCertificateArtwork } from "@/app/actions/certificate-designs";

/**
 * Pictures for a certificate's layers and background, stored with the organisation's own artwork
 * (`uploadCertificateArtwork`). Resolves to the new URL, or null when the upload failed (the error is shown).
 */
export function useCertificateArtwork({ organisationSlug, onError }: { organisationSlug: string; onError: (message: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  return {
    uploading,
    async uploadArtwork(file: File): Promise<string | null> {
      setUploading(true);
      onError(null);
      try {
        const data = new FormData();
        data.set("organisationSlug", organisationSlug);
        data.set("file", file);
        const result = await uploadCertificateArtwork(data);
        if (result.ok && result.data) return result.data.url;
        onError(result.ok ? "The image didn't upload. Try again." : result.error);
      } catch {
        onError("The image didn't upload. Try again.");
      } finally {
        setUploading(false);
      }
      return null;
    },
  };
}
