import { describe, expect, it } from "vitest";
import { isPublicDerivativeKey } from "@/lib/storage";

describe("public derivative storage keys", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts only generated organisation image derivatives", () => {
    for (const folder of ["organisation-logos", "member-id-photos", "member-id-watermarks", "member-id-artwork", "page-images"]) {
      expect(isPublicDerivativeKey(`organisations/org_1/${folder}/${uuid}.webp`)).toBe(true);
    }
    expect(isPublicDerivativeKey(`users/user_1/profile-images/${uuid}.webp`)).toBe(true);
  });

  it("rejects folders this product does not upload to", () => {
    for (const folder of ["event-covers", "event-speakers", "event-sponsors", "event-page-logos", "certificate-backgrounds", "certificate-assets"]) {
      expect(isPublicDerivativeKey(`organisations/org_1/${folder}/${uuid}.webp`)).toBe(false);
    }
  });

  it("rejects traversal, encoded separators, arbitrary objects, and non-WebP files", () => {
    expect(isPublicDerivativeKey(`organisations/org_1/../secrets/${uuid}.webp`)).toBe(false);
    expect(isPublicDerivativeKey(`organisations/org_1/organisation-logos/%2e%2e.webp`)).toBe(false);
    expect(isPublicDerivativeKey(`backups/${uuid}.webp`)).toBe(false);
    expect(isPublicDerivativeKey(`organisations/org_1/organisation-logos/${uuid}.svg`)).toBe(false);
  });
});
