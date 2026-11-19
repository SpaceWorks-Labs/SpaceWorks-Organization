import { attachmentsOf, formatFrom, outboxKey, postJson, recipientsOf, statusError, type Mailer } from "./types";

const ENDPOINT = "https://api.postmarkapp.com/email";

/** Postmark error codes for a recipient it will not send to (invalid address, or inactive after a bounce or complaint). */
const RECIPIENT_REFUSED = new Set([300, 400, 406]);

/**
 * Postmark's REST API. Postmark has no idempotency key, so the outbox id travels as metadata (to trace a
 * duplicate) and de-duplication is the outbox's own claim: a row is marked sent the moment this returns.
 */
export function postmarkMailer(serverToken: string, messageStream: string): Mailer {
  return {
    async sendMail(options) {
      const to = recipientsOf(options.to);
      const key = outboxKey(options.messageId);
      const attachments = attachmentsOf(options).map((item) => ({ Name: item.filename, Content: item.content, ContentType: item.contentType ?? "application/octet-stream" }));
      const { status, json } = await postJson(ENDPOINT, { "x-postmark-server-token": serverToken }, {
        From: formatFrom(options.from),
        To: to.join(","),
        Subject: options.subject,
        TextBody: options.text,
        HtmlBody: options.html,
        MessageStream: messageStream || "outbound",
        ...(options.replyTo ? { ReplyTo: formatFrom(options.replyTo) } : {}),
        ...(key ? { Metadata: { outbox: key } } : {}),
        ...(attachments.length ? { Attachments: attachments } : {}),
      });
      const code = (json as { ErrorCode?: number } | null)?.ErrorCode;
      if (status === 200 && (code === undefined || code === 0)) return { accepted: to, rejected: [] };
      if (status === 422 && code !== undefined && RECIPIENT_REFUSED.has(code)) return { accepted: [], rejected: to };
      throw statusError("Postmark", status);
    },
  };
}
