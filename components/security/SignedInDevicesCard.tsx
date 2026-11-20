"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";
import { SecurityList, SecurityRow } from "./SecurityRow";
import { revokeSession } from "@/app/actions/sessions";
import { formatDate, formatRelativeTime, viewerTimeZone } from "@/lib/format/datetime";

export type SignedInDevice = { id: string; current: boolean; label: string; ipPrefix: string | null; method: string; createdAt: string; lastSeenAt: string };

const METHOD_NAMES: Record<string, string> = {
  password: "Password", google: "Google", apple: "Apple", github: "GitHub", oidc: "Single sign-on", saml: "Single sign-on",
  supabase: "Supabase", firebase: "Firebase", passkey: "Passkey", phone: "Phone code",
};

const subscribe = () => () => {};

/** Where this account is signed in: a label, the method, a rough place and when it was last used. Never a full address. */
export function SignedInDevicesCard({ devices }: { devices: SignedInDevice[] }) {
  const router = useRouter();
  const timeZone = useSyncExternalStore(subscribe, viewerTimeZone, () => null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function end(device: SignedInDevice) {
    startTransition(async () => {
      setError(null);
      let result;
      try { result = await revokeSession({ sessionId: device.id }); }
      catch { setError("Signed-in devices are temporarily unavailable. Please try again."); return; }
      if (!result.ok) { setError(result.error); router.refresh(); return; }
      if (result.data?.current) await signOut({ callbackUrl: "/login" });
      else router.refresh();
    });
  }

  return (
    <AccountCard id="signed-in-devices" title="Signed-in devices" description="Browsers and devices that are signed in to this account. Sign out any you don't recognise.">
      <div className="flex flex-col gap-4">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SecurityList>
          {devices.map((device) => (
            <SecurityRow
              key={device.id}
              icon={<Laptop />}
              title={<>{device.label}{device.current ? <Chip size="sm" tone="success">This device</Chip> : null}</>}
              description={
                <>
                  Signed in with {METHOD_NAMES[device.method] ?? "a linked method"}
                  {device.ipPrefix ? `, from ${device.ipPrefix}.*` : ""}
                  {" · "}
                  <time dateTime={device.lastSeenAt}>last active {timeZone ? formatRelativeTime(device.lastSeenAt, timeZone) : formatDate(device.lastSeenAt, "UTC")}</time>
                </>
              }
              actions={
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => end(device)} aria-label={device.current ? "Sign out of this device" : `Sign out of ${device.label}`}>
                  Sign out
                </Button>
              }
            />
          ))}
          {devices.length === 0 ? <li className="px-4 py-3 text-body-ui text-ink-muted">No signed-in devices are recorded yet.</li> : null}
        </SecurityList>
      </div>
    </AccountCard>
  );
}
