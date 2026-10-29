import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function loadJoinOrganisationView({ params }: { params: Promise<{ token: string; }>; }) {

  const { token } = await params;
  const session = await auth();
  const joinUrl = `/join/org/${encodeURIComponent(token)}`;
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(joinUrl)}`);
  const invite = await prisma.teamInvite.findUnique({
    where: { token },
    select: { usedAt: true, expiresAt: true, orgRole: { select: { name: true } }, unit: { select: { name: true } }, organisation: { select: { name: true, logoUrl: true } } },
  });

  return { token, session, invite };
}
