import { attachmentsOf, formatFrom, outboxKey, postJson, recipientsOf, statusError, type Mailer } from "./types";

const ENDPOINT = "https://api.resend.com/emails";

/** Resend's REST API. The outbox id is the Idempotency-Key, so a retry after acceptance never sends twice. */
export function resendMailer(apiKey: string): Mailer {
  return {
    async sendMail(options) {
      const to = recipientsOf(options.to);
      const key = outboxKey(options.messageId);
      const attachments = attachmentsOf(options).map(({ filename, content }) => ({ filename, content }));
      const { status } = await postJson(ENDPOINT, { authorization: `Bearer ${apiKey}`, ...(key ? { "idempotency-key": key } : {}) }, {
        from: formatFrom(options.from),
        to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        ...(options.replyTo ? { reply_to: formatFrom(options.replyTo) } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      if (status >= 200 && status < 300) return { accepted: to, rejected: [] };
      // 409 means the same key is still being processed: the first attempt already has the message.
      if (status === 409) return { accepted: to, rejected: [] };
      if (status === 422) return { accepted: [], rejected: to };
      throw statusError("Resend", status);
    },
  };
}
