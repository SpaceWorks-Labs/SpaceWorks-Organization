import { providerRequest, SmsProviderError, statusError, type SmsSender } from "./types";

export type Msg91Fields = {
  authKey: string;
  templateId: string;
  /** The DLT-registered sender id (India). Optional: the template's own is used when blank. */
  senderId?: string;
};

const ENDPOINT = "https://control.msg91.com/api/v5/flow/";

/**
 * MSG91's Flow API. The message text is the operator's DLT-registered template, which takes the variables `otp`
 * and `brand`; MSG91 has no idempotency key, so de-duplication is the outbox's own claim. MSG91 wants the number
 * without the plus.
 */
export function msg91Sender(fields: Msg91Fields): SmsSender {
  return {
    async send(message) {
      const { status, json } = await providerRequest(ENDPOINT, {
        headers: { authkey: fields.authKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          template_id: fields.templateId,
          ...(fields.senderId ? { sender: fields.senderId } : {}),
          short_url: "0",
          recipients: [{ mobiles: message.to.replace(/^\+/, ""), otp: message.code, brand: message.brand }],
        }),
      });
      const body = json as { type?: unknown; message?: unknown } | null;
      // MSG91 answers 200 with type "error" for refusals; "message" carries the request id on success.
      if (status === 200 && body?.type === "success" && typeof body.message === "string" && body.message) return { providerRef: body.message };
      if (status === 200) throw new SmsProviderError("MSG91 refused the message. Check the template and sender id.", false, status);
      throw statusError("MSG91", status);
    },
  };
}
