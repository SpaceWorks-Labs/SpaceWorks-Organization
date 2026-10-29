"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { setOwnMemberPhoto } from "@/app/actions/portal-photo";
import { Avatar } from "@/components/ui/display";
import { Button } from "@/components/ui/button";

/** The photo on the member's card, with Add or Change when their organisation lets members upload it. */
export function PortalPhotoField({ organisationSlug, organisationName, name, photoUrl, canUpload }: { organisationSlug: string; organisationName: string; name: string; photoUrl: string | null; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!photoUrl && !canUpload) return null;

  return (
    <div className="mb-5 flex items-center gap-4">
      <Avatar name={name} src={photoUrl} size="lg" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-caption text-ink-muted">
          {canUpload ? "The photo on your card. A clear, front-facing picture of your face works best." : `The photo on your card. Ask ${organisationName} to change it.`}
        </p>
        {canUpload ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Your photo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                startTransition(async () => {
                  setError(null);
                  const form = new FormData();
                  form.set("organisationSlug", organisationSlug);
                  form.set("file", file);
                  const result = await setOwnMemberPhoto(form);
                  if (!result.ok) setError(result.error);
                  else router.refresh();
                });
              }}
            />
            <span>
              <Button size="sm" variant="secondary" loading={pending} onClick={() => input.current?.click()}>
                <Camera aria-hidden className="size-4" />
                {photoUrl ? "Change photo" : "Add photo"}
              </Button>
            </span>
            {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
