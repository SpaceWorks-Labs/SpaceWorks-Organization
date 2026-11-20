"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { KeyRound, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { SecurityList, SecurityRow } from "./SecurityRow";
import { beginLinkSignInMethod, unlinkSignInMethod } from "@/app/actions/sign-in-methods";

export type LinkedMethod = { id: string; provider: string; label: string; available: boolean; canRemove: boolean };
export type LinkableOption = { provider: string; label: string; kind: "oauth" | "saml" | "bridge"; href: string | null };

const BACK = "/account/security";
const LINK_MESSAGES: Record<string, string> = {
  not_requested: "That sign-in wasn't started from this page, so nothing was added. To switch accounts, sign out first.",
  identity_linked_elsewhere: "That account is already linked to a different person here, so it can't be added to yours.",
  super_admin_password_only: "Super-admin accounts sign in with a password only.",
  link_failed: "That sign-in method could not be added. Try again.",
};

type Outcome = { ok: boolean; error?: string } | void;

/**
 * Every way to sign in to this account: the password, each linked identity (with Remove) and the methods that can be
 * added. Adding goes through a server action that sets a short-lived signed intent, then the provider's own sign-in.
 * Removing the last working way is refused on the server. Passkeys and phone codes have their own cards.
 */
export function SignInMethodsCard({ hasPassword, linked, linkable, linkNotice }: { hasPassword: boolean; linked: LinkedMethod[]; linkable: LinkableOption[]; linkNotice?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LinkedMethod | null>(null);
  const notice = linkNotice ? LINK_MESSAGES[linkNotice] : undefined;

  function run(task: () => Promise<Outcome>) {
    startTransition(async () => {
      setError(null);
      try {
        const result = await task();
        if (result && !result.ok) setError(result.error ?? "That did not work. Please try again.");
      } catch {
        setError("Sign-in methods are temporarily unavailable. Please try again.");
      }
    });
  }

  function add(option: LinkableOption) {
    run(async () => {
      const started = await beginLinkSignInMethod({ provider: option.provider });
      if (!started.ok) return started;
      if (option.kind === "oauth") await signIn(option.provider, { callbackUrl: BACK });
      else window.location.assign(option.href ?? BACK);
    });
  }

  function remove(method: LinkedMethod) {
    run(async () => {
      const result = await unlinkSignInMethod({ accountId: method.id });
      if (result.ok) router.refresh();
      return result;
    });
  }

  return (
    <AccountCard id="sign-in-methods" title="Sign-in methods" description="The ways you can sign in to this account. You always keep at least one.">
      <div className="flex flex-col gap-4">
        {notice ? <Callout tone="warning" role="status">{notice}</Callout> : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SecurityList>
          <SecurityRow
            icon={<KeyRound />}
            title="Email and password"
            description={hasPassword ? "You can sign in with your email address and password." : "No password set. Add one in the Password section above."}
            status={hasPassword ? <Chip size="sm" tone="success">Set</Chip> : <Chip size="sm" tone="neutral">Not set</Chip>}
          />
          {linked.map((method) => (
            <SecurityRow
              key={method.id}
              icon={<Link2 />}
              title={method.label}
              description={method.available ? "Linked account. Its own security settings apply." : "Linked, but not switched on here at the moment."}
              status={<Chip size="sm" tone={method.available ? "success" : "neutral"}>{method.available ? "Connected" : "Unavailable"}</Chip>}
              actions={
                <Button size="sm" variant="danger" disabled={pending || !method.canRemove} title={method.canRemove ? undefined : "Add another way to sign in first"} aria-label={`Remove ${method.label}`} onClick={() => setRemoving(method)}>
                  Remove
                </Button>
              }
            />
          ))}
        </SecurityList>
        {linkable.length > 0 ? (
          <div role="group" aria-labelledby="add-sign-in-method" className="flex flex-col gap-2">
            <p id="add-sign-in-method" className="text-label text-ink">Add a sign-in method</p>
            <div className="flex flex-wrap gap-2">
              {linkable.map((option) => (
                <Button key={option.provider} size="sm" variant="secondary" startIcon={<Plus />} disabled={pending} onClick={() => add(option)}>{option.label}</Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <ConfirmationDialog
        open={removing !== null}
        title={`Remove ${removing?.label ?? "this sign-in method"}?`}
        message="You won't be able to sign in with it any more. You can add it again later from this page."
        confirmLabel="Remove sign-in method"
        loading={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing) remove(removing); setRemoving(null); }}
      />
    </AccountCard>
  );
}
