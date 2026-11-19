import { Mail } from "lucide-react";
import { VerifyEmailForm } from "@/components/account/VerifyEmailForm";
import { Callout } from "@/components/ui/display";
import { inviteReturnPath } from "@/lib/inviteLink";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify email", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; next?: string | string[] }>;
}) {
  const { token, next } = await searchParams;
  const safeToken = typeof token === "string" ? token : "";
  return (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-5 rounded-xl border border-line bg-panel p-6 text-center sm:p-8">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-xl bg-sw-citron text-sw-ink [&_svg]:size-6">
        <Mail />
      </span>
      <h1 className="text-h1 text-ink">Confirm your email</h1>
      {safeToken ? (
        <VerifyEmailForm token={safeToken} next={inviteReturnPath(typeof next === "string" ? next : null) ?? undefined} />
      ) : (
        <Callout tone="danger" role="alert" className="w-full text-left">This verification link is invalid or has expired.</Callout>
      )}
    </div>
  );
}
