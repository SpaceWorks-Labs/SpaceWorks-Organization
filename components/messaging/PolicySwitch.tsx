"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMessagingPolicy } from "@/app/actions/messaging-channels";
import { Callout } from "@/components/ui/display";
import { SwitchRow } from "@/components/ui/choice";

export function PolicySwitch({ allowed }: { allowed: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(allowed);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <SwitchRow
        label="Let organisations use the platform's channels"
        description="Members still choose, per organisation, whether to get messages on a channel."
        checked={on}
        disabled={pending}
        onCheckedChange={(next) => start(async () => {
          const result = await saveMessagingPolicy({ allowOrganisations: next });
          if (result.ok) { setOn(next); setError(null); router.refresh(); } else setError(result.error);
        })}
      />
    </div>
  );
}
