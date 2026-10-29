import { loadJoinOrganisationView } from "@/lib/views/app__join__org__token__page";
import { AcceptInviteButton } from "@/components/invites/AcceptInviteButton";
import { Chip, OrgLogo } from "@/components/ui/display";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Join organisation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function JoinOrganisationPage({ params }: { params: Promise<{ token: string; }>; }) {
  const { token, session, invite } = await loadJoinOrganisationView({ params });
  if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-2 rounded-2xl border border-line bg-canvas p-6 text-center shadow-raised sm:p-8">
        <h1 className="text-h1 text-ink">Invite unavailable</h1>
        <p className="text-body-ui text-ink-secondary">This invite is invalid, expired, used, or revoked.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center gap-4 rounded-2xl border border-line bg-canvas p-6 text-center shadow-raised sm:p-8">
      <OrgLogo name={invite.organisation.name} src={invite.organisation.logoUrl} size="lg" />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-ink-muted">You’ve been invited to join</p>
        <h1 className="text-h1 break-words text-ink">{invite.organisation.name}</h1>
      </div>
      <Chip size="sm">{invite.unit ? `${invite.orgRole.name} · ${invite.unit.name}` : invite.orgRole.name}</Chip>
      <p className="text-body-ui text-ink-secondary">Accept this single-use invitation to join the team.</p>
      <div className="w-full [&>div]:items-stretch [&_button]:w-full">
        <AcceptInviteButton token={token} />
      </div>
      {session.user?.email ? <p className="text-caption text-ink-muted">Signed in as {session.user.email}</p> : null}
    </div>
  );
}
