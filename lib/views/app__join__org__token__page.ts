import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginPageMethods } from "@/lib/loginMethods";

/** The staff invite page: open to signed-out visitors, who are offered an account or a sign-in for this invite. */
export async function loadJoinOrganisationView({ params }: { params: Promise<{ token: string; }>; }) {
  await connection();
  const { token } = await params;
  const session = await auth();
  const invite = await prisma.teamInvite.findUnique({
    where: { token },
    select: { email: true, usedAt: true, expiresAt: true, orgRole: { select: { name: true } }, unit: { select: { name: true } }, organisation: { select: { name: true, logoUrl: true } } },
  });
  const methods = session?.user?.id || !invite ? { passwordEnabled: true, providers: [], singleSignOn: [] } : await loginPageMethods();
  return { token, session, invite, providers: methods.providers, singleSignOn: methods.singleSignOn, passwordEnabled: methods.passwordEnabled };
}
