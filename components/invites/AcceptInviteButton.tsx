"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOrganisationInvite } from "@/app/actions/invite-acceptance";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

export function AcceptInviteButton(props: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col gap-3">
      {error ? <Callout tone="danger" role="alert" className="text-left">{error}</Callout> : null}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Accepting…"
        onClick={() => startTransition(async () => {
          setError(null);
          const result = await acceptOrganisationInvite(props.token);
          if (!result.ok || !result.data) {
            setError(result.ok ? "This invite is unavailable." : result.error);
            return;
          }
          router.replace(result.data.href);
          router.refresh();
        })}
      >
        Accept invite
      </Button>
    </div>
  );
}
