import { handleEmailWebhook } from "@/lib/email/webhooks/handle";

export const dynamic = "force-dynamic";

/** Bounce and complaint reports from Resend, Postmark and Amazon SES (via SNS). Verified before anything is read. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handleEmailWebhook((await params).provider, request);
}
