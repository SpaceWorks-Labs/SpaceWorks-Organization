import { loadJoinOrganisationView } from "@/lib/views/app__join__org__token__page";
import { AcceptInviteButton } from "@/components/invites/AcceptInviteButton";
import { InviteSignup } from "@/components/invites/InviteSignup";
import { SwitchAccount } from "@/components/invites/SwitchAccount";
import { Link2Off } from "lucide-react";
import { Chip, OrgLogo } from "@/components/ui/display";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Join organisation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function JoinOrganisationPage({ params }: { params: Promise<{ token: string; }>; }) {
  const { token, session, invite, providers, singleSignOn, passwordEnabled } = await loadJoinOrganisationView({ params });
  if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) {
    return (
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
        <span aria-hidden className="flex size-13 items-center justify-center rounded-xl bg-muted text-ink-secondary [&_svg]:size-6"><Link2Off /></span>
        <h1 className="text-h1 text-ink">Invite unavailable</h1>
        <p className="text-body-ui text-ink-secondary">This invite is invalid, has expired, or has been used or revoked. Ask whoever sent it for a new one.</p>
      </div>
    );
  }
  const signedIn = !!session?.user?.id;
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-4 rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
      <OrgLogo name={invite.organisation.name} src={invite.organisation.logoUrl} size="lg" />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-ink-muted">You’ve been invited to join</p>
        <h1 className="text-h1 break-words text-ink">{invite.organisation.name}</h1>
      </div>
      <Chip>as {invite.unit ? `${invite.orgRole.name} · ${invite.unit.name}` : invite.orgRole.name}</Chip>
      {signedIn ? (
        <>
          <p className="text-body-ui text-ink-secondary">Accept this single-use invitation to join the team.</p>
          <AcceptInviteButton token={token} />
          {session?.user?.email ? <SwitchAccount token={token} email={session.user.email} /> : null}
        </>
      ) : (
        <>
          <p className="text-body-ui text-ink-secondary">
            {invite.email ? `Only ${invite.email} can accept this single-use invitation. Create an account or sign in with that address to join the team.` : "Create an account or sign in to accept this single-use invitation and join the team."}
          </p>
          <InviteSignup token={token} lockedEmail={invite.email} providers={providers} singleSignOn={singleSignOn} passwordEnabled={passwordEnabled} />
        </>
      )}
    </div>
  );
}
