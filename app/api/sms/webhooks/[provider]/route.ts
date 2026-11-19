import { handleSmsWebhook } from "@/lib/sms/webhooks/handle";

export const dynamic = "force-dynamic";

/** Delivery reports from Twilio (signed) and MSG91 (secret token in the address). Verified before anything is read. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handleSmsWebhook((await params).provider, request);
}
