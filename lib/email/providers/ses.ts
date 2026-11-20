import MailComposer from "nodemailer/lib/mail-composer";
import { addressOf, EmailProviderError, postJson, recipientsOf, statusError, type Mailer } from "./types";
import { signV4 } from "./sigv4";

export type SesCredentials = { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export const SES_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d$/;

/**
 * Amazon SES v2 SendEmail, signed with SigV4 and sent as a raw message (so attachments work). SES has no
 * idempotency key: de-duplication is the outbox's claim. The host is built from a validated region, never typed.
 */
export function sesMailer(credentials: SesCredentials): Mailer {
  if (!SES_REGION.test(credentials.region)) throw new EmailProviderError("Enter an AWS region such as eu-west-1.", false);
  const host = `email.${credentials.region}.amazonaws.com`;
  return {
    async sendMail(options) {
      const to = recipientsOf(options.to);
      const raw = await new MailComposer(options).compile().build();
      const body = JSON.stringify({ FromEmailAddress: addressOf(options.from), Destination: { ToAddresses: to }, Content: { Raw: { Data: raw.toString("base64") } } });
      const headers = signV4({ method: "POST", host, path: "/v2/email/outbound-emails", body, ...credentials, service: "ses" });
      const { status } = await postJson(`https://${host}/v2/email/outbound-emails`, headers, body);
      if (status >= 200 && status < 300) return { accepted: to, rejected: [] };
      throw statusError("Amazon SES", status);
    },
  };
}
