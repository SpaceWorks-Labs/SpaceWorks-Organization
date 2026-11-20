import "server-only";

import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Store an image as one of the organisation's logos: validated and re-encoded (createSafeWebpDerivative, 1200 px
 * inside), at `organisations/<org>/organisation-logos/<uuid>.webp`. Uploaded, cropped, generated and brand kit
 * logos all go through here. Callers check access, rate limits and audit.
 */
export async function storeOrganisationLogo(organisationId: string, file: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(file instanceof File)) return { ok: false, error: "Choose an image to upload." };
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 5 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: 1200, height: 1200, fit: "inside" });
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `organisations/${organisationId}/organisation-logos/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId });
    return { ok: true, url: getPublicUrl(key) };
  } catch {
    console.error("[media] organisation logo upload failed");
    return { ok: false, error: "Could not upload the organisation logo." };
  }
}
