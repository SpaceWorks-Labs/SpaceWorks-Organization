"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMemberPhotoUpload, setMemberPortal } from "@/app/actions/member-portal";
import type { ActionResult } from "@/app/actions/org";
import { Callout } from "@/components/ui/display";
import { SwitchRow } from "@/components/ui/choice";
import { cn } from "@/lib/cn";

type Props = { slug: string; enabled: boolean; canEdit: boolean };

/** One organisation-wide switch that saves as it is flipped, and flips back when saving fails. */
function SettingSwitch({ label, description, enabled, canEdit, save, className }: { label: string; description: (on: boolean) => string; enabled: boolean; canEdit: boolean; save: (next: boolean) => Promise<ActionResult>; className?: string }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <SwitchRow
        label={label}
        description={description(on)}
        checked={on}
        disabled={!canEdit || pending}
        onCheckedChange={(checked) => {
          const next = checked === true;
          setOn(next);
          startTransition(async () => {
            const result = await save(next);
            if (!result.ok) { setOn(!next); setError(result.error); return; }
            setError(null);
            router.refresh();
          });
        }}
      />
    </div>
  );
}

/** Whether members sign in to their own portal, or the organisation just keeps their records. */
export function MemberPortalSwitch({ slug, enabled, canEdit }: Props) {
  return (
    <SettingSwitch
      label="Members can sign in to their own account"
      description={(on) => on
        ? "Members see their memberships, pay, renew, download receipts and cards, ask for refunds and manage their details."
        : "Off: you keep members' records and payments yourselves. Members can't sign in for this organisation; payment emails carry a secure pay link, and scanning a member's card still shows whether they're current."}
      enabled={enabled}
      canEdit={canEdit}
      save={(next) => setMemberPortal({ organisationSlug: slug, enabled: next })}
    />
  );
}

/** Whether members may add or replace the photo on their own card from their account. */
export function MemberPhotoUploadSwitch({ slug, enabled, canEdit, portal }: Props & { portal: boolean }) {
  return (
    <SettingSwitch
      className="mt-4"
      label="Members can add their own photo"
      description={(on) => `${on
        ? "Members upload or replace the photo printed on their card from their account. Your team can still change it."
        : "Off: only your team adds member photos."}${portal ? "" : " Applies while members can sign in to their own account."}`}
      enabled={enabled}
      canEdit={canEdit}
      save={(next) => setMemberPhotoUpload({ organisationSlug: slug, enabled: next })}
    />
  );
}
